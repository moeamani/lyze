"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth";
import { createGroup, deleteGroup, moveGroup, renameGroup, setProjectGroup } from "@/server/services/projects";
import { attempt } from "./result";

type Scope = { workspaceId: string; slug: string };

async function run<T>(scope: Scope, fn: (userId: string) => Promise<T>) {
  const user = await requireUser();
  const result = await attempt(() => fn(user.id));
  if (result.ok) revalidatePath(`/w/${scope.slug}`, "layout");
  return result;
}

export async function createGroupAction(scope: Scope, name: string) {
  return run(scope, async (u) => (await createGroup(u, scope.workspaceId, name)).id);
}
export async function renameGroupAction(scope: Scope, groupId: string, name: string) {
  return run(scope, (u) => renameGroup(u, scope.workspaceId, groupId, name));
}
export async function deleteGroupAction(scope: Scope, groupId: string) {
  return run(scope, (u) => deleteGroup(u, scope.workspaceId, groupId));
}
export async function moveGroupAction(scope: Scope, groupId: string, direction: "up" | "down") {
  return run(scope, (u) => moveGroup(u, scope.workspaceId, groupId, direction));
}
export async function setProjectGroupAction(scope: Scope, projectId: string, groupId: string | null) {
  return run(scope, (u) => setProjectGroup(u, scope.workspaceId, projectId, groupId));
}
