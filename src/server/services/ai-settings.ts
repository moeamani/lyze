import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { workspaceAi } from "@/server/db/schema";
import { seal, unseal } from "@/server/crypto";
import { requireWorkspace } from "./access";
import { recordAudit } from "./audit";

export const AI_MODELS = ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-4-5-20251001"] as const;
export const DEFAULT_MODEL = "claude-opus-5-5";

export type AiStatus = { configured: boolean; source: "workspace" | "server" | null; hint: string | null; model: string };

/** Whether this workspace can use AI, and with which key: its own, or the server's (ANTHROPIC_API_KEY). */
export async function aiStatus(workspaceId: string): Promise<AiStatus> {
  const [row] = await db.select().from(workspaceAi).where(eq(workspaceAi.workspaceId, workspaceId)).limit(1);
  if (row) return { configured: true, source: "workspace", hint: row.keyHint, model: row.model || DEFAULT_MODEL };
  if (process.env.ANTHROPIC_API_KEY) return { configured: true, source: "server", hint: null, model: process.env.AI_MODEL || DEFAULT_MODEL };
  return { configured: false, source: null, hint: null, model: DEFAULT_MODEL };
}

/** The key and model to call the API with, or null when AI isn't set up. Server-only. */
export async function aiCredentials(workspaceId: string): Promise<{ apiKey: string; model: string } | null> {
  const [row] = await db.select().from(workspaceAi).where(eq(workspaceAi.workspaceId, workspaceId)).limit(1);
  const own = row ? unseal(row.apiKeyEnc) : null;
  if (own) return { apiKey: own, model: row!.model || DEFAULT_MODEL };
  if (process.env.ANTHROPIC_API_KEY) return { apiKey: process.env.ANTHROPIC_API_KEY, model: process.env.AI_MODEL || DEFAULT_MODEL };
  return null;
}

const keySchema = z.object({
  apiKey: z.string().trim().min(20).max(400).optional(),
  model: z.enum(AI_MODELS).default(DEFAULT_MODEL),
});

/** Save (or replace) the workspace's key; with no key given, only the model changes. Owners only. */
export async function saveAiSettings(userId: string, workspaceId: string, raw: z.input<typeof keySchema>) {
  await requireWorkspace(userId, workspaceId, "workspace:manage");
  const input = keySchema.parse(raw);
  const [existing] = await db.select().from(workspaceAi).where(eq(workspaceAi.workspaceId, workspaceId)).limit(1);
  if (!input.apiKey && !existing) throw new (await import("./errors")).AppError("invalid");
  const values = input.apiKey
    ? { apiKeyEnc: seal(input.apiKey), keyHint: input.apiKey.slice(-4), model: input.model, updatedById: userId }
    : { model: input.model, updatedById: userId };
  if (existing) await db.update(workspaceAi).set({ ...values, updatedAt: new Date() }).where(eq(workspaceAi.workspaceId, workspaceId));
  else await db.insert(workspaceAi).values({ workspaceId, ...(values as { apiKeyEnc: string; keyHint: string; model: string; updatedById: string }) });
  await recordAudit(db, { workspaceId, actorId: userId, action: "workspace.ai_updated", entityType: "workspace", entityId: workspaceId, metadata: { model: input.model, keyChanged: !!input.apiKey } });
}

export async function removeAiKey(userId: string, workspaceId: string) {
  await requireWorkspace(userId, workspaceId, "workspace:manage");
  await db.delete(workspaceAi).where(eq(workspaceAi.workspaceId, workspaceId));
  await recordAudit(db, { workspaceId, actorId: userId, action: "workspace.ai_updated", entityType: "workspace", entityId: workspaceId, metadata: { removed: true } });
}

/** Check a key works by listing models (no tokens spent). */
export async function checkAiKey(userId: string, workspaceId: string) {
  await requireWorkspace(userId, workspaceId, "workspace:manage");
  const creds = await aiCredentials(workspaceId);
  if (!creds) return { ok: false as const, reason: "missing" as const };
  try {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    await new Anthropic({ apiKey: creds.apiKey }).models.list({ limit: 1 });
    return { ok: true as const };
  } catch (e) {
    const status = (e as { status?: number }).status;
    return { ok: false as const, reason: status === 401 || status === 403 ? ("rejected" as const) : ("unreachable" as const) };
  }
}
