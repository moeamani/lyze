import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import { profileSchema, type ProfileInput } from "@/lib/validation";
import { isLocale, type Locale } from "@/i18n/config";
import { AppError } from "./errors";

export async function updateProfile(userId: string, raw: ProfileInput) {
  const input = profileSchema.parse(raw);
  await db.update(users).set({ name: input.name }).where(eq(users.id, userId));
}

export async function setUserLocale(userId: string, locale: Locale) {
  if (!isLocale(locale)) throw new AppError("invalid");
  await db.update(users).set({ locale }).where(eq(users.id, userId));
}

/** Everything Lyze holds about a person, as JSON (GDPR access / portability). */
export async function exportUserData(userId: string) {
  const { memberships, workspaces, memos, writeups, notifications, auditEvents } = await import("@/server/db/schema");
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new AppError("notFound");
  const [ms, ownMemos, ownWriteups, inbox, actions] = await Promise.all([
    db.select({ workspace: workspaces.name, slug: workspaces.slug, role: memberships.role, joinedAt: memberships.createdAt }).from(memberships).innerJoin(workspaces, eq(workspaces.id, memberships.workspaceId)).where(eq(memberships.userId, userId)),
    db.select({ title: memos.title, body: memos.body, targetType: memos.targetType, createdAt: memos.createdAt }).from(memos).where(eq(memos.authorId, userId)),
    db.select({ title: writeups.title, body: writeups.body, createdAt: writeups.createdAt }).from(writeups).where(eq(writeups.createdById, userId)),
    db.select({ kind: notifications.kind, data: notifications.data, createdAt: notifications.createdAt, readAt: notifications.readAt }).from(notifications).where(eq(notifications.userId, userId)),
    db.select({ action: auditEvents.action, metadata: auditEvents.metadata, createdAt: auditEvents.createdAt }).from(auditEvents).where(eq(auditEvents.actorId, userId)).limit(5000),
  ]);
  return {
    exportedAt: new Date().toISOString(),
    profile: { name: user.name, email: user.email, locale: user.locale, createdAt: user.createdAt },
    workspaces: ms,
    memos: ownMemos,
    writeups: ownWriteups,
    notifications: inbox,
    activity: actions,
  };
}

/**
 * Delete an account. Workspaces where the person is the only member go with it; a workspace
 * that has other members but no other owner blocks deletion until ownership is handed over.
 */
export async function deleteAccount(userId: string, confirmEmail: string) {
  const { memberships, workspaces } = await import("@/server/db/schema");
  const { and, inArray, ne } = await import("drizzle-orm");
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new AppError("notFound");
  if (confirmEmail.trim().toLowerCase() !== (user.email ?? "").toLowerCase()) throw new AppError("invalid");
  const mine = await db.select({ workspaceId: memberships.workspaceId, role: memberships.role }).from(memberships).where(eq(memberships.userId, userId));
  const solo: string[] = [];
  for (const m of mine) {
    const others = await db.select({ role: memberships.role }).from(memberships).where(and(eq(memberships.workspaceId, m.workspaceId), ne(memberships.userId, userId)));
    if (!others.length) solo.push(m.workspaceId);
    else if (m.role === "owner" && !others.some((o) => o.role === "owner")) throw new AppError("lastOwner");
  }
  await db.transaction(async (tx) => {
    if (solo.length) await tx.delete(workspaces).where(inArray(workspaces.id, solo));
    await tx.delete(users).where(eq(users.id, userId));
  });
  return { deletedWorkspaces: solo.length };
}
