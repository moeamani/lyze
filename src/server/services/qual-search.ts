import { and, desc, eq, gte, ilike, inArray, isNotNull, lte, not } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { answers, codeApplications, codes, memos, participants, researchSessions, responses, segments, studies, transcripts } from "@/server/db/schema";
import { likePattern, parseQuery, snippet } from "@/lib/qual/search";
import { subtreeIds } from "@/lib/qual/codes";
import type { Range } from "@/lib/qual/ranges";
import { docKey, listDocuments } from "./qual-docs";

export const searchSchema = z.object({
  q: z.string().trim().max(200).default(""),
  kinds: z.array(z.enum(["segment", "answer", "memo"])).default(["segment", "answer", "memo"]),
  studyId: z.string().max(64).nullish(),
  participantId: z.string().max(64).nullish(),
  codeId: z.string().max(64).nullish(),
  from: z.coerce.date().nullish(),
  to: z.coerce.date().nullish(),
});
export type SearchInput = z.input<typeof searchSchema>;

export type SearchHit = {
  kind: "segment" | "answer" | "memo";
  id: string;
  snippet: { text: string; hits: Range[]; clippedStart: boolean; clippedEnd: boolean };
  docKey: string | null;
  title: string;
  studyName: string;
  who: string | null;
  date: Date | null;
  startMs: number | null;
  codeIds: string[];
};

const LIMIT = 200;

/**
 * Search transcripts, open-text answers and memos in a project. All terms must appear
 * (phrases in quotes, `-word` to exclude); filters narrow by study, participant, code and date.
 */
export async function searchProject(workspaceId: string, projectId: string, raw: SearchInput): Promise<{ hits: SearchHit[]; truncated: boolean }> {
  const input = searchSchema.parse(raw);
  const query = parseQuery(input.q);
  if (!query.terms.length && !input.codeId && !input.participantId) return { hits: [], truncated: false };

  const projectStudies = await db.select({ id: studies.id, name: studies.name }).from(studies).where(and(eq(studies.workspaceId, workspaceId), eq(studies.projectId, projectId)));
  const studyIds = (input.studyId ? projectStudies.filter((s) => s.id === input.studyId) : projectStudies).map((s) => s.id);
  const studyName = new Map(projectStudies.map((s) => [s.id, s.name]));
  if (!studyIds.length) return { hits: [], truncated: false };

  const textConds = (col: typeof segments.text | typeof memos.body) => [...query.terms.map((t) => ilike(col, likePattern(t))), ...query.exclude.map((t) => not(ilike(col, likePattern(t))))];

  // Units carrying the code (or one of its children), when filtering by code.
  let codedSegments: Set<string> | null = null;
  let codedAnswers: Set<string> | null = null;
  if (input.codeId) {
    const all = await db.select({ id: codes.id, parentId: codes.parentId, name: codes.name, position: codes.position }).from(codes).where(eq(codes.projectId, projectId));
    const ids = [...subtreeIds(all, input.codeId)];
    const apps = await db
      .select({ segmentId: codeApplications.segmentId, answerId: codeApplications.answerId })
      .from(codeApplications)
      .where(and(eq(codeApplications.projectId, projectId), inArray(codeApplications.codeId, ids), isNotNull(codeApplications.approvedAt)));
    codedSegments = new Set(apps.map((a) => a.segmentId).filter((x): x is string => !!x));
    codedAnswers = new Set(apps.map((a) => a.answerId).filter((x): x is string => !!x));
  }

  const hits: SearchHit[] = [];
  let truncated = false;

  if (input.kinds.includes("segment")) {
    const rows = await db
      .select({ seg: segments, speakers: transcripts.speakers, session: researchSessions })
      .from(segments)
      .innerJoin(transcripts, and(eq(transcripts.id, segments.transcriptId), eq(transcripts.status, "ready")))
      .innerJoin(researchSessions, eq(researchSessions.id, transcripts.sessionId))
      .where(
        and(
          inArray(researchSessions.studyId, studyIds),
          ...textConds(segments.text),
          input.from ? gte(researchSessions.scheduledAt, input.from) : undefined,
          input.to ? lte(researchSessions.scheduledAt, input.to) : undefined,
        ),
      )
      .orderBy(desc(researchSessions.scheduledAt), segments.position)
      .limit(2000);
    for (const r of rows) {
      if (codedSegments && !codedSegments.has(r.seg.id)) continue;
      const sp = r.seg.speaker ? r.speakers[r.seg.speaker] : undefined;
      if (input.participantId && sp?.participantId !== input.participantId) continue;
      hits.push({
        kind: "segment",
        id: r.seg.id,
        snippet: snippet(r.seg.text, query.terms),
        docKey: docKey({ kind: "session", sessionId: r.session.id }),
        title: r.session.title,
        studyName: studyName.get(r.session.studyId) ?? "",
        who: sp?.name ?? null,
        date: r.session.scheduledAt,
        startMs: r.seg.startMs,
        codeIds: [],
      });
    }
  }

  // Survey answers aren't linked to participants (yet), so a participant filter skips them.
  if (input.kinds.includes("answer") && !input.participantId) {
    const rows = await db
      .select({ answer: answers, response: responses })
      .from(answers)
      .innerJoin(responses, eq(responses.id, answers.responseId))
      .where(
        and(
          inArray(responses.studyId, studyIds),
          isNotNull(answers.text),
          ...textConds(answers.text as unknown as typeof segments.text),
          input.from ? gte(responses.submittedAt, input.from) : undefined,
          input.to ? lte(responses.submittedAt, input.to) : undefined,
        ),
      )
      .orderBy(desc(responses.submittedAt))
      .limit(2000);
    if (rows.length) {
      const docs = await listDocuments(workspaceId, projectId);
      const titleOf = new Map(docs.filter((d) => d.ref.kind === "question").map((d) => [d.key, d.title]));
      for (const r of rows) {
        if (codedAnswers && !codedAnswers.has(r.answer.id)) continue;
        const key = docKey({ kind: "question", studyId: r.response.studyId, questionId: r.answer.questionId });
        if (!titleOf.has(key)) continue; // not an open-text question
        hits.push({
          kind: "answer",
          id: r.answer.id,
          snippet: snippet(r.answer.text ?? "", query.terms),
          docKey: key,
          title: titleOf.get(key)!,
          studyName: studyName.get(r.response.studyId) ?? "",
          who: null,
          date: r.response.submittedAt ?? r.response.startedAt,
          startMs: null,
          codeIds: [],
        });
      }
    }
  }

  if (input.kinds.includes("memo") && !input.codeId && !input.participantId && query.terms.length) {
    const rows = await db
      .select()
      .from(memos)
      .where(and(eq(memos.projectId, projectId), ...textConds(memos.body), input.from ? gte(memos.updatedAt, input.from) : undefined, input.to ? lte(memos.updatedAt, input.to) : undefined))
      .orderBy(desc(memos.updatedAt))
      .limit(200);
    for (const m of rows) {
      hits.push({ kind: "memo", id: m.id, snippet: snippet(m.body, query.terms), docKey: null, title: m.title ?? "", studyName: "", who: null, date: m.updatedAt, startMs: null, codeIds: [] });
    }
  }

  if (hits.length > LIMIT) {
    truncated = true;
    hits.length = LIMIT;
  }

  // Which codes each hit already carries (to show chips).
  const segIds = hits.filter((h) => h.kind === "segment").map((h) => h.id);
  const ansIds = hits.filter((h) => h.kind === "answer").map((h) => h.id);
  if (segIds.length || ansIds.length) {
    const apps = await db
      .select({ codeId: codeApplications.codeId, segmentId: codeApplications.segmentId, answerId: codeApplications.answerId })
      .from(codeApplications)
      .where(
        and(
          eq(codeApplications.projectId, projectId),
          isNotNull(codeApplications.approvedAt),
          segIds.length && ansIds.length
            ? undefined
            : segIds.length
              ? inArray(codeApplications.segmentId, segIds)
              : inArray(codeApplications.answerId, ansIds),
        ),
      );
    for (const h of hits) {
      const own = apps.filter((a) => (h.kind === "segment" ? a.segmentId === h.id : a.answerId === h.id)).map((a) => a.codeId);
      h.codeIds = [...new Set(own)];
    }
  }
  return { hits, truncated };
}

/** Participants across the project's studies, for the search filter. */
export async function projectParticipants(projectId: string) {
  return db
    .select({ id: participants.id, code: participants.code, studyId: participants.studyId })
    .from(participants)
    .innerJoin(studies, eq(studies.id, participants.studyId))
    .where(eq(studies.projectId, projectId))
    .orderBy(participants.code);
}
