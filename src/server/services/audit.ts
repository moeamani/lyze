import { and, desc, eq, lt } from "drizzle-orm";
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

export async function listAuditEvents(workspaceId: string, opts: { limit?: number; before?: Date } = {}) {
  const limit = Math.min(opts.limit ?? 50, 200);
  return db
    .select({
      id: auditEvents.id,
      action: auditEvents.action,
      entityType: auditEvents.entityType,
      entityId: auditEvents.entityId,
      metadata: auditEvents.metadata,
      createdAt: auditEvents.createdAt,
      actorName: users.name,
      actorEmail: users.email,
    })
    .from(auditEvents)
    .leftJoin(users, eq(users.id, auditEvents.actorId))
    .where(
      and(
        eq(auditEvents.workspaceId, workspaceId),
        opts.before ? lt(auditEvents.createdAt, opts.before) : undefined,
      ),
    )
    .orderBy(desc(auditEvents.createdAt))
    .limit(limit);
}
