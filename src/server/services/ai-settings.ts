import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { workspaceAi } from "@/server/db/schema";
import { seal, unseal } from "@/server/crypto";
import { AI_PROVIDERS, AI_PROVIDER_IDS, type AiProviderId } from "@/lib/ai-providers";
import type { LlmConfig } from "@/server/ai/llm";
import { requireWorkspace } from "./access";
import { recordAudit } from "./audit";
import { AppError } from "./errors";

export const DEFAULT_MODEL = "claude-opus-5-5";

export type AiStatus = { configured: boolean; source: "workspace" | "server" | null; provider: AiProviderId; hint: string | null; model: string; baseUrl: string | null };

/** Whether this workspace can use AI, and with what: its own provider and key, or the server's Anthropic key. */
export async function aiStatus(workspaceId: string): Promise<AiStatus> {
  const [row] = await db.select().from(workspaceAi).where(eq(workspaceAi.workspaceId, workspaceId)).limit(1);
  if (row) {
    const provider = (AI_PROVIDER_IDS as readonly string[]).includes(row.provider) ? (row.provider as AiProviderId) : "anthropic";
    return { configured: true, source: "workspace", provider, hint: row.keyHint || null, model: row.model || AI_PROVIDERS[provider].models[0] || "", baseUrl: row.baseUrl };
  }
  if (process.env.ANTHROPIC_API_KEY) return { configured: true, source: "server", provider: "anthropic", hint: null, model: process.env.AI_MODEL || DEFAULT_MODEL, baseUrl: null };
  return { configured: false, source: null, provider: "anthropic", hint: null, model: DEFAULT_MODEL, baseUrl: null };
}

/** The id generated drafts and suggestions are labelled with ("builtin" when no AI is set up). */
export async function assistantName(workspaceId: string) {
  const s = await aiStatus(workspaceId);
  return !s.configured ? "builtin" : s.provider === "anthropic" ? "claude" : s.provider;
}

/** What to call the model with, or null when AI isn't set up. Server-only: includes the secret. */
export async function aiCredentials(workspaceId: string): Promise<LlmConfig | null> {
  const [row] = await db.select().from(workspaceAi).where(eq(workspaceAi.workspaceId, workspaceId)).limit(1);
  if (row) {
    const provider = (AI_PROVIDER_IDS as readonly string[]).includes(row.provider) ? (row.provider as AiProviderId) : "anthropic";
    const apiKey = unseal(row.apiKeyEnc);
    if (apiKey === null) return null;
    return { provider, apiKey, model: row.model || AI_PROVIDERS[provider].models[0] || "", baseUrl: row.baseUrl };
  }
  if (process.env.ANTHROPIC_API_KEY) return { provider: "anthropic", apiKey: process.env.ANTHROPIC_API_KEY, model: process.env.AI_MODEL || DEFAULT_MODEL };
  return null;
}

const settingsSchema = z.object({
  provider: z.enum(AI_PROVIDER_IDS),
  apiKey: z.string().trim().max(400).optional(),
  model: z.string().trim().min(1).max(200),
  baseUrl: z.string().trim().max(500).optional(),
});

/**
 * Save the workspace's provider, model and (optionally) a new key. Leaving the key empty keeps the
 * saved one, unless the provider changed and needs a key. Owners only.
 */
export async function saveAiSettings(userId: string, workspaceId: string, raw: z.input<typeof settingsSchema>) {
  await requireWorkspace(userId, workspaceId, "workspace:manage");
  const input = settingsSchema.parse(raw);
  const info = AI_PROVIDERS[input.provider];
  const [existing] = await db.select().from(workspaceAi).where(eq(workspaceAi.workspaceId, workspaceId)).limit(1);
  const sameProvider = existing?.provider === input.provider;
  if (info.needsKey === true && !input.apiKey && !sameProvider) throw new AppError("invalid");
  let baseUrl: string | null = null;
  if (info.editableUrl) {
    baseUrl = input.baseUrl || info.baseUrl || "";
    try {
      const u = new URL(baseUrl);
      if (!/^https?:$/.test(u.protocol)) throw new Error();
    } catch {
      throw new AppError("invalid");
    }
  }
  const key = input.apiKey ?? (sameProvider && existing ? unseal(existing.apiKeyEnc) ?? "" : "");
  const values = { provider: input.provider, apiKeyEnc: seal(key), keyHint: key.slice(-4), model: input.model, baseUrl, updatedById: userId };
  if (existing) await db.update(workspaceAi).set({ ...values, updatedAt: new Date() }).where(eq(workspaceAi.workspaceId, workspaceId));
  else await db.insert(workspaceAi).values({ workspaceId, ...values });
  await recordAudit(db, { workspaceId, actorId: userId, action: "workspace.ai_updated", entityType: "workspace", entityId: workspaceId, metadata: { provider: input.provider, model: input.model, keyChanged: !!input.apiKey } });
}

export async function removeAiKey(userId: string, workspaceId: string) {
  await requireWorkspace(userId, workspaceId, "workspace:manage");
  await db.delete(workspaceAi).where(eq(workspaceAi.workspaceId, workspaceId));
  await recordAudit(db, { workspaceId, actorId: userId, action: "workspace.ai_updated", entityType: "workspace", entityId: workspaceId, metadata: { removed: true } });
}

/** Check the saved key and endpoint by listing models (no tokens spent). */
export async function checkAiKey(userId: string, workspaceId: string) {
  await requireWorkspace(userId, workspaceId, "workspace:manage");
  const creds = await aiCredentials(workspaceId);
  if (!creds) return { ok: false as const, reason: "missing" as const };
  const { pingLlm } = await import("@/server/ai/llm");
  const result = await pingLlm(creds);
  return result === "ok" ? { ok: true as const } : { ok: false as const, reason: result };
}
