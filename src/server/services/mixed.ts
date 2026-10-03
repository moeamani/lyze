import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { answers, codeApplications, participants, researchSessions, responses, segments, sessionParticipants, studies, transcripts } from "@/server/db/schema";
import { summarizeQuestion } from "@/lib/analysis/summary";
import { listCodes } from "./codebook";
import { loadStudyDataset } from "./analysis";

/** Every approved coding in a project, with who said it and in which kind of source. */
async function projectCodings(projectId: string) {
  const [seg, ans] = await Promise.all([
    db
      .select({ codeId: codeApplications.codeId, quote: codeApplications.quote, speaker: segments.speaker, speakers: transcripts.speakers, sessionId: researchSessions.id, studyId: researchSessions.studyId })
      .from(codeApplications)
      .innerJoin(segments, eq(segments.id, codeApplications.segmentId))
      .innerJoin(transcripts, eq(transcripts.id, segments.transcriptId))
      .innerJoin(researchSessions, eq(researchSessions.id, transcripts.sessionId))
      .where(and(eq(codeApplications.projectId, projectId), isNotNull(codeApplications.approvedAt))),
    db
      .select({ codeId: codeApplications.codeId, quote: codeApplications.quote, responseId: answers.responseId, questionId: answers.questionId, studyId: responses.studyId, participantId: responses.participantId })
      .from(codeApplications)
      .innerJoin(answers, eq(answers.id, codeApplications.answerId))
      .innerJoin(responses, eq(responses.id, answers.responseId))
      .where(and(eq(codeApplications.projectId, projectId), isNotNull(codeApplications.approvedAt))),
  ]);
  return {
    qual: seg.map((s) => ({ ...s, participantId: (s.speaker && s.speakers[s.speaker]?.participantId) || null, interviewer: !!s.speaker && s.speakers[s.speaker]?.role === "interviewer" })).filter((s) => !s.interviewer),
    quant: ans,
  };
}

export type Convergence = "both" | "qual" | "quant";
export type JointRow = {
  codeId: string;
  name: string;
  path: string[];
  color: string;
  depth: number;
  qual: { passages: number; people: number; quote: string | null };
  quant: { passages: number; respondents: number; share: number; quote: string | null };
  convergence: Convergence | null;
};

/**
 * The joint display: each code with its weight in conversations (interviews, notes) and in survey
 * answers side by side, so you can see where the two kinds of data agree and where only one speaks.
 */
export async function jointDisplay(workspaceId: string, projectId: string) {
  const [codes, { qual, quant }, [totals]] = await Promise.all([
    listCodes(workspaceId, projectId),
    projectCodings(projectId),
    db
      .select({
        respondents: sql<number>`count(distinct ${responses.id})::int`,
      })
      .from(responses)
      .innerJoin(studies, eq(studies.id, responses.studyId))
      .where(and(eq(studies.projectId, projectId), eq(responses.status, "complete"))),
  ]);
  const respondents = totals?.respondents ?? 0;
  const rows: JointRow[] = codes.map((c) => {
    const q = qual.filter((x) => x.codeId === c.id);
    const a = quant.filter((x) => x.codeId === c.id);
    const people = new Set(q.map((x) => x.participantId ?? `session:${x.sessionId}`)).size;
    const resp = new Set(a.map((x) => x.responseId)).size;
    const convergence: Convergence | null = q.length && a.length ? "both" : q.length ? "qual" : a.length ? "quant" : null;
    return {
      codeId: c.id,
      name: c.name,
      path: c.path,
      color: c.color,
      depth: c.depth,
      qual: { passages: q.length, people, quote: q[0]?.quote ?? null },
      quant: { passages: a.length, respondents: resp, share: respondents ? resp / respondents : 0, quote: a[0]?.quote ?? null },
      convergence,
    };
  });
  const sessions = new Set(qual.map((x) => x.sessionId)).size;
  return { rows, respondents, sessions };
}

/** Survey studies in the project and their closed questions, for the "code × answer" view. */
export async function closedQuestions(workspaceId: string, projectId: string) {
  const surveys = await db.select({ id: studies.id, name: studies.name }).from(studies).where(and(eq(studies.projectId, projectId), eq(studies.workspaceId, workspaceId)));
  const out: { studyId: string; studyName: string; questionId: string; title: string }[] = [];
  for (const s of surveys) {
    const data = await loadStudyDataset(workspaceId, s.id);
    if (!data.rows.length) continue;
    for (const { question, number } of data.questions.values()) {
      const kind = summarizeQuestion(question, number, data.rows.slice(0, 1)).kind;
      if (kind === "choice" || kind === "scale") out.push({ studyId: s.id, studyName: s.name, questionId: question.id, title: question.title });
    }
  }
  return out;
}

export type CrossRow = { codeId: string | null; name: string; color: string | null; n: number; mean: number | null; percents: number[] };

/**
 * How people who raised a code (in their open answers) answered a closed question, next to
 * everyone. Quantitizing the qualitative data: "people who talk about cost rate the café lower".
 */
export async function codeByQuestion(workspaceId: string, projectId: string, studyId: string, questionId: string) {
  const data = await loadStudyDataset(workspaceId, studyId);
  const entry = data.questions.get(questionId);
  if (!entry) return null;
  const all = summarizeQuestion(entry.question, entry.number, data.rows);
  if (all.kind !== "choice" && all.kind !== "scale") return null;
  const labels = (all.categories ?? []).map((c) => c.label);
  const shape = (s: ReturnType<typeof summarizeQuestion>) => {
    const cats = s.kind === "choice" || s.kind === "scale" ? (s.categories ?? []) : [];
    const byLabel = new Map(cats.map((c) => [c.label, c.percent]));
    return { n: s.answered, mean: s.kind === "scale" ? s.stats.mean : null, percents: labels.map((l) => byLabel.get(l) ?? 0) };
  };
  const [codes, { quant }] = await Promise.all([listCodes(workspaceId, projectId), projectCodings(projectId)]);
  const rows: CrossRow[] = [];
  for (const c of codes) {
    const ids = new Set(quant.filter((x) => x.codeId === c.id && x.studyId === studyId).map((x) => x.responseId));
    if (!ids.size) continue;
    const subset = data.rows.filter((r) => ids.has(r.id));
    if (!subset.length) continue;
    rows.push({ codeId: c.id, name: c.path.join(" › "), color: c.color, ...shape(summarizeQuestion(entry.question, entry.number, subset)) });
  }
  return { question: entry.question.title, labels, kind: all.kind, all: { codeId: null, name: "", color: null, ...shape(all) } as CrossRow, rows };
}

export type CaseRow = {
  id: string;
  code: string;
  studyId: string;
  studyName: string;
  attributes: Record<string, string>;
  sessions: number;
  responses: number;
  codes: { id: string; name: string; color: string; count: number }[];
};

/** One row per participant: their attributes, which sources they appear in, and what was coded. */
export async function caseMatrix(workspaceId: string, projectId: string): Promise<CaseRow[]> {
  const people = await db
    .select({ id: participants.id, code: participants.code, studyId: participants.studyId, studyName: studies.name, attributes: participants.attributes })
    .from(participants)
    .innerJoin(studies, eq(studies.id, participants.studyId))
    .where(and(eq(studies.projectId, projectId), eq(participants.workspaceId, workspaceId)));
  if (!people.length) return [];
  const ids = people.map((p) => p.id);
  const [sessionCounts, responseRows, codes, { qual, quant }] = await Promise.all([
    db.select({ id: sessionParticipants.participantId, n: sql<number>`count(*)::int` }).from(sessionParticipants).where(inArray(sessionParticipants.participantId, ids)).groupBy(sessionParticipants.participantId),
    db.select({ id: responses.participantId, n: sql<number>`count(*)::int` }).from(responses).where(and(inArray(responses.participantId, ids), eq(responses.status, "complete"))).groupBy(responses.participantId),
    listCodes(workspaceId, projectId),
    projectCodings(projectId),
  ]);
  const codeById = new Map(codes.map((c) => [c.id, c]));
  const sCount = new Map(sessionCounts.map((r) => [r.id, r.n]));
  const rCount = new Map(responseRows.map((r) => [r.id!, r.n]));
  return people.map((p) => {
    const tally = new Map<string, number>();
    for (const x of [...qual, ...quant]) if (x.participantId === p.id) tally.set(x.codeId, (tally.get(x.codeId) ?? 0) + 1);
    return {
      id: p.id,
      code: p.code,
      studyId: p.studyId,
      studyName: p.studyName,
      attributes: Object.fromEntries(Object.entries((p.attributes ?? {}) as Record<string, unknown>).map(([k, v]) => [k, String(v ?? "")])),
      sessions: sCount.get(p.id) ?? 0,
      responses: rCount.get(p.id) ?? 0,
      codes: [...tally]
        .map(([id, count]) => ({ id, count, name: codeById.get(id)?.name ?? "", color: codeById.get(id)?.color ?? "1" }))
        .filter((c) => c.name)
        .sort((a, b) => b.count - a.count),
    };
  });
}

/** Link (or unlink) a survey response to a participant by hand. */
export async function linkResponse(workspaceId: string, responseId: string, participantId: string | null) {
  await db.update(responses).set({ participantId }).where(and(eq(responses.id, responseId), eq(responses.workspaceId, workspaceId)));
}
