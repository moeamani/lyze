"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth";
import * as projects from "@/server/services/projects";
import type { ProjectInput } from "@/lib/validation";
import { attempt } from "./result";

type Scope = { workspaceId: string; slug: string };

export async function createProjectAction(scope: Scope, input: ProjectInput) {
  const user = await requireUser();
  const result = await attempt(() => projects.createProject(user.id, scope.workspaceId, input));
  if (!result.ok) return result;
  revalidatePath(`/w/${scope.slug}`, "layout");
  redirect(`/w/${scope.slug}/p/${result.data.id}`);
}

export async function updateProjectAction(scope: Scope, projectId: string, input: ProjectInput) {
  const user = await requireUser();
  const result = await attempt(() => projects.updateProject(user.id, scope.workspaceId, projectId, input));
  if (result.ok) revalidatePath(`/w/${scope.slug}`, "layout");
  return result.ok ? { ok: true as const, data: undefined } : result;
}

export async function setProjectArchivedAction(scope: Scope, projectId: string, archived: boolean) {
  const user = await requireUser();
  const result = await attempt(() => projects.setProjectArchived(user.id, scope.workspaceId, projectId, archived));
  if (result.ok) revalidatePath(`/w/${scope.slug}`, "layout");
  return result;
}

export async function deleteProjectAction(scope: Scope, projectId: string) {
  const user = await requireUser();
  const result = await attempt(() => projects.deleteProject(user.id, scope.workspaceId, projectId));
  if (!result.ok) return result;
  revalidatePath(`/w/${scope.slug}`, "layout");
  redirect(`/w/${scope.slug}/projects`);
}
