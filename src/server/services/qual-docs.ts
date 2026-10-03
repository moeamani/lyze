import { and, asc, count, desc, eq, inArray, isNotNull, ne } from "drizzle-orm";
import { db } from "@/server/db";
import {
  answers,
  codeApplications,
  forms,
  formVersions,
  participants,
  projects,
  researchSessions,
  responses,
  segments,
  sessionParticipants,
  studies,
  transcripts,
} from "@/server/db/schema";
import { allQuestions, type FormDoc, type Question } from "@/lib/forms/schema";
import type { Speakers } from "@/lib/interviews/sessions";
import { requireWorkspace } from "./access";
import { AppError } from "./errors";

/**
 * "Documents" are what researchers code: a session's transcript (field notes and diary entries
 * included) or all answers to one open-text question. Both are lists of text units — segments or
 * answers — that codings point into.
 */

export type DocRef = { kind: "session"; sessionId: string } | { kind: "question"; studyId: string; questionId: string };
export type UnitKind = "segment" | "answer";

export function docKey(ref: DocRef): string {
  return ref.kind === "session" ? `s:${ref.sessionId}` : `q:${ref.studyId}:${ref.questionId}`;
}

export function parseDocKey(key: string | undefined | null): DocRef | null {
  if (!key) return null;
  const [kind, a, b] = key.split(":");
  if (kind === "s" && a) return { kind: "session", sessionId: a };
  if (kind === "q" && a && b) return { kind: "question", studyId: a, questionId: b };
  return null;
}

export async function requireProject(userId: string, workspaceId: string, projectId: string, permission: Parameters<typeof requireWorkspace>[2] = "workspace:view") {
  const access = await requireWorkspace(userId, workspaceId, permission);
  const [project] = await db.select().from(projects).where(and(eq(projects.id, projectId), eq(projects.workspaceId, workspaceId))).limit(1);
  if (!project) throw new AppError("notFound");
  return { ...access, project };
}

/** Open-text questions (and "Other, please specify" fields) across a study's published versions. */
async function openTextQuestions(formId: string): Promise<{ question: Question; other: boolean }[]> {
  const versions = await db.select({ doc: formVersions.doc }).from(formVersions).where(eq(formVersions.formId, formId)).orderBy(desc(formVersions.version));
  const seen = new Map<string, { question: Question; other: boolean }>();
  for (const { doc } of versions) {
    for (const q of allQuestions(doc as FormDoc)) {
      if (seen.has(q.id)) continue;
      if (q.type === "short_text" || q.type === "long_text") seen.set(q.id, { question: q, other: false });
      else if ((q.type === "single_choice" || q.type === "multiple_choice") && q.config.allowOther) seen.set(q.id, { question: q, other: true });
    }
  }
  return [...seen.values()];
}

export type DocSummary = {
  key: string;
  ref: DocRef;
  title: string;
  subtitle: string;
  studyId: string;
  studyName: string;
  kind: "interview" | "focus_group" | "field_notes" | "diary" | "question";
  units: number;
  codings: number;
  pending: number;
  date: Date | null;
};

export async function listDocuments(workspaceId: string, projectId: string): Promise<DocSummary[]> {
  const projectStudies = await db.select().from(studies).where(and(eq(studies.workspaceId, workspaceId), eq(studies.projectId, projectId)));
  if (!projectStudies.length) return [];
  const studyIds = projectStudies.map((s) => s.id);
  const studyName = new Map(projectStudies.map((s) => [s.id, s.name]));
  const out: DocSummary[] = [];

  // Sessions with a ready transcript.
  const sessions = await db
    .select({ session: researchSessions, transcriptId: transcripts.id })
    .from(researchSessions)
    .innerJoin(transcripts, and(eq(transcripts.sessionId, researchSessions.id), eq(transcripts.status, "ready")))
    .where(inArray(researchSessions.studyId, studyIds))
    .orderBy(desc(researchSessions.scheduledAt));
  if (sessions.length) {
    const tIds = sessions.map((s) => s.transcriptId);
    const [unitCounts, codingCounts, people] = await Promise.all([
      db.select({ transcriptId: segments.transcriptId, n: count() }).from(segments).where(inArray(segments.transcriptId, tIds)).groupBy(segments.transcriptId),
      db
        .select({ transcriptId: segments.transcriptId, approved: isNotNull(codeApplications.approvedAt), n: count() })
        .from(codeApplications)
        .innerJoin(segments, eq(segments.id, codeApplications.segmentId))
        .where(inArray(segments.transcriptId, tIds))
        .groupBy(segments.transcriptId, isNotNull(codeApplications.approvedAt)),
      db
        .select({ sessionId: sessionParticipants.sessionId, code: participants.code })
        .from(sessionParticipants)
        .innerJoin(participants, eq(participants.id, sessionParticipants.participantId))
        .where(inArray(sessionParticipants.sessionId, sessions.map((s) => s.session.id)))
        .orderBy(asc(participants.code)),
    ]);
    for (const { session, transcriptId } of sessions) {
      const units = unitCounts.find((u) => u.transcriptId === transcriptId)?.n ?? 0;
      if (!units) continue;
      const c = codingCounts.filter((x) => x.transcriptId === transcriptId);
      out.push({
        key: docKey({ kind: "session", sessionId: session.id }),
        ref: { kind: "session", sessionId: session.id },
        title: session.title,
        subtitle: people.filter((p) => p.sessionId === session.id).map((p) => p.code).join(", "),
        studyId: session.studyId,
        studyName: studyName.get(session.studyId) ?? "",
        kind: session.kind,
        units,
        codings: c.find((x) => x.approved)?.n ?? 0,
        pending: c.find((x) => !x.approved)?.n ?? 0,
        date: session.scheduledAt ?? session.createdAt,
      });
    }
  }

  // Open-text questions in published forms.
  const studyForms = await db.select().from(forms).where(and(inArray(forms.studyId, studyIds), isNotNull(forms.publishedVersion)));
  for (const form of studyForms) {
    const questions = await openTextQuestions(form.id);
    if (!questions.length) continue;
    const qIds = questions.map((q) => q.question.id);
    const [unitCounts, codingCounts] = await Promise.all([
      db
        .select({ questionId: answers.questionId, n: count() })
        .from(answers)
        .innerJoin(responses, eq(responses.id, answers.responseId))
        .where(and(eq(responses.studyId, form.studyId), inArray(answers.questionId, qIds), isNotNull(answers.text), ne(answers.text, "")))
        .groupBy(answers.questionId),
      db
        .select({ questionId: answers.questionId, approved: isNotNull(codeApplications.approvedAt), n: count() })
        .from(codeApplications)
        .innerJoin(answers, eq(answers.id, codeApplications.answerId))
        .innerJoin(responses, eq(responses.id, answers.responseId))
        .where(and(eq(responses.studyId, form.studyId), inArray(answers.questionId, qIds)))
        .groupBy(answers.questionId, isNotNull(codeApplications.approvedAt)),
    ]);
    questions.forEach(({ question, other }, i) => {
      const units = unitCounts.find((u) => u.questionId === question.id)?.n ?? 0;
      if (!units) return;
      const c = codingCounts.filter((x) => x.questionId === question.id);
      out.push({
        key: docKey({ kind: "question", studyId: form.studyId, questionId: question.id }),
        ref: { kind: "question", studyId: form.studyId, questionId: question.id },
        title: other ? `${question.title} — Other` : question.title,
        subtitle: `Q${i + 1}`,
        studyId: form.studyId,
        studyName: studyName.get(form.studyId) ?? "",
        kind: "question",
        units,
        codings: c.find((x) => x.approved)?.n ?? 0,
        pending: c.find((x) => !x.approved)?.n ?? 0,
        date: form.publishedAt,
      });
    });
  }
  return out;
}

export type DocUnit = {
  id: string;
  kind: UnitKind;
  text: string;
  /** Speaker name / respondent label. */
  label: string;
  role: "interviewer" | "participant" | "other" | "respondent";
  participantId: string | null;
  startMs: number | null;
};

export type LoadedDoc = {
  key: string;
  ref: DocRef;
  title: string;
  studyId: string;
  projectId: string;
  units: DocUnit[];
  speakers?: Speakers;
};

/** The units of one document, checked to belong to the project. */
export async function loadDocument(workspaceId: string, projectId: string, ref: DocRef): Promise<LoadedDoc> {
  if (ref.kind === "session") {
    const [row] = await db
      .select({ session: researchSessions, transcript: transcripts })
      .from(researchSessions)
      .innerJoin(studies, eq(studies.id, researchSessions.studyId))
      .innerJoin(transcripts, eq(transcripts.sessionId, researchSessions.id))
      .where(and(eq(researchSessions.id, ref.sessionId), eq(studies.projectId, projectId), eq(studies.workspaceId, workspaceId)))
      .limit(1);
    if (!row) throw new AppError("notFound");
    const segs = await db.select().from(segments).where(eq(segments.transcriptId, row.transcript.id)).orderBy(asc(segments.position));
    const speakers = row.transcript.speakers;
    return {
      key: docKey(ref),
      ref,
      title: row.session.title,
      studyId: row.session.studyId,
      projectId,
      speakers,
      units: segs.map((s) => {
        const sp = s.speaker ? speakers[s.speaker] : undefined;
        return { id: s.id, kind: "segment" as const, text: s.text, label: sp?.name ?? "", role: sp?.role ?? "other", participantId: sp?.participantId ?? null, startMs: s.startMs };
      }),
    };
  }
  const [study] = await db.select().from(studies).where(and(eq(studies.id, ref.studyId), eq(studies.projectId, projectId), eq(studies.workspaceId, workspaceId))).limit(1);
  if (!study) throw new AppError("notFound");
  const [form] = await db.select().from(forms).where(eq(forms.studyId, study.id)).limit(1);
  const question = form ? (await openTextQuestions(form.id)).find((q) => q.question.id === ref.questionId) : undefined;
  if (!question) throw new AppError("notFound");
  const rows = await db
    .select({ id: answers.id, text: answers.text, responseId: responses.id, submittedAt: responses.submittedAt, startedAt: responses.startedAt })
    .from(answers)
    .innerJoin(responses, eq(responses.id, answers.responseId))
    .where(and(eq(responses.studyId, study.id), eq(answers.questionId, ref.questionId), isNotNull(answers.text), ne(answers.text, "")))
    .orderBy(asc(responses.startedAt));
  return {
    key: docKey(ref),
    ref,
    title: question.other ? `${question.question.title} — Other` : question.question.title,
    studyId: study.id,
    projectId,
    units: rows.map((r, i) => ({
      id: r.id,
      kind: "answer" as const,
      text: r.text ?? "",
      label: `R${String(i + 1).padStart(3, "0")}`,
      role: "respondent" as const,
      participantId: null,
      startMs: null,
    })),
  };
}

/** Text of one unit, checked to belong to the project. */
export async function loadUnit(workspaceId: string, projectId: string, kind: UnitKind, unitId: string): Promise<{ id: string; text: string }> {
  if (kind === "segment") {
    const [row] = await db
      .select({ id: segments.id, text: segments.text })
      .from(segments)
      .innerJoin(transcripts, eq(transcripts.id, segments.transcriptId))
      .innerJoin(researchSessions, eq(researchSessions.id, transcripts.sessionId))
      .innerJoin(studies, eq(studies.id, researchSessions.studyId))
      .where(and(eq(segments.id, unitId), eq(studies.projectId, projectId), eq(studies.workspaceId, workspaceId)))
      .limit(1);
    if (!row) throw new AppError("notFound");
    return row;
  }
  const [row] = await db
    .select({ id: answers.id, text: answers.text })
    .from(answers)
    .innerJoin(responses, eq(responses.id, answers.responseId))
    .innerJoin(studies, eq(studies.id, responses.studyId))
    .where(and(eq(answers.id, unitId), eq(studies.projectId, projectId), eq(studies.workspaceId, workspaceId)))
    .limit(1);
  if (!row?.text) throw new AppError("notFound");
  return { id: row.id, text: row.text };
}

/** For route handlers that only know the project id: resolve it and check membership. */
export async function requireProjectById(userId: string, projectId: string) {
  const [row] = await db.select({ workspaceId: projects.workspaceId }).from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!row) throw new AppError("notFound");
  try {
    return await requireProject(userId, row.workspaceId, projectId);
  } catch {
    throw new AppError("notFound");
  }
}
