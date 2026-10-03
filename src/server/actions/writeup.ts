"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { requireUser } from "@/server/auth";
import { attachProposal, deleteWriteup, generateWriteup, removeProposal, saveBrief, updateWriteup, type BriefInput } from "@/server/services/writeup";
import { AppError } from "@/server/services/errors";
import { attempt } from "./result";
import { providerFor, type AiMode } from "@/server/ai";

type Scope = { workspaceId: string; slug: string; projectId: string };

async function run<T>(scope: Scope, fn: (userId: string) => Promise<T>) {
  const user = await requireUser();
  const result = await attempt(() => fn(user.id));
  if (result.ok) revalidatePath(`/w/${scope.slug}/p/${scope.projectId}`, "layout");
  return result;
}

export async function saveBriefAction(scope: Scope, input: BriefInput) {
  return run(scope, (u) => saveBrief(u, scope.workspaceId, scope.projectId, input));
}
export async function attachProposalAction(scope: Scope, form: FormData) {
  return run(scope, (u) => {
    const file = form.get("file");
    if (!(file instanceof File) || !file.size) throw new AppError("invalid");
    return attachProposal(u, scope.workspaceId, scope.projectId, file);
  });
}
export async function removeProposalAction(scope: Scope) {
  return run(scope, (u) => removeProposal(u, scope.workspaceId, scope.projectId));
}
export async function generateWriteupAction(scope: Scope, mode: AiMode = "lyze") {
  const locale = await getLocale();
  return run(scope, async (u) => (await generateWriteup(u, scope.workspaceId, scope.projectId, locale, await providerFor(u, scope.workspaceId, mode))).id);
}
export async function updateWriteupAction(scope: Scope, id: string, input: { title: string; body: string }) {
  return run(scope, (u) => updateWriteup(u, scope.workspaceId, scope.projectId, id, input));
}
export async function deleteWriteupAction(scope: Scope, id: string) {
  return run(scope, (u) => deleteWriteup(u, scope.workspaceId, scope.projectId, id));
}
