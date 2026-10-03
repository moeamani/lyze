import { membersWithRoles, notify } from "./notifications";
import { and, asc, desc, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/server/db";
import { invites, memberships, users, workspaces } from "@/server/db/schema";
import { userHandle } from "@/server/db/user-handle";
import { newToken } from "@/lib/ids";
import { inviteSchema, roleChangeSchema, type InviteInput } from "@/lib/validation";
import type { Role } from "@/lib/permissions";
import { recordAudit } from "./audit";
import { requireWorkspace } from "./access";
import { AppError } from "./errors";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function listMembers(workspaceId: string) {
  return db
    .select({
      userId: users.id,
      name: users.name,
      email: userHandle,
      image: users.image,
      role: memberships.role,
      joinedAt: memberships.createdAt,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.workspaceId, workspaceId))
    .orderBy(asc(memberships.createdAt));
}

export async function listPendingInvites(workspaceId: string) {
  return db
    .select({ id: invites.id, email: invites.email, role: invites.role, expiresAt: invites.expiresAt })
    .from(invites)
    .where(and(eq(invites.workspaceId, workspaceId), isNull(invites.acceptedAt), gt(invites.expiresAt, new Date())))
    .orderBy(desc(invites.createdAt));
}

async function ownerCount(workspaceId: string) {
  return db.$count(memberships, and(eq(memberships.workspaceId, workspaceId), eq(memberships.role, "owner")));
}

async function memberRole(workspaceId: string, userId: string): Promise<Role> {
  const [row] = await db
    .select({ role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.workspaceId, workspaceId), eq(memberships.userId, userId)))
    .limit(1);
  if (!row) throw new AppError("notFound");
  return row.role;
}

export async function changeRole(actorId: string, workspaceId: string, raw: { userId: string; role: Role }) {
  const input = roleChangeSchema.parse(raw);
  await requireWorkspace(actorId, workspaceId, "members:manage");
  const current = await memberRole(workspaceId, input.userId);
  if (current === input.role) return;
  if (current === "owner" && (await ownerCount(workspaceId)) <= 1) throw new AppError("lastOwner");

  await db.transaction(async (tx) => {
    await tx
      .update(memberships)
      .set({ role: input.role })
      .where(and(eq(memberships.workspaceId, workspaceId), eq(memberships.userId, input.userId)));
    await recordAudit(tx, {
      workspaceId,
      actorId,
      action: "member.role_changed",
      entityType: "user",
      entityId: input.userId,
      metadata: { from: current, to: input.role },
    });
  });
}

/** Remove a member. Anyone may remove themselves (leave); owners may remove others. */
export async function removeMember(actorId: string, workspaceId: string, userId: string) {
  if (actorId === userId) await requireWorkspace(actorId, workspaceId, "workspace:view");
  else await requireWorkspace(actorId, workspaceId, "members:manage");

  const role = await memberRole(workspaceId, userId);
  if (role === "owner" && (await ownerCount(workspaceId)) <= 1) throw new AppError("lastOwner");

  await db.transaction(async (tx) => {
    await tx
      .delete(memberships)
      .where(and(eq(memberships.workspaceId, workspaceId), eq(memberships.userId, userId)));
    await recordAudit(tx, {
      workspaceId,
      actorId,
      action: actorId === userId ? "member.left" : "member.removed",
      entityType: "user",
      entityId: userId,
    });
  });
}

/** Add an existing username/password account straight away (they have no email to invite). */
async function addByUsername(actorId: string, workspaceId: string, username: string, role: Role) {
  const [person] = await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.username, username)).limit(1);
  if (!person) throw new AppError("notFound");
  const added = await db.transaction(async (tx) => {
    const rows = await tx.insert(memberships).values({ workspaceId, userId: person.id, role }).onConflictDoNothing().returning({ userId: memberships.userId });
    if (!rows.length) return false;
    await recordAudit(tx, { workspaceId, actorId, action: "member.joined", entityType: "user", entityId: person.id, metadata: { role, username, addedBy: actorId } });
    return true;
  });
  if (!added) throw new AppError("conflict");
  return { name: person.name || username };
}

/** An email gets an invite link; a username is added at once (password accounts have no email). */
export async function inviteOrAdd(actorId: string, workspaceId: string, raw: InviteInput) {
  const input = inviteSchema.parse(raw);
  if (input.email.includes("@")) return { ...(await createInvite(actorId, workspaceId, input)), added: null };
  await requireWorkspace(actorId, workspaceId, "members:manage");
  return { invite: null, workspace: null, added: await addByUsername(actorId, workspaceId, input.email, input.role) };
}

export async function createInvite(actorId: string, workspaceId: string, raw: InviteInput) {
  const input = inviteSchema.parse(raw);
  const { workspace } = await requireWorkspace(actorId, workspaceId, "members:manage");
  if (!input.email.includes("@")) throw new AppError("invalid");

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .innerJoin(memberships, and(eq(memberships.userId, users.id), eq(memberships.workspaceId, workspaceId)))
    .where(eq(users.email, input.email))
    .limit(1);
  if (existing) throw new AppError("conflict");

  return db.transaction(async (tx) => {
    // Re-inviting replaces any pending invite for the same address.
    await tx
      .delete(invites)
      .where(and(eq(invites.workspaceId, workspaceId), eq(invites.email, input.email), isNull(invites.acceptedAt)));
    const [invite] = await tx
      .insert(invites)
      .values({
        workspaceId,
        email: input.email,
        role: input.role,
        token: newToken(),
        invitedById: actorId,
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      })
      .returning();
    await recordAudit(tx, {
      workspaceId,
      actorId,
      action: "member.invited",
      entityType: "invite",
      entityId: invite!.id,
      metadata: { email: input.email, role: input.role },
    });
    return { invite: invite!, workspace };
  });
}

export async function revokeInvite(actorId: string, workspaceId: string, inviteId: string) {
  await requireWorkspace(actorId, workspaceId, "members:manage");
  await db.transaction(async (tx) => {
    const deleted = await tx
      .delete(invites)
      .where(and(eq(invites.id, inviteId), eq(invites.workspaceId, workspaceId)))
      .returning({ email: invites.email });
    if (!deleted.length) throw new AppError("notFound");
    await recordAudit(tx, {
      workspaceId,
      actorId,
      action: "member.invite_revoked",
      entityType: "invite",
      entityId: inviteId,
      metadata: { email: deleted[0]!.email },
    });
  });
}

export async function getInviteByToken(token: string) {
  const [row] = await db
    .select({ invite: invites, workspaceName: workspaces.name, workspaceSlug: workspaces.slug })
    .from(invites)
    .innerJoin(workspaces, eq(workspaces.id, invites.workspaceId))
    .where(eq(invites.token, token))
    .limit(1);
  if (!row || row.invite.acceptedAt || row.invite.expiresAt < new Date()) return null;
  return row;
}

/** Accept an invite. The signed-in email must match the invited address. */
export async function acceptInvite(userId: string, userEmail: string | null | undefined, token: string) {
  const row = await getInviteByToken(token);
  if (!row) throw new AppError("inviteInvalid");
  if (!userEmail || userEmail.toLowerCase() !== row.invite.email) throw new AppError("forbidden");

  await db.transaction(async (tx) => {
    await tx
      .insert(memberships)
      .values({ workspaceId: row.invite.workspaceId, userId, role: row.invite.role })
      .onConflictDoNothing();
    await tx.update(invites).set({ acceptedAt: new Date() }).where(eq(invites.id, row.invite.id));
    await recordAudit(tx, {
      workspaceId: row.invite.workspaceId,
      actorId: userId,
      action: "member.joined",
      entityType: "user",
      entityId: userId,
      metadata: { role: row.invite.role },
    });
  });
  const people = await membersWithRoles(row.invite.workspaceId, ["owner"], userId);
  const [me] = await db.select({ name: users.name, email: userHandle }).from(users).where(eq(users.id, userId)).limit(1);
  await notify(people, { workspaceId: row.invite.workspaceId, kind: "memberJoined", data: { name: me?.name || me?.email || "" }, href: `/w/${row.workspaceSlug}/settings/members` });
  return { slug: row.workspaceSlug };
}
