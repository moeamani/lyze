"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth";
import * as forms from "@/server/services/forms";
import * as responses from "@/server/services/responses";
import { sendMail } from "@/server/mail";
import { formInviteEmail } from "@/server/mail/templates";
import { appUrl } from "@/server/url";
import type { PublishIssue } from "@/lib/forms/questions";
import type { TemplateKey } from "@/lib/forms/templates";
import { attempt, type ActionResult } from "./result";

type Scope = { workspaceId: string; slug: string; projectId: string; studyId: string };

const studyPath = (s: Scope) => `/w/${s.slug}/p/${s.projectId}/s/${s.studyId}`;

export async function createFormAction(scope: Scope, template: TemplateKey | "blank") {
  const user = await requireUser();
  const result = await attempt(() => forms.createForm(user.id, scope.workspaceId, scope.projectId, scope.studyId, template));
  if (result.ok) revalidatePath(studyPath(scope), "layout");
  return result.ok ? { ok: true as const, data: { id: result.data.id } } : result;
}

export async function saveFormDraftAction(scope: Scope, formId: string, doc: unknown) {
  const user = await requireUser();
  const result = await attempt(() => forms.saveDraft(user.id, scope.workspaceId, formId, doc));
  return result.ok ? { ok: true as const, data: { savedAt: result.data.updatedAt.toISOString() } } : result;
}

export async function publishFormAction(
  scope: Scope,
  formId: string,
): Promise<ActionResult<{ version: number }> | { ok: false; error: "invalid"; issues: PublishIssue[] }> {
  const user = await requireUser();
  try {
    const data = await forms.publishForm(user.id, scope.workspaceId, formId);
    revalidatePath(`/w/${scope.slug}`, "layout");
    return { ok: true, data };
  } catch (error) {
    if (error instanceof forms.PublishError) return { ok: false, error: "invalid", issues: error.issues };
    return attempt(() => Promise.reject(error));
  }
}

export async function inviteRespondentsAction(scope: Scope, formId: string, raw: string) {
  const user = await requireUser();
  const { valid, invalid } = responses.parseEmailList(raw);
  if (valid.length === 0) return { ok: false as const, error: "invalid" as const, invalid };
  const result = await attempt(async () => {
    const { form, invites } = await responses.createFormInvites(user.id, scope.workspaceId, formId, valid);
    const base = await appUrl();
    const doc = form.draft;
    const sent: string[] = [];
    for (const invite of invites) {
      const url = `${base}/f/${form.publicId}?t=${invite.token}`;
      try {
        await sendMail({ to: invite.email, url, ...formInviteEmail(url, doc.title, user.name || user.email, doc.description) });
        sent.push(invite.id);
      } catch (e) {
        console.error("Invite email failed", e);
      }
    }
    await responses.markInvitesSent(sent);
    return { sent: sent.length, failed: invites.length - sent.length };
  });
  if (result.ok) revalidatePath(`${studyPath(scope)}/distribute`);
  return result.ok ? { ok: true as const, data: { ...result.data, invalid } } : result;
}

export async function deleteResponseAction(scope: Scope, responseId: string) {
  const user = await requireUser();
  const result = await attempt(() => responses.deleteResponse(user.id, scope.workspaceId, scope.studyId, responseId));
  if (result.ok) revalidatePath(`${studyPath(scope)}/responses`);
  return result;
}
