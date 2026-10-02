"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth";
import * as workspaces from "@/server/services/workspaces";
import type { CreateWorkspaceInput, UpdateWorkspaceInput } from "@/lib/validation";
import { LAST_WORKSPACE_COOKIE } from "@/lib/constants";
import { rememberWorkspace } from "@/server/preferences";
import { attempt } from "./result";

export async function createWorkspaceAction(input: CreateWorkspaceInput) {
  const user = await requireUser();
  const result = await attempt(() => workspaces.createWorkspace(user.id, input));
  if (!result.ok) return result;
  await rememberWorkspace(result.data.slug);
  redirect(`/w/${result.data.slug}`);
}

export async function updateWorkspaceAction(input: UpdateWorkspaceInput) {
  const user = await requireUser();
  const result = await attempt(() => workspaces.updateWorkspace(user.id, input));
  if (!result.ok) return result;
  revalidatePath("/", "layout");
  await rememberWorkspace(result.data.slug);
  return { ok: true as const, data: { slug: result.data.slug } };
}

export async function deleteWorkspaceAction(workspaceId: string) {
  const user = await requireUser();
  const result = await attempt(() => workspaces.deleteWorkspace(user.id, workspaceId));
  if (!result.ok) return result;
  (await cookies()).delete(LAST_WORKSPACE_COOKIE);
  redirect("/");
}
