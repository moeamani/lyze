import { and, desc, eq, gte, ilike, inArray, lt, or, sql } from "drizzle-orm";
import { db, type Database } from "@/server/db";
import { auditEvents, users } from "@/server/db/schema";

type Executor = Pick<Database, "insert">;

export type AuditInput = {
  workspaceId: string | null;
  actorId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
};

export async function recordAudit(executor: Executor, input: AuditInput) {
  await executor.insert(auditEvents).values({
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    metadata: input.metadata ?? {},
  });
}

/** Activity categories, used for filters and the colored icon of each event. */
export const ACTIVITY_CATEGORIES = ["workspace", "project", "study", "member", "form", "response", "participant", "session", "coding", "writeup"] as const;
export type ActivityCategory = (typeof ACTIVITY_CATEGORIES)[number];

/** Which entity types belong to each category. */
const CATEGORY_ENTITIES: Record<ActivityCategory, string[]> = {
  workspace: ["workspace", "invite"],
  project: ["project"],
  study: ["study", "analysis", "export"],
  member: ["member", "membership"],
  form: ["form"],
  response: ["response"],
  participant: ["participant", "consent"],
  session: ["session", "transcript"],
  coding: ["code", "coding", "theme", "memo"],
  writeup: ["writeup", "brief"],
};

export function categoryOf(action: string, entityType: string): ActivityCategory {
  for (const c of ACTIVITY_CATEGORIES) if (CATEGORY_ENTITIES[c].includes(entityType)) return c;
  const head = action.split(".")[0]!;
  return (ACTIVITY_CATEGORIES as readonly string[]).includes(head) ? (head as ActivityCategory) : "workspace";
}

export type ActivityFilter = { categories?: ActivityCategory[]; actorId?: string; from?: Date; to?: Date; q?: string };

export async function listAuditEvents(workspaceId: string, opts: { limit?: number; before?: Date } & ActivityFilter = {}) {
  const limit = Math.min(opts.limit ?? 50, 200);
  const entities = opts.categories?.length ? opts.categories.flatMap((c) => CATEGORY_ENTITIES[c]) : null;
  const actions = opts.categories?.length ? opts.categories.map((c) => `${c}.%`) : null;
  const q = opts.q?.trim();
  return db
    .select({
      id: auditEvents.id,
      action: auditEvents.action,
      entityType: auditEvents.entityType,
      entityId: auditEvents.entityId,
      metadata: auditEvents.metadata,
      createdAt: auditEvents.createdAt,
      actorId: auditEvents.actorId,
      actorName: users.name,
      actorEmail: users.email,
    })
    .from(auditEvents)
    .leftJoin(users, eq(users.id, auditEvents.actorId))
    .where(
      and(
        eq(auditEvents.workspaceId, workspaceId),
        opts.before ? lt(auditEvents.createdAt, opts.before) : undefined,
        opts.from ? gte(auditEvents.createdAt, opts.from) : undefined,
        opts.to ? lt(auditEvents.createdAt, opts.to) : undefined,
        opts.actorId ? eq(auditEvents.actorId, opts.actorId) : undefined,
        entities && actions ? or(inArray(auditEvents.entityType, entities), ...actions.map((a) => sql`${auditEvents.action} like ${a}`)) : undefined,
        q ? or(ilike(sql`${auditEvents.metadata}::text`, `%${q.replace(/[%_\\]/g, "\\$&")}%`), ilike(users.name, `%${q}%`), ilike(users.email, `%${q}%`)) : undefined,
      ),
    )
    .orderBy(desc(auditEvents.createdAt))
    .limit(limit);
}

/** Event counts per category over the last `days` days, for the activity summary strip. */
export async function activityCounts(workspaceId: string, days = 30) {
  const since = new Date(Date.now() - days * 864e5);
  const rows = await db
    .select({ action: auditEvents.action, entityType: auditEvents.entityType, n: sql<number>`count(*)::int` })
    .from(auditEvents)
    .where(and(eq(auditEvents.workspaceId, workspaceId), gte(auditEvents.createdAt, since)))
    .groupBy(auditEvents.action, auditEvents.entityType);
  const out = Object.fromEntries(ACTIVITY_CATEGORIES.map((c) => [c, 0])) as Record<ActivityCategory, number>;
  for (const r of rows) out[categoryOf(r.action, r.entityType)] += r.n;
  return out;
}
