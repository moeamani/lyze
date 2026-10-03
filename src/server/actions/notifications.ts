"use server";

import { requireUser } from "@/server/auth";
import { listNotifications, markRead, unreadCount } from "@/server/services/notifications";
import { attempt } from "./result";

export async function inboxAction() {
  const user = await requireUser();
  return attempt(async () => ({ items: await listNotifications(user.id, 40), unread: await unreadCount(user.id) }));
}

export async function markReadAction(ids?: string[]) {
  const user = await requireUser();
  return attempt(() => markRead(user.id, ids));
}
