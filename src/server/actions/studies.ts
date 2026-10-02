"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth";
import * as studies from "@/server/services/studies";
import type { StudyInput, StudyUpdateInput } from "@/lib/validation";
import { attempt } from "./result";

type Scope = { workspaceId: string; slug: string; projectId: string };

export async function createStudyAction(scope: Scope, input: StudyInput) {
  const user = await requireUser();
  const result = await attempt(() => studies.createStudy(user.id, scope.workspaceId, scope.projectId, input));
  if (!result.ok) return result;
  revalidatePath(`/w/${scope.slug}`, "layout");
  redirect(`/w/${scope.slug}/p/${scope.projectId}/s/${result.data.id}`);
}

export async function updateStudyAction(scope: Scope, studyId: string, input: StudyUpdateInput) {
  const user = await requireUser();
  const result = await attempt(() => studies.updateStudy(user.id, scope.workspaceId, scope.projectId, studyId, input));
  if (result.ok) revalidatePath(`/w/${scope.slug}`, "layout");
  return result.ok ? { ok: true as const, data: undefined } : result;
}

export async function deleteStudyAction(scope: Scope, studyId: string) {
  const user = await requireUser();
  const result = await attempt(() => studies.deleteStudy(user.id, scope.workspaceId, scope.projectId, studyId));
  if (!result.ok) return result;
  revalidatePath(`/w/${scope.slug}`, "layout");
  redirect(`/w/${scope.slug}/p/${scope.projectId}`);
}
