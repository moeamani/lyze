import { and, count, desc, eq, inArray, isNotNull, lt, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { answers, files, formInvites, forms, responses, type ResponseStatus } from "@/server/db/schema";
import { storageFor } from "@/server/storage";
import { emailSchema } from "@/lib/validation";
import { newToken } from "@/lib/ids";
import { recordAudit } from "./audit";
import { requireWorkspace } from "./access";
import { AppError } from "./errors";
import { getPublishedDoc } from "./forms";

export async function responseCounts(workspaceId: string, studyId: string) {
  const rows = await db
    .select({ status: responses.status, n: count() })
    .from(responses)
    .where(and(eq(responses.workspaceId, workspaceId), eq(responses.studyId, studyId)))
    .groupBy(responses.status);
  const out: Record<ResponseStatus, number> = { partial: 0, complete: 0, screened_out: 0, over_quota: 0 };
  for (const r of rows) out[r.status] = r.n;
  return out;
}

/** Completed responses per study for a workspace (dashboard). */
export async function completedByStudy(workspaceId: string): Promise<Map<string, number>> {
  const rows = await db
    .select({ studyId: responses.studyId, n: count() })
    .from(responses)
    .where(and(eq(responses.workspaceId, workspaceId), eq(responses.status, "complete")))
    .groupBy(responses.studyId);
  return new Map(rows.map((r) => [r.studyId, r.n]));
}

export async function listResponses(
  workspaceId: string,
  studyId: string,
  opts: { status?: ResponseStatus; before?: Date; limit?: number } = {},
) {
  const limit = Math.min(opts.limit ?? 50, 200);
  const rows = await db
    .select({
      id: responses.id,
      status: responses.status,
      formVersion: responses.formVersion,
      startedAt: responses.startedAt,
      submittedAt: responses.submittedAt,
      durationMs: responses.durationMs,
      locale: responses.locale,
      inviteEmail: formInvites.email,
      answerCount: sql<number>`(select count(*)::int from ${answers} where ${answers.responseId} = ${responses.id})`,
    })
    .from(responses)
    .leftJoin(formInvites, eq(formInvites.id, responses.inviteId))
    .where(
      and(
        eq(responses.workspaceId, workspaceId),
        eq(responses.studyId, studyId),
        opts.status ? eq(responses.status, opts.status) : undefined,
        opts.before ? lt(responses.startedAt, opts.before) : undefined,
      ),
    )
    .orderBy(desc(responses.startedAt))
    .limit(limit + 1);
  return { items: rows.slice(0, limit), hasMore: rows.length > limit };
}

export async function getResponseDetail(workspaceId: string, studyId: string, responseId: string) {
  const [response] = await db
    .select()
    .from(responses)
    .where(and(eq(responses.id, responseId), eq(responses.workspaceId, workspaceId), eq(responses.studyId, studyId)))
    .limit(1);
  if (!response) throw new AppError("notFound");
  const [rows, fileRows, doc] = await Promise.all([
    db.select().from(answers).where(eq(answers.responseId, response.id)),
    db
      .select({ id: files.id, name: files.name, mime: files.mime, size: files.size })
      .from(files)
      .where(eq(files.responseId, response.id)),
    getPublishedDoc(response.formId, response.formVersion),
  ]);
  return {
    response,
    doc,
    answers: Object.fromEntries(rows.map((r) => [r.questionId, r.value])),
    files: Object.fromEntries(fileRows.map((f) => [f.id, f])),
  };
}

export async function deleteResponse(userId: string, workspaceId: string, studyId: string, responseId: string) {
  await requireWorkspace(userId, workspaceId, "content:edit");
  const fileRows = await db
    .select({ key: files.key, storage: files.storage })
    .from(files)
    .innerJoin(responses, eq(responses.id, files.responseId))
    .where(and(eq(responses.id, responseId), eq(responses.workspaceId, workspaceId)));
  await db.transaction(async (tx) => {
    const deleted = await tx
      .delete(responses)
      .where(and(eq(responses.id, responseId), eq(responses.workspaceId, workspaceId), eq(responses.studyId, studyId)))
      .returning({ id: responses.id });
    if (!deleted.length) throw new AppError("notFound");
    await recordAudit(tx, { workspaceId, actorId: userId, action: "response.deleted", entityType: "response", entityId: responseId });
  });
  await Promise.allSettled(fileRows.map((f) => storageFor(f.storage).delete(f.key)));
}

/** A file attached to a response, for a workspace member. */
export async function getFileForMember(userId: string, fileId: string) {
  const [file] = await db.select().from(files).where(eq(files.id, fileId)).limit(1);
  if (!file) throw new AppError("notFound");
  await requireWorkspace(userId, file.workspaceId, "workspace:view");
  return file;
}

// ── Email invites ────────────────────────────────────────────────────────────

const MAX_INVITES_PER_BATCH = 200;

export function parseEmailList(raw: string): { valid: string[]; invalid: string[] } {
  const parts = raw
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const valid = new Set<string>();
  const invalid: string[] = [];
  for (const p of parts) {
    const r = emailSchema.safeParse(p);
    if (r.success) valid.add(r.data);
    else invalid.push(p);
  }
  return { valid: [...valid], invalid };
}

export async function createFormInvites(userId: string, workspaceId: string, formId: string, emails: string[]) {
  await requireWorkspace(userId, workspaceId, "content:edit");
  const [form] = await db
    .select()
    .from(forms)
    .where(and(eq(forms.id, formId), eq(forms.workspaceId, workspaceId)))
    .limit(1);
  if (!form) throw new AppError("notFound");
  if (!form.publishedVersion) throw new AppError("invalid");
  if (emails.length === 0 || emails.length > MAX_INVITES_PER_BATCH) throw new AppError("invalid");

  const rows = await db
    .insert(formInvites)
    .values(emails.map((email) => ({ formId, email, token: newToken() })))
    .onConflictDoUpdate({ target: [formInvites.formId, formInvites.email], set: { createdAt: sql`now()` } })
    .returning();
  await recordAudit(db, {
    workspaceId,
    actorId: userId,
    action: "form.invited",
    entityType: "form",
    entityId: formId,
    metadata: { count: rows.length },
  });
  return { form, invites: rows };
}

export async function markInvitesSent(ids: string[]) {
  if (ids.length) await db.update(formInvites).set({ sentAt: new Date() }).where(inArray(formInvites.id, ids));
}

export async function listFormInvites(formId: string) {
  return db
    .select({
      id: formInvites.id,
      email: formInvites.email,
      sentAt: formInvites.sentAt,
      createdAt: formInvites.createdAt,
      status: sql<ResponseStatus | null>`(select ${responses.status} from ${responses} where ${responses.inviteId} = ${formInvites.id} order by ${responses.startedAt} desc limit 1)`,
    })
    .from(formInvites)
    .where(eq(formInvites.formId, formId))
    .orderBy(desc(formInvites.createdAt))
    .limit(500);
}

export async function lastSubmittedAt(studyId: string) {
  const [row] = await db
    .select({ at: sql<Date | null>`max(${responses.submittedAt})` })
    .from(responses)
    .where(and(eq(responses.studyId, studyId), isNotNull(responses.submittedAt)));
  return row?.at ?? null;
}
