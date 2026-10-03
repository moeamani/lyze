import { and, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { userHandle } from "@/server/db/user-handle";
import {
  answers,
  codeApplications,
  codes,
  participants,
  researchSessions,
  responses,
  segments,
  studies,
  transcripts,
  users,
} from "@/server/db/schema";
import { normalizeRange, relocate } from "@/lib/qual/ranges";
import { subtreeIds } from "@/lib/qual/codes";
import { AppError } from "./errors";
import { getCode } from "./codebook";
import { loadUnit, requireProject, type UnitKind } from "./qual-docs";

const unitKind = z.enum(["segment", "answer"]);

export const applySchema = z.object({
  codeId: z.string().min(1).max(64),
  unitKind,
  unitId: z.string().min(1).max(64),
  start: z.number().int().min(0),
  end: z.number().int().min(0),
});

/** Code a passage. Applying the same code to the exact same passage twice is a no-op. */
export async function applyCode(userId: string, workspaceId: string, projectId: string, raw: z.input<typeof applySchema>) {
  await requireProject(userId, workspaceId, projectId, "content:analyze");
  const input = applySchema.parse(raw);
  await getCode(projectId, input.codeId);
  const unit = await loadUnit(workspaceId, projectId, input.unitKind, input.unitId);
  const range = normalizeRange(unit.text, input.start, input.end);
  if (!range) throw new AppError("invalid");
  const target = input.unitKind === "segment" ? { segmentId: unit.id } : { answerId: unit.id };
  const [dupe] = await db
    .select()
    .from(codeApplications)
    .where(
      and(
        eq(codeApplications.codeId, input.codeId),
        input.unitKind === "segment" ? eq(codeApplications.segmentId, unit.id) : eq(codeApplications.answerId, unit.id),
        eq(codeApplications.start, range.start),
        eq(codeApplications.end, range.end),
      ),
    )
    .limit(1);
  if (dupe) {
    // Accepting by re-applying: a pending suggestion becomes a confirmed coding.
    if (!dupe.approvedAt) await db.update(codeApplications).set({ approvedAt: new Date() }).where(eq(codeApplications.id, dupe.id));
    return { ...dupe, approvedAt: dupe.approvedAt ?? new Date() };
  }
  const [row] = await db
    .insert(codeApplications)
    .values({ workspaceId, projectId, codeId: input.codeId, ...target, start: range.start, end: range.end, quote: unit.text.slice(range.start, range.end), source: "human", approvedAt: new Date(), createdById: userId })
    .returning();
  return row!;
}

async function getApplication(projectId: string, id: string) {
  const [row] = await db.select().from(codeApplications).where(and(eq(codeApplications.id, id), eq(codeApplications.projectId, projectId))).limit(1);
  if (!row) throw new AppError("notFound");
  return row;
}

export async function removeCoding(userId: string, workspaceId: string, projectId: string, id: string) {
  await requireProject(userId, workspaceId, projectId, "content:analyze");
  await getApplication(projectId, id);
  await db.delete(codeApplications).where(eq(codeApplications.id, id));
}

export async function setStarred(userId: string, workspaceId: string, projectId: string, id: string, starred: boolean) {
  await requireProject(userId, workspaceId, projectId, "content:analyze");
  await getApplication(projectId, id);
  await db.update(codeApplications).set({ starred }).where(eq(codeApplications.id, id));
}

/** Accept or reject AI suggestions (one, or all pending ones in the given ids). */
export async function reviewSuggestions(userId: string, workspaceId: string, projectId: string, ids: string[], accept: boolean) {
  await requireProject(userId, workspaceId, projectId, "content:analyze");
  if (!ids.length) return 0;
  const where = and(eq(codeApplications.projectId, projectId), inArray(codeApplications.id, ids), isNull(codeApplications.approvedAt));
  if (accept) {
    const rows = await db.update(codeApplications).set({ approvedAt: new Date(), createdById: userId }).where(where).returning({ id: codeApplications.id });
    return rows.length;
  }
  const rows = await db.delete(codeApplications).where(where).returning({ id: codeApplications.id });
  return rows.length;
}

export type DocCoding = {
  id: string;
  codeId: string;
  unitId: string;
  start: number;
  end: number;
  quote: string;
  pending: boolean;
  reason: string | null;
  starred: boolean;
  authorName: string | null;
};

/** Codings (and pending suggestions) inside the given units. */
export async function codingsForUnits(projectId: string, kind: UnitKind, unitIds: string[]): Promise<DocCoding[]> {
  if (!unitIds.length) return [];
  const col = kind === "segment" ? codeApplications.segmentId : codeApplications.answerId;
  const rows = await db
    .select({ a: codeApplications, authorName: users.name, authorEmail: userHandle })
    .from(codeApplications)
    .leftJoin(users, eq(users.id, codeApplications.createdById))
    .where(and(eq(codeApplications.projectId, projectId), inArray(col, unitIds)));
  return rows.map(({ a, authorName, authorEmail }) => ({
    id: a.id,
    codeId: a.codeId,
    unitId: (kind === "segment" ? a.segmentId : a.answerId)!,
    start: a.start,
    end: a.end,
    quote: a.quote,
    pending: !a.approvedAt,
    reason: a.reason,
    starred: a.starred,
    authorName: a.source === "ai" && !a.approvedAt ? null : (authorName ?? authorEmail?.split("@")[0] ?? null),
  }));
}

/**
 * After a transcript segment's text changes, move its codings to where their quotes are now;
 * codings whose quote no longer exists are removed. Returns how many were removed.
 */
export async function relocateSegmentCodings(executor: Pick<typeof db, "select" | "update" | "delete">, segmentId: string, newText: string) {
  const rows = await executor.select().from(codeApplications).where(eq(codeApplications.segmentId, segmentId));
  let removed = 0;
  for (const a of rows) {
    const r = relocate(newText, a.quote, a.start);
    if (!r) {
      await executor.delete(codeApplications).where(eq(codeApplications.id, a.id));
      removed++;
    } else if (r.start !== a.start || r.end !== a.end) {
      await executor.update(codeApplications).set({ start: r.start, end: r.end }).where(eq(codeApplications.id, a.id));
    }
  }
  return removed;
}

// ── Quote bank ─────────────────────────────────────────────────────────────

export const quoteFilterSchema = z.object({
  codeId: z.string().max(64).nullish(),
  themeId: z.string().max(64).nullish(),
  studyId: z.string().max(64).nullish(),
  participantId: z.string().max(64).nullish(),
  starred: z.boolean().optional(),
  q: z.string().max(200).optional(),
  includeChildren: z.boolean().default(true),
  limit: z.number().int().min(1).max(1000).default(300),
});

export type Quote = {
  id: string;
  quote: string;
  codeIds: string[];
  starred: boolean;
  source: { kind: "session"; sessionId: string; title: string; startMs: number | null } | { kind: "question"; studyId: string; questionId: string; respondent: string };
  studyId: string;
  studyName: string;
  speaker: string | null;
  participantId: string | null;
  participantCode: string | null;
  unitId: string;
  start: number;
  createdAt: Date;
};

/** Every confirmed coded passage, newest first, with where it came from and who said it. */
export async function listQuotes(workspaceId: string, projectId: string, raw: z.input<typeof quoteFilterSchema> = {}): Promise<Quote[]> {
  const f = quoteFilterSchema.parse(raw);
  const all = await db.select({ id: codes.id, parentId: codes.parentId, name: codes.name, position: codes.position, themeId: codes.themeId }).from(codes).where(eq(codes.projectId, projectId));
  let codeFilter: string[] | null = null;
  if (f.codeId) codeFilter = f.includeChildren ? [...subtreeIds(all, f.codeId)] : [f.codeId];
  if (f.themeId) {
    const inTheme = all.filter((c) => c.themeId === f.themeId).flatMap((c) => [...subtreeIds(all, c.id)]);
    codeFilter = codeFilter ? codeFilter.filter((id) => inTheme.includes(id)) : inTheme;
  }
  if (codeFilter && !codeFilter.length) return [];

  const conds = [eq(codeApplications.projectId, projectId), eq(codeApplications.workspaceId, workspaceId), isNotNull(codeApplications.approvedAt)];
  if (codeFilter) conds.push(inArray(codeApplications.codeId, codeFilter));
  if (f.starred) conds.push(eq(codeApplications.starred, true));
  const rows = await db
    .select({
      a: codeApplications,
      seg: { id: segments.id, speaker: segments.speaker, startMs: segments.startMs },
      speakers: transcripts.speakers,
      session: { id: researchSessions.id, title: researchSessions.title, studyId: researchSessions.studyId },
      answer: { id: answers.id, questionId: answers.questionId, responseId: answers.responseId },
      responseStudy: responses.studyId,
    })
    .from(codeApplications)
    .leftJoin(segments, eq(segments.id, codeApplications.segmentId))
    .leftJoin(transcripts, eq(transcripts.id, segments.transcriptId))
    .leftJoin(researchSessions, eq(researchSessions.id, transcripts.sessionId))
    .leftJoin(answers, eq(answers.id, codeApplications.answerId))
    .leftJoin(responses, eq(responses.id, answers.responseId))
    .where(and(...conds))
    .orderBy(desc(codeApplications.createdAt))
    .limit(5000);

  const studyRows = await db.select({ id: studies.id, name: studies.name }).from(studies).where(eq(studies.projectId, projectId));
  const studyName = new Map(studyRows.map((s) => [s.id, s.name]));
  const people = studyRows.length
    ? await db
        .select({ id: participants.id, code: participants.code })
        .from(participants)
        .where(inArray(participants.studyId, studyRows.map((s) => s.id)))
    : [];
  const codeOf = new Map(people.map((p) => [p.id, p.code]));

  // The same passage coded with several codes appears once, with all its codes.
  const merged = new Map<string, Quote>();
  const q = f.q?.trim().toLowerCase();
  for (const r of rows) {
    const studyId = r.session?.studyId ?? r.responseStudy ?? "";
    if (f.studyId && studyId !== f.studyId) continue;
    const sp = r.seg?.speaker && r.speakers ? r.speakers[r.seg.speaker] : undefined;
    const participantId = sp?.participantId ?? null;
    if (f.participantId && participantId !== f.participantId) continue;
    if (q && !r.a.quote.toLowerCase().includes(q)) continue;
    const unitId = r.a.segmentId ?? r.a.answerId ?? "";
    const key = `${unitId}|${r.a.start}|${r.a.end}`;
    const existing = merged.get(key);
    if (existing) {
      existing.codeIds.push(r.a.codeId);
      existing.starred ||= r.a.starred;
      continue;
    }
    merged.set(key, {
      id: r.a.id,
      quote: r.a.quote,
      codeIds: [r.a.codeId],
      starred: r.a.starred,
      source: r.session
        ? { kind: "session", sessionId: r.session.id, title: r.session.title, startMs: r.seg?.startMs ?? null }
        : { kind: "question", studyId, questionId: r.answer?.questionId ?? "", respondent: r.answer?.responseId ?? "" },
      studyId,
      studyName: studyName.get(studyId) ?? "",
      speaker: sp?.name ?? null,
      participantId,
      participantCode: participantId ? (codeOf.get(participantId) ?? null) : null,
      unitId,
      start: r.a.start,
      createdAt: r.a.createdAt,
    });
  }
  return [...merged.values()].slice(0, f.limit);
}

/** Passages of one code with where they come from (codebook detail, splitting). */
export async function codeApplicationsOf(projectId: string, codeId: string) {
  const rows = await db
    .select({
      id: codeApplications.id,
      quote: codeApplications.quote,
      segmentId: codeApplications.segmentId,
      answerId: codeApplications.answerId,
      createdAt: codeApplications.createdAt,
      starred: codeApplications.starred,
      sessionId: researchSessions.id,
      sessionTitle: researchSessions.title,
      speaker: segments.speaker,
      speakers: transcripts.speakers,
      questionId: answers.questionId,
      responseStudyId: responses.studyId,
    })
    .from(codeApplications)
    .leftJoin(segments, eq(segments.id, codeApplications.segmentId))
    .leftJoin(transcripts, eq(transcripts.id, segments.transcriptId))
    .leftJoin(researchSessions, eq(researchSessions.id, transcripts.sessionId))
    .leftJoin(answers, eq(answers.id, codeApplications.answerId))
    .leftJoin(responses, eq(responses.id, answers.responseId))
    .where(and(eq(codeApplications.projectId, projectId), eq(codeApplications.codeId, codeId), isNotNull(codeApplications.approvedAt)))
    .orderBy(desc(codeApplications.createdAt));
  return rows.map((r) => ({
    id: r.id,
    quote: r.quote,
    starred: r.starred,
    createdAt: r.createdAt,
    unitId: (r.segmentId ?? r.answerId)!,
    docKey: r.sessionId ? `s:${r.sessionId}` : `q:${r.responseStudyId}:${r.questionId}`,
    source: r.sessionTitle ?? null,
    who: r.speaker && r.speakers ? (r.speakers[r.speaker]?.name ?? null) : null,
  }));
}

/** Whether the segment or answer belongs to the project (used by memo targets). */
export async function unitBelongs(workspaceId: string, projectId: string, kind: UnitKind, id: string) {
  try {
    await loadUnit(workspaceId, projectId, kind, id);
    return true;
  } catch {
    return false;
  }
}

