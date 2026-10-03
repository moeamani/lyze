import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { answers as answersTable, files, formInvites, forms, participants, responses, studies, type ResponseStatus } from "@/server/db/schema";
import { newId, newToken } from "@/lib/ids";
import { answerColumns, validateAnswer, type Answers, type AnswerValue } from "@/lib/forms/answers";
import { validateSubmission } from "@/lib/forms/logic";
import { matchingQuotas } from "@/lib/forms/quotas";
import { findQuestion, type FormDoc } from "@/lib/forms/schema";
import { storage, storageFor } from "@/server/storage";
import { getPublishedDoc } from "./forms";
import { requireWorkspace } from "./access";
import { membersWithRoles, notify, studyLink } from "./notifications";

/** Respondent-facing failures. Codes are i18n keys in the `respondent` namespace. */
export type RespondentErrorCode = "notFound" | "closed" | "alreadyResponded" | "inviteRequired" | "invalid" | "tooLarge" | "fileType";

export class RespondentError extends Error {
  constructor(
    public readonly code: RespondentErrorCode,
    public readonly details?: Record<string, string>,
  ) {
    super(code);
  }
}

export type PublicForm = {
  formId: string;
  publicId: string;
  workspaceId: string;
  studyId: string;
  version: number;
  doc: FormDoc;
  open: boolean;
};

/** The currently published form behind a public link, or null. */
export async function getPublicForm(publicId: string): Promise<PublicForm | null> {
  const [row] = await db
    .select({ form: forms, studyStatus: studies.status })
    .from(forms)
    .innerJoin(studies, eq(studies.id, forms.studyId))
    .where(eq(forms.publicId, publicId))
    .limit(1);
  if (!row?.form.publishedVersion) return null;
  const doc = await getPublishedDoc(row.form.id, row.form.publishedVersion);
  if (!doc) return null;
  return {
    formId: row.form.id,
    publicId,
    workspaceId: row.form.workspaceId,
    studyId: row.form.studyId,
    version: row.form.publishedVersion,
    doc,
    open: row.studyStatus === "live",
  };
}

async function requireOpenForm(publicId: string) {
  const form = await getPublicForm(publicId);
  if (!form) throw new RespondentError("notFound");
  if (!form.open) throw new RespondentError("closed");
  return form;
}

type ResumeState = { token: string; answers: Answers; pageId: string | null; version: number; doc: FormDoc };

async function loadAnswers(responseId: string): Promise<Answers> {
  const rows = await db.select().from(answersTable).where(eq(answersTable.responseId, responseId));
  return Object.fromEntries(rows.map((r) => [r.questionId, r.value]));
}

async function resumeState(response: typeof responses.$inferSelect, current: PublicForm): Promise<ResumeState> {
  const doc = response.formVersion === current.version ? current.doc : await getPublishedDoc(current.formId, response.formVersion);
  return {
    token: response.resumeToken,
    answers: await loadAnswers(response.id),
    pageId: response.currentPageId,
    version: response.formVersion,
    doc: doc ?? current.doc,
  };
}

/**
 * Start (or pick back up) a response. One-response-per-person rules are enforced here:
 * `device` matches a device id kept in the respondent's browser, `invite` requires a personal link.
 */
async function canEnterManually(userId: string, workspaceId: string) {
  try {
    await requireWorkspace(userId, workspaceId, "content:edit");
    return true;
  } catch {
    return false;
  }
}

export async function startResponse(
  publicId: string,
  input: { deviceId?: string; inviteToken?: string; locale?: string; userAgent?: string; referrer?: string; embed?: boolean; enteredBy?: string },
): Promise<ResumeState> {
  const form = await requireOpenForm(publicId);
  // A researcher typing in a paper questionnaire: every entry is a new response, whatever the form's limits.
  const manual = input.enteredBy ? await canEnterManually(input.enteredBy, form.workspaceId) : false;
  const mode = manual ? "none" : form.doc.settings.oneResponse;

  let inviteId: string | null = null;
  if (input.inviteToken) {
    const [invite] = await db
      .select()
      .from(formInvites)
      .where(and(eq(formInvites.formId, form.formId), eq(formInvites.token, input.inviteToken)))
      .limit(1);
    if (invite) inviteId = invite.id;
  }
  if (mode === "invite" && !inviteId) throw new RespondentError("inviteRequired");

  const existingWhere =
    mode === "invite" && inviteId
      ? eq(responses.inviteId, inviteId)
      : mode === "device" && input.deviceId
        ? eq(responses.deviceId, input.deviceId)
        : undefined;
  if (existingWhere) {
    const previous = await db
      .select()
      .from(responses)
      .where(and(eq(responses.formId, form.formId), existingWhere))
      .orderBy(sql`${responses.startedAt} desc`);
    if (previous.some((r) => r.status !== "partial")) throw new RespondentError("alreadyResponded");
    if (previous[0]) return resumeState(previous[0], form);
  }

  const [created] = await db
    .insert(responses)
    .values({
      workspaceId: form.workspaceId,
      studyId: form.studyId,
      formId: form.formId,
      formVersion: form.version,
      resumeToken: newToken(),
      inviteId,
      deviceId: manual ? null : (input.deviceId?.slice(0, 64) ?? null),
      source: manual ? "manual" : "respondent",
      locale: input.locale?.slice(0, 10) ?? null,
      meta: {
        userAgent: input.userAgent?.slice(0, 300),
        referrer: input.referrer?.slice(0, 300),
        embed: input.embed || undefined,
      },
    })
    .returning();
  return { token: created!.resumeToken, answers: {}, pageId: null, version: form.version, doc: form.doc };
}

async function requirePartial(publicId: string, token: string) {
  const [row] = await db
    .select({ response: responses, publicId: forms.publicId })
    .from(responses)
    .innerJoin(forms, eq(forms.id, responses.formId))
    .where(eq(responses.resumeToken, token))
    .limit(1);
  if (!row || row.publicId !== publicId) throw new RespondentError("notFound");
  if (row.response.status !== "partial") throw new RespondentError("alreadyResponded");
  return row.response;
}

export async function resumeResponse(publicId: string, token: string): Promise<ResumeState> {
  const form = await requireOpenForm(publicId);
  const response = await requirePartial(publicId, token);
  return resumeState(response, form);
}

async function docFor(response: typeof responses.$inferSelect): Promise<FormDoc> {
  const doc = await getPublishedDoc(response.formId, response.formVersion);
  if (!doc) throw new RespondentError("notFound");
  return doc;
}

async function writeAnswers(
  tx: Pick<typeof db, "insert" | "delete">,
  responseId: string,
  doc: FormDoc,
  values: Answers,
  replaceAll: boolean,
) {
  if (replaceAll) await tx.delete(answersTable).where(eq(answersTable.responseId, responseId));
  const rows = Object.entries(values).flatMap(([questionId, value]) => {
    const question = findQuestion(doc, questionId);
    if (!question || value === undefined) return [];
    return [{ id: newId("ans"), responseId, questionId, value, ...answerColumns(question, value) }];
  });
  if (!rows.length) return;
  await tx
    .insert(answersTable)
    .values(rows)
    .onConflictDoUpdate({
      target: [answersTable.responseId, answersTable.questionId],
      set: {
        value: sql`excluded.value`,
        numeric: sql`excluded.numeric`,
        text: sql`excluded.text`,
        updatedAt: sql`now()`,
      },
    });
}

/**
 * Save progress as the respondent goes. Each answer is checked for shape only (not required-ness);
 * malformed ones are skipped and `null` clears an answer.
 */
export async function saveProgress(
  publicId: string,
  token: string,
  input: { answers: Record<string, AnswerValue | null>; pageId?: string },
) {
  await requireOpenForm(publicId);
  const response = await requirePartial(publicId, token);
  const doc = await docFor(response);

  const keep: Answers = {};
  const clear: string[] = [];
  for (const [questionId, value] of Object.entries(input.answers)) {
    const question = findQuestion(doc, questionId);
    if (!question) continue;
    if (value === null) {
      clear.push(questionId);
      continue;
    }
    const result = validateAnswer(question, value, false);
    if (result.ok && result.value !== undefined) keep[questionId] = result.value;
    else if (result.ok) clear.push(questionId);
  }

  await db.transaction(async (tx) => {
    await writeAnswers(tx, response.id, doc, keep, false);
    if (clear.length) {
      await tx.delete(answersTable).where(and(eq(answersTable.responseId, response.id), inArray(answersTable.questionId, clear)));
    }
    const pageId = input.pageId && doc.pages.some((p) => p.id === input.pageId) ? input.pageId : response.currentPageId;
    await tx.update(responses).set({ currentPageId: pageId }).where(eq(responses.id, response.id));
  });
}

export async function submitResponse(
  publicId: string,
  token: string,
  raw: Answers,
): Promise<{ status: ResponseStatus; message?: string }> {
  await requireOpenForm(publicId);
  const response = await requirePartial(publicId, token);
  const doc = await docFor(response);

  const result = validateSubmission(doc, raw);
  if (!result.ok) throw new RespondentError("invalid", result.errors);

  const quotaIds = matchingQuotas(doc, result.answers);
  let status: ResponseStatus = result.screenOut ? "screened_out" : "complete";
  let message: string | undefined;

  let orphanedKeys: { key: string; storage: string }[] = [];
  await db.transaction(async (tx) => {
    if (status === "complete") {
      for (const quota of doc.settings.quotas.filter((q) => quotaIds.includes(q.id))) {
        const filled = await tx.$count(
          responses,
          and(eq(responses.formId, response.formId), eq(responses.status, "complete"), sql`${quota.id} = any(${responses.quotaIds})`),
        );
        if (filled >= quota.limit) {
          status = "over_quota";
          message = quota.message;
          break;
        }
      }
    }
    await writeAnswers(tx, response.id, doc, result.answers, true);
    const submittedAt = new Date();
    await tx
      .update(responses)
      .set({
        status,
        quotaIds: status === "complete" ? quotaIds : [],
        submittedAt,
        durationMs: Math.max(0, submittedAt.getTime() - response.startedAt.getTime()),
      })
      .where(eq(responses.id, response.id));
    // Files uploaded for questions that ended up unanswered/hidden are no longer needed.
    const kept = new Set(
      Object.values(result.answers).flatMap((v) => (v && typeof v === "object" && "fileIds" in v ? (v.fileIds as string[]) : [])),
    );
    const uploaded = await tx.select({ id: files.id, key: files.key, storage: files.storage }).from(files).where(eq(files.responseId, response.id));
    const orphaned = uploaded.filter((f) => !kept.has(f.id));
    if (orphaned.length) await tx.delete(files).where(inArray(files.id, orphaned.map((f) => f.id)));
    orphanedKeys = orphaned;
  });
  await Promise.allSettled(orphanedKeys.map((f) => storageFor(f.storage).delete(f.key)));

  if (status === "complete") {
    await linkResponseToParticipant(response.id).catch(() => undefined);
    const link = await studyLink(response.studyId);
    if (link) {
      const people = await membersWithRoles(link.workspaceId, ["owner", "editor"]);
      await notify(people, { workspaceId: link.workspaceId, kind: "responses", data: { study: link.studyName }, href: `${link.base}/responses`, groupKey: `responses:${response.studyId}` });
    }
  }

  return { status, message };
}

/**
 * Mixed methods: a response sent through a personal email invite belongs to the participant
 * with that email in the same project (an interviewee who also filled in the survey).
 */
export async function linkResponseToParticipant(responseId: string) {
  const [row] = await db
    .select({ email: formInvites.email, projectId: studies.projectId })
    .from(responses)
    .innerJoin(formInvites, eq(formInvites.id, responses.inviteId))
    .innerJoin(studies, eq(studies.id, responses.studyId))
    .where(eq(responses.id, responseId))
    .limit(1);
  if (!row?.email) return;
  const [person] = await db
    .select({ id: participants.id })
    .from(participants)
    .innerJoin(studies, eq(studies.id, participants.studyId))
    .where(and(eq(studies.projectId, row.projectId), sql`lower(${participants.email}) = ${row.email.toLowerCase()}`))
    .limit(1);
  if (person) await db.update(responses).set({ participantId: person.id }).where(eq(responses.id, responseId));
}

const ACCEPT: Record<string, (mime: string) => boolean> = {
  any: () => true,
  image: (m) => m.startsWith("image/"),
  document: (m) =>
    m === "application/pdf" ||
    m.startsWith("text/") ||
    m.includes("officedocument") ||
    m === "application/msword" ||
    m === "application/vnd.ms-excel" ||
    m === "application/vnd.oasis.opendocument.text",
  audio: (m) => m.startsWith("audio/") || m === "video/webm",
  video: (m) => m.startsWith("video/"),
};

const BLOCKED_MIME = /^(application\/(x-msdownload|x-sh|x-executable|javascript)|text\/html)/;
const MEDIA_MAX_MB = 100;

export async function uploadAnswerFile(publicId: string, token: string, questionId: string, file: File) {
  await requireOpenForm(publicId);
  const response = await requirePartial(publicId, token);
  const doc = await docFor(response);
  const question = findQuestion(doc, questionId);
  if (!question || (question.type !== "file_upload" && question.type !== "media")) throw new RespondentError("invalid");

  const maxMb = question.type === "file_upload" ? question.config.maxSizeMb : MEDIA_MAX_MB;
  if (file.size > maxMb * 1024 * 1024) throw new RespondentError("tooLarge");
  const mime = file.type || "application/octet-stream";
  const accept = question.type === "file_upload" ? question.config.accept : question.config.mediaKind;
  if (BLOCKED_MIME.test(mime) || !ACCEPT[accept]!(mime)) throw new RespondentError("fileType");

  const id = newId("fil");
  const safeName = file.name.replace(/[^\w.\-]+/g, "_").slice(-80) || "file";
  const key = `${response.workspaceId}/responses/${response.id}/${id}-${safeName}`;
  const store = storage();
  await store.put(key, new Uint8Array(await file.arrayBuffer()), mime);
  const [row] = await db
    .insert(files)
    .values({ id, workspaceId: response.workspaceId, responseId: response.id, storage: store.name, key, name: file.name.slice(0, 200), mime, size: file.size })
    .returning({ id: files.id, name: files.name, size: files.size, mime: files.mime });
  return row!;
}
