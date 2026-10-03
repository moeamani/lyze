import { createHmac, randomBytes } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { apiKeys, webhooks } from "@/server/db/schema";
import { sha256 } from "@/server/crypto";
import { requireWorkspace } from "./access";
import { recordAudit } from "./audit";
import { AppError } from "./errors";

// ── API keys ────────────────────────────────────────────────────────────────

export async function listApiKeys(workspaceId: string) {
  return db
    .select({ id: apiKeys.id, name: apiKeys.name, prefix: apiKeys.prefix, lastUsedAt: apiKeys.lastUsedAt, createdAt: apiKeys.createdAt })
    .from(apiKeys)
    .where(eq(apiKeys.workspaceId, workspaceId))
    .orderBy(desc(apiKeys.createdAt));
}

/** Create a key. The secret is returned once; only its hash is stored. */
export async function createApiKey(userId: string, workspaceId: string, rawName: string) {
  await requireWorkspace(userId, workspaceId, "workspace:manage");
  const name = z.string().trim().min(1).max(60).parse(rawName);
  const secret = `lyze_${randomBytes(24).toString("base64url")}`;
  const [row] = await db.insert(apiKeys).values({ workspaceId, name, hashedKey: sha256(secret), prefix: secret.slice(0, 12), createdById: userId }).returning();
  await recordAudit(db, { workspaceId, actorId: userId, action: "workspace.api_key_created", entityType: "workspace", entityId: row!.id, metadata: { name } });
  return { id: row!.id, secret };
}

export async function revokeApiKey(userId: string, workspaceId: string, id: string) {
  await requireWorkspace(userId, workspaceId, "workspace:manage");
  const rows = await db.delete(apiKeys).where(and(eq(apiKeys.id, id), eq(apiKeys.workspaceId, workspaceId))).returning();
  if (!rows.length) throw new AppError("notFound");
  await recordAudit(db, { workspaceId, actorId: userId, action: "workspace.api_key_revoked", entityType: "workspace", entityId: id, metadata: { name: rows[0]!.name } });
}

/** The workspace a bearer token belongs to, or null. */
export async function authenticateApiKey(header: string | null): Promise<string | null> {
  const token = header?.match(/^Bearer\s+(lyze_[\w-]{20,})$/)?.[1];
  if (!token) return null;
  const [row] = await db.select({ id: apiKeys.id, workspaceId: apiKeys.workspaceId }).from(apiKeys).where(eq(apiKeys.hashedKey, sha256(token))).limit(1);
  if (!row) return null;
  await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, row.id));
  return row.workspaceId;
}

// ── Webhooks ────────────────────────────────────────────────────────────────

export const WEBHOOK_EVENTS = ["response.submitted", "transcript.ready", "consent.signed"] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

/** Webhooks may only call public addresses (no localhost or private networks) outside development. */
export function webhookUrlAllowed(raw: string, dev = process.env.NODE_ENV !== "production") {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" && !(dev && url.protocol === "http:")) return false;
  if (dev) return true;
  const h = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal") || h.endsWith(".local")) return false;
  if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h)) return false;
  if (h === "::1" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80")) return false;
  return true;
}

export async function listWebhooks(workspaceId: string) {
  return db.select().from(webhooks).where(eq(webhooks.workspaceId, workspaceId)).orderBy(desc(webhooks.createdAt));
}

export async function createWebhook(userId: string, workspaceId: string, raw: { url: string; events: string[] }) {
  await requireWorkspace(userId, workspaceId, "workspace:manage");
  const input = z.object({ url: z.string().trim().max(2000), events: z.array(z.enum(WEBHOOK_EVENTS)).min(1) }).parse(raw);
  if (!webhookUrlAllowed(input.url)) throw new AppError("invalid");
  const [row] = await db.insert(webhooks).values({ workspaceId, url: input.url, events: input.events, secret: `whsec_${randomBytes(24).toString("base64url")}` }).returning();
  await recordAudit(db, { workspaceId, actorId: userId, action: "workspace.webhook_created", entityType: "workspace", entityId: row!.id, metadata: { name: new URL(input.url).host } });
  return row!;
}

export async function deleteWebhook(userId: string, workspaceId: string, id: string) {
  await requireWorkspace(userId, workspaceId, "workspace:manage");
  await db.delete(webhooks).where(and(eq(webhooks.id, id), eq(webhooks.workspaceId, workspaceId)));
}

export const signPayload = (secret: string, body: string) => `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

/**
 * Send an event to every active webhook that listens for it. Signed with the hook's secret
 * (header `X-Lyze-Signature: sha256=<hmac of the body>`). Never throws; failures are recorded.
 */
export async function dispatchWebhooks(workspaceId: string, event: WebhookEvent, data: Record<string, unknown>) {
  try {
    const hooks = (await listWebhooks(workspaceId)).filter((h) => h.active && h.events.includes(event));
    await Promise.all(
      hooks.map(async (h) => {
        const body = JSON.stringify({ event, createdAt: new Date().toISOString(), data });
        let status = 0;
        try {
          if (!webhookUrlAllowed(h.url)) throw new Error("blocked");
          const res = await fetch(h.url, { method: "POST", headers: { "content-type": "application/json", "x-lyze-event": event, "x-lyze-signature": signPayload(h.secret, body) }, body, signal: AbortSignal.timeout(5000), redirect: "manual" });
          status = res.status;
        } catch {
          status = 0;
        }
        await db.update(webhooks).set({ lastStatus: status, lastDeliveredAt: new Date() }).where(eq(webhooks.id, h.id));
      }),
    );
  } catch (error) {
    console.error("webhook dispatch failed", event, error);
  }
}
