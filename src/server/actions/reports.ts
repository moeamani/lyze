"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth";
import { createReport, deleteReport, generateReport, getReport, reportMarkdown, resolveReport, setReportShared, updateReport } from "@/server/services/reports";
import { requireWorkspace } from "@/server/services/access";
import { attempt } from "./result";

type Scope = { workspaceId: string; slug: string; projectId: string };

async function run<T>(scope: Scope, fn: (userId: string) => Promise<T>) {
  const user = await requireUser();
  const result = await attempt(() => fn(user.id));
  if (result.ok) revalidatePath(`/w/${scope.slug}/p/${scope.projectId}`, "layout");
  return result;
}

export async function generateReportAction(scope: Scope) {
  return run(scope, async (u) => (await generateReport(u, scope.workspaceId, scope.projectId)).id);
}
export async function createReportAction(scope: Scope, title: string) {
  return run(scope, async (u) => (await createReport(u, scope.workspaceId, scope.projectId, { title })).id);
}
export async function saveReportAction(scope: Scope, id: string, input: { title: string; blocks: unknown }) {
  return run(scope, (u) => updateReport(u, scope.workspaceId, scope.projectId, id, input));
}
export async function deleteReportAction(scope: Scope, id: string) {
  return run(scope, (u) => deleteReport(u, scope.workspaceId, scope.projectId, id));
}
export async function shareReportAction(scope: Scope, id: string, shared: boolean) {
  return run(scope, (u) => setReportShared(u, scope.workspaceId, scope.projectId, id, shared));
}
export async function reportMarkdownAction(scope: Scope, id: string) {
  const user = await requireUser();
  return attempt(async () => {
    await requireWorkspace(user.id, scope.workspaceId, "workspace:view");
    const r = await getReport(scope.workspaceId, scope.projectId, id);
    return reportMarkdown(r.title, r.blocks, await resolveReport(scope.workspaceId, scope.projectId, r.blocks));
  });
}
