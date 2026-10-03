import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { userHandle } from "@/server/db/user-handle";
import { answers, codes, memos, researchSessions, responses, segments, studies, themes, transcripts, users, MEMO_TARGETS } from "@/server/db/schema";
import { AppError } from "./errors";
import { requireProject } from "./qual-docs";
import { unitBelongs } from "./coding";

export const memoInputSchema = z.object({
  targetType: z.enum(MEMO_TARGETS),
  targetId: z.string().max(64).nullish(),
  title: z
    .string()
    .trim()
    .max(200)
    .transform((v) => v || null)
    .nullish(),
  body: z.string().trim().min(1).max(20_000),
});
export type MemoInput = z.input<typeof memoInputSchema>;

async function checkTarget(workspaceId: string, projectId: string, type: string, id: string | null | undefined) {
  if (type === "project") return;
  if (!id) throw new AppError("invalid");
  const ok =
    type === "code"
      ? (await db.select({ id: codes.id }).from(codes).where(and(eq(codes.id, id), eq(codes.projectId, projectId))).limit(1)).length > 0
      : type === "theme"
        ? (await db.select({ id: themes.id }).from(themes).where(and(eq(themes.id, id), eq(themes.projectId, projectId))).limit(1)).length > 0
        : type === "session"
          ? (
              await db
                .select({ id: researchSessions.id })
                .from(researchSessions)
                .innerJoin(studies, eq(studies.id, researchSessions.studyId))
                .where(and(eq(researchSessions.id, id), eq(studies.projectId, projectId)))
                .limit(1)
            ).length > 0
          : await unitBelongs(workspaceId, projectId, type as "segment" | "answer", id);
  if (!ok) throw new AppError("notFound");
}

export async function listMemos(workspaceId: string, projectId: string, filter: { targetType?: string; targetId?: string } = {}) {
  const rows = await db
    .select({ memo: memos, authorName: users.name, authorEmail: userHandle })
    .from(memos)
    .leftJoin(users, eq(users.id, memos.authorId))
    .where(
      and(
        eq(memos.workspaceId, workspaceId),
        eq(memos.projectId, projectId),
        filter.targetType ? eq(memos.targetType, filter.targetType as (typeof MEMO_TARGETS)[number]) : undefined,
        filter.targetId ? eq(memos.targetId, filter.targetId) : undefined,
      ),
    )
    .orderBy(desc(memos.updatedAt));
  return rows.map((r) => ({ ...r.memo, authorName: r.authorName ?? r.authorEmail?.split("@")[0] ?? null }));
}

export type MemoRow = Awaited<ReturnType<typeof listMemos>>[number];

export async function createMemo(userId: string, workspaceId: string, projectId: string, raw: MemoInput) {
  await requireProject(userId, workspaceId, projectId, "content:analyze");
  const input = memoInputSchema.parse(raw);
  await checkTarget(workspaceId, projectId, input.targetType, input.targetId);
  const [row] = await db
    .insert(memos)
    .values({ workspaceId, projectId, targetType: input.targetType, targetId: input.targetType === "project" ? null : input.targetId!, title: input.title ?? null, body: input.body, authorId: userId })
    .returning();
  return row!;
}

async function editable(userId: string, workspaceId: string, projectId: string, memoId: string) {
  const { role } = await requireProject(userId, workspaceId, projectId, "content:analyze");
  const [memo] = await db.select().from(memos).where(and(eq(memos.id, memoId), eq(memos.projectId, projectId))).limit(1);
  if (!memo) throw new AppError("notFound");
  // Analysts edit their own memos; editors and owners can edit anyone's.
  if (memo.authorId !== userId && role === "analyst") throw new AppError("forbidden");
  return memo;
}

export async function updateMemo(userId: string, workspaceId: string, projectId: string, memoId: string, raw: { title?: string | null; body: string }) {
  await editable(userId, workspaceId, projectId, memoId);
  const input = memoInputSchema.pick({ title: true, body: true }).parse(raw);
  await db.update(memos).set({ title: input.title ?? null, body: input.body }).where(eq(memos.id, memoId));
}

export async function deleteMemo(userId: string, workspaceId: string, projectId: string, memoId: string) {
  await editable(userId, workspaceId, projectId, memoId);
  await db.delete(memos).where(eq(memos.id, memoId));
}

/** Where each memo points, for linking from the memo list. */
export async function memoTargets(projectId: string, rows: MemoRow[]) {
  const ids = (type: string) => rows.filter((m) => m.targetType === type && m.targetId).map((m) => m.targetId!);
  const [codeRows, themeRows, segRows, ansRows, sesRows] = await Promise.all([
    ids("code").length ? db.select({ id: codes.id, name: codes.name }).from(codes).where(and(eq(codes.projectId, projectId), inArray(codes.id, ids("code")))) : [],
    ids("theme").length ? db.select({ id: themes.id, name: themes.name }).from(themes).where(and(eq(themes.projectId, projectId), inArray(themes.id, ids("theme")))) : [],
    ids("segment").length
      ? db
          .select({ id: segments.id, sessionId: researchSessions.id, title: researchSessions.title })
          .from(segments)
          .innerJoin(transcripts, eq(transcripts.id, segments.transcriptId))
          .innerJoin(researchSessions, eq(researchSessions.id, transcripts.sessionId))
          .where(inArray(segments.id, ids("segment")))
      : [],
    ids("answer").length
      ? db
          .select({ id: answers.id, questionId: answers.questionId, studyId: responses.studyId })
          .from(answers)
          .innerJoin(responses, eq(responses.id, answers.responseId))
          .where(inArray(answers.id, ids("answer")))
      : [],
    ids("session").length ? db.select({ id: researchSessions.id, title: researchSessions.title, studyId: researchSessions.studyId }).from(researchSessions).where(inArray(researchSessions.id, ids("session"))) : [],
  ]);
  const out = new Map<string, { kind: string; label: string; codeId?: string; themeId?: string; docKey?: string; unitId?: string; sessionId?: string; studyId?: string }>();
  for (const m of rows) {
    const id = m.targetId;
    if (m.targetType === "code") {
      const c = codeRows.find((x) => x.id === id);
      if (c) out.set(m.id, { kind: "code", label: c.name, codeId: c.id });
    } else if (m.targetType === "theme") {
      const th = themeRows.find((x) => x.id === id);
      if (th) out.set(m.id, { kind: "theme", label: th.name, themeId: th.id });
    } else if (m.targetType === "segment") {
      const s = segRows.find((x) => x.id === id);
      if (s) out.set(m.id, { kind: "segment", label: s.title, docKey: `s:${s.sessionId}`, unitId: s.id });
    } else if (m.targetType === "answer") {
      const a = ansRows.find((x) => x.id === id);
      if (a) out.set(m.id, { kind: "answer", label: "", docKey: `q:${a.studyId}:${a.questionId}`, unitId: a.id });
    } else if (m.targetType === "session") {
      const s = sesRows.find((x) => x.id === id);
      if (s) out.set(m.id, { kind: "session", label: s.title, sessionId: s.id, studyId: s.studyId });
    }
  }
  return out;
}
