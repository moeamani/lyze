import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { memberships, notifications, projects, studies, workspaces } from "@/server/db/schema";
import type { Role } from "@/lib/permissions";

export const NOTIFICATION_KINDS = ["responses", "transcript", "transcriptFailed", "consent", "memberJoined", "writeup"] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

type NotifyInput = {
  workspaceId: string;
  kind: NotificationKind;
  data?: Record<string, string | number>;
  href?: string | null;
  /** Unread notifications with the same key fold into one ("12 new responses"). */
  groupKey?: string;
};

/** Send a notification to each user. Never throws: a failed notification must not break the action that caused it. */
export async function notify(userIds: string[], input: NotifyInput) {
  const users = [...new Set(userIds)];
  if (!users.length) return;
  try {
    for (const userId of users) {
      if (input.groupKey) {
        const [open] = await db
          .select({ id: notifications.id, data: notifications.data })
          .from(notifications)
          .where(and(eq(notifications.userId, userId), eq(notifications.groupKey, input.groupKey), isNull(notifications.readAt)))
          .limit(1);
        if (open) {
          const count = Number(open.data.count ?? 1) + 1;
          await db.update(notifications).set({ data: { ...open.data, ...input.data, count }, createdAt: new Date() }).where(eq(notifications.id, open.id));
          continue;
        }
      }
      await db.insert(notifications).values({ userId, workspaceId: input.workspaceId, kind: input.kind, data: { count: 1, ...input.data }, href: input.href ?? null, groupKey: input.groupKey ?? null });
    }
  } catch (error) {
    console.error("notify failed", input.kind, error);
  }
}

/** Members of a workspace with one of the given roles, minus whoever caused the event. */
export async function membersWithRoles(workspaceId: string, roles: Role[], exceptUserId?: string | null) {
  const rows = await db
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(and(eq(memberships.workspaceId, workspaceId), inArray(memberships.role, roles)));
  return rows.map((r) => r.userId).filter((id) => id !== exceptUserId);
}

/** Where a study lives, for building links in notifications. */
export async function studyLink(studyId: string) {
  const [row] = await db
    .select({ slug: workspaces.slug, projectId: projects.id, studyName: studies.name, workspaceId: studies.workspaceId })
    .from(studies)
    .innerJoin(projects, eq(projects.id, studies.projectId))
    .innerJoin(workspaces, eq(workspaces.id, studies.workspaceId))
    .where(eq(studies.id, studyId))
    .limit(1);
  return row ? { ...row, base: `/w/${row.slug}/p/${row.projectId}/s/${studyId}` } : null;
}

export async function listNotifications(userId: string, limit = 30) {
  return db
    .select({
      id: notifications.id,
      kind: notifications.kind,
      data: notifications.data,
      href: notifications.href,
      readAt: notifications.readAt,
      createdAt: notifications.createdAt,
      workspaceName: workspaces.name,
    })
    .from(notifications)
    .leftJoin(workspaces, eq(workspaces.id, notifications.workspaceId))
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(Math.min(limit, 100));
}

export async function unreadCount(userId: string) {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return row?.n ?? 0;
}

/** Mark some (or, with no ids, all) of a user's notifications as read. */
export async function markRead(userId: string, ids?: string[]) {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt), ids ? inArray(notifications.id, ids) : undefined));
}
