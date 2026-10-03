"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth";
import * as members from "@/server/services/members";
import { sendMail } from "@/server/mail";
import { inviteEmail } from "@/server/mail/templates";
import { appUrl } from "@/server/url";
import type { InviteInput } from "@/lib/validation";
import type { Role } from "@/lib/permissions";
import { attempt } from "./result";
import { rememberWorkspace } from "@/server/preferences";

type Scope = { workspaceId: string; slug: string };

export async function inviteMemberAction(scope: Scope, input: InviteInput) {
  const user = await requireUser();
  const result = await attempt(async () => {
    const { invite, workspace, added } = await members.inviteOrAdd(user.id, scope.workspaceId, input);
    // A username is added straight away; only email invites need a link.
    if (!invite || !workspace) return { added: added!.name };
    const url = `${await appUrl()}/invite/${invite.token}`;
    await sendMail({ to: invite.email, url, ...inviteEmail(url, workspace.name, user.name || user.handle) });
    return { added: null };
  });
  if (result.ok) revalidatePath(`/w/${scope.slug}/settings/members`);
  return result;
}

export async function revokeInviteAction(scope: Scope, inviteId: string) {
  const user = await requireUser();
  const result = await attempt(() => members.revokeInvite(user.id, scope.workspaceId, inviteId));
  if (result.ok) revalidatePath(`/w/${scope.slug}/settings/members`);
  return result;
}

export async function changeRoleAction(scope: Scope, userId: string, role: Role) {
  const user = await requireUser();
  const result = await attempt(() => members.changeRole(user.id, scope.workspaceId, { userId, role }));
  if (result.ok) revalidatePath(`/w/${scope.slug}`, "layout");
  return result;
}

export async function removeMemberAction(scope: Scope, userId: string) {
  const user = await requireUser();
  const result = await attempt(() => members.removeMember(user.id, scope.workspaceId, userId));
  if (!result.ok) return result;
  if (userId === user.id) redirect("/");
  revalidatePath(`/w/${scope.slug}/settings/members`);
  return result;
}

export async function acceptInviteAction(token: string) {
  const user = await requireUser(`/invite/${token}`);
  const result = await attempt(() => members.acceptInvite(user.id, user.email, token));
  if (!result.ok) return result;
  await rememberWorkspace(result.data.slug);
  redirect(`/w/${result.data.slug}`);
}
