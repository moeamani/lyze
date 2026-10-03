import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { workspaceAi } from "@/server/db/schema";
import { seal, unseal } from "@/server/crypto";
import { AI_PROVIDERS, AI_PROVIDER_IDS, isProviderId, type AiProviderId } from "@/lib/ai-providers";
import type { LlmConfig } from "@/server/ai/llm";
import { requireWorkspace } from "./access";
import { recordAudit } from "./audit";
import { AppError } from "./errors";

export const DEFAULT_MODEL = "claude-opus-5-5";
/** Lyze AI's default when LYZE_AI_KEY is a Google Gemini key. */
export const LYZE_DEFAULT_MODEL = "gemini-3.8-flash";
/** Used when the default is overloaded (common on free tiers). */
export const LYZE_FALLBACK_MODEL = "gemini-3.5-flash-lite";

/** The workspace's own provider and key, as shown in settings (never the key itself). */
export type OwnAi = { provider: AiProviderId; hint: string | null; model: string; baseUrl: string | null };
export type AiStatus = {
  /** Lyze's built-in model is available (the server has a key), so nobody needs their own. */
  lyze: boolean;
  /** The workspace's own key, if an owner added one. */
  own: OwnAi | null;
};

/**
 * Lyze AI: the model the server provides for everyone, set with LYZE_AI_KEY (a Google Gemini key by
 * default; LYZE_AI_PROVIDER, LYZE_AI_MODEL and LYZE_AI_BASE_URL pick something else). An older
 * ANTHROPIC_API_KEY setup still works as the fallback.
 */
export function lyzeCredentials(): LlmConfig | null {
  const key = process.env.LYZE_AI_KEY?.trim();
  const provider = isProviderId(process.env.LYZE_AI_PROVIDER) ? process.env.LYZE_AI_PROVIDER : "gemini";
  if (key || (process.env.LYZE_AI_PROVIDER && AI_PROVIDERS[provider].needsKey !== true)) {
    const model = process.env.LYZE_AI_MODEL?.trim() || (provider === "gemini" ? LYZE_DEFAULT_MODEL : AI_PROVIDERS[provider].models[0] || "");
    const fallbackModel = process.env.LYZE_AI_FALLBACK_MODEL?.trim() || (provider === "gemini" ? LYZE_FALLBACK_MODEL : null);
    return { provider, apiKey: key ?? "", model, baseUrl: process.env.LYZE_AI_BASE_URL || null, fallbackModel };
  }
  if (process.env.ANTHROPIC_API_KEY) return { provider: "anthropic", apiKey: process.env.ANTHROPIC_API_KEY, model: process.env.AI_MODEL || DEFAULT_MODEL };
  return null;
}

async function ownRow(workspaceId: string) {
  const [row] = await db.select().from(workspaceAi).where(eq(workspaceAi.workspaceId, workspaceId)).limit(1);
  if (!row) return null;
  const provider: AiProviderId = isProviderId(row.provider) ? row.provider : "anthropic";
  return { row, provider, model: row.model || AI_PROVIDERS[provider].models[0] || "" };
}

/** What AI this workspace can use: Lyze AI, its own key, both, or neither. */
export async function aiStatus(workspaceId: string): Promise<AiStatus> {
  const own = await ownRow(workspaceId);
  return {
    lyze: lyzeCredentials() !== null,
    own: own ? { provider: own.provider, hint: own.row.keyHint || null, model: own.model, baseUrl: own.row.baseUrl } : null,
  };
}

/** What to call the model with, or null when that source isn't set up. Server-only: includes the secret. */
export async function aiCredentials(workspaceId: string, source: "lyze" | "own"): Promise<LlmConfig | null> {
  if (source === "lyze") return lyzeCredentials();
  const own = await ownRow(workspaceId);
  if (!own) return null;
  const apiKey = unseal(own.row.apiKeyEnc);
  if (apiKey === null) return null;
  return { provider: own.provider, apiKey, model: own.model, baseUrl: own.row.baseUrl };
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
  const creds = await aiCredentials(workspaceId, "own");
  if (!creds) return { ok: false as const, reason: "missing" as const };
  const { pingLlm } = await import("@/server/ai/llm");
  const result = await pingLlm(creds);
  return result === "ok" ? { ok: true as const } : { ok: false as const, reason: result };
}
