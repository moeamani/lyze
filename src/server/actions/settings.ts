"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth";
import { checkAiKey, removeAiKey, saveAiSettings } from "@/server/services/ai-settings";
import { attempt } from "./result";
import * as api from "@/server/services/api";

type Scope = { workspaceId: string; slug: string };

export async function saveAiSettingsAction(scope: Scope, input: { provider: string; apiKey?: string; model: string; baseUrl?: string }) {
  const user = await requireUser();
  const r = await attempt(() => saveAiSettings(user.id, scope.workspaceId, { provider: input.provider as "anthropic", apiKey: input.apiKey || undefined, model: input.model, baseUrl: input.baseUrl || undefined }));
  if (r.ok) revalidatePath(`/w/${scope.slug}`, "layout");
  return r;
}
export async function removeAiKeyAction(scope: Scope) {
  const user = await requireUser();
  const r = await attempt(() => removeAiKey(user.id, scope.workspaceId));
  if (r.ok) revalidatePath(`/w/${scope.slug}`, "layout");
  return r;
}
export async function checkAiKeyAction(scope: Scope) {
  const user = await requireUser();
  return attempt(() => checkAiKey(user.id, scope.workspaceId));
}

export async function createApiKeyAction(scope: Scope, name: string) {
  const user = await requireUser();
  const r = await attempt(() => api.createApiKey(user.id, scope.workspaceId, name));
  if (r.ok) revalidatePath(`/w/${scope.slug}/settings/api`);
  return r;
}
export async function revokeApiKeyAction(scope: Scope, id: string) {
  const user = await requireUser();
  const r = await attempt(() => api.revokeApiKey(user.id, scope.workspaceId, id));
  if (r.ok) revalidatePath(`/w/${scope.slug}/settings/api`);
  return r;
}
export async function createWebhookAction(scope: Scope, input: { url: string; events: string[] }) {
  const user = await requireUser();
  const r = await attempt(async () => (await api.createWebhook(user.id, scope.workspaceId, input)).id);
  if (r.ok) revalidatePath(`/w/${scope.slug}/settings/api`);
  return r;
}
export async function deleteWebhookAction(scope: Scope, id: string) {
  const user = await requireUser();
  const r = await attempt(() => api.deleteWebhook(user.id, scope.workspaceId, id));
  if (r.ok) revalidatePath(`/w/${scope.slug}/settings/api`);
  return r;
}
