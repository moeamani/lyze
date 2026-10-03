"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth";
import { getAnalysisSettings, saveAnalysisSettings } from "@/server/services/analysis";
import { requireWorkspace } from "@/server/services/access";
import { attempt } from "./result";

type Scope = { workspaceId: string; slug: string; projectId: string; studyId: string };
const studyPath = (s: Scope) => `/w/${s.slug}/p/${s.projectId}/s/${s.studyId}`;

export async function saveAnalysisSettingsAction(scope: Scope, settings: unknown) {
  const user = await requireUser();
  const result = await attempt(() => saveAnalysisSettings(user.id, scope.workspaceId, scope.studyId, settings));
  if (result.ok) revalidatePath(studyPath(scope), "layout");
  return result.ok ? { ok: true as const, data: undefined } : result;
}

/** Exclude (or re-include) one response from analysis and exports. */
export async function setResponseExcludedAction(scope: Scope, responseId: string, excluded: boolean) {
  const user = await requireUser();
  const result = await attempt(async () => {
    await requireWorkspace(user.id, scope.workspaceId, "content:analyze");
    const current = await getAnalysisSettings(scope.studyId);
    const ids = new Set(current.excludedIds);
    if (excluded) ids.add(responseId);
    else ids.delete(responseId);
    await saveAnalysisSettings(user.id, scope.workspaceId, scope.studyId, { ...current, excludedIds: [...ids] });
  });
  if (result.ok) revalidatePath(studyPath(scope), "layout");
  return result;
}
