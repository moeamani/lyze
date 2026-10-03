import { and, asc, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { projectGroups, projects } from "@/server/db/schema";
import { z } from "zod";
import { projectSchema, type ProjectInput } from "@/lib/validation";
import { recordAudit } from "./audit";
import { requireWorkspace } from "./access";
import { AppError } from "./errors";

export async function listProjects(workspaceId: string, opts: { archived?: boolean } = {}) {
  return db
    .select({
      id: projects.id,
      name: projects.name,
      description: projects.description,
      color: projects.color,
      groupId: projects.groupId,
      archivedAt: projects.archivedAt,
      updatedAt: projects.updatedAt,
      studyCount: sql<number>`(select count(*)::int from "studies" where "studies"."project_id" = "projects"."id")`,
    })
    .from(projects)
    .where(
      and(
        eq(projects.workspaceId, workspaceId),
        opts.archived ? isNotNull(projects.archivedAt) : isNull(projects.archivedAt),
      ),
    )
    .orderBy(desc(projects.updatedAt), asc(projects.name));
}

/** Fetch a project, ensuring it belongs to the workspace the caller already has access to. */
export async function getProject(workspaceId: string, projectId: string) {
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.workspaceId, workspaceId)))
    .limit(1);
  if (!project) throw new AppError("notFound");
  return project;
}

export async function createProject(userId: string, workspaceId: string, raw: ProjectInput) {
  const input = projectSchema.parse(raw);
  await requireWorkspace(userId, workspaceId, "content:edit");
  return db.transaction(async (tx) => {
    const [project] = await tx
      .insert(projects)
      .values({ workspaceId, createdById: userId, ...input })
      .returning();
    await recordAudit(tx, {
      workspaceId,
      actorId: userId,
      action: "project.created",
      entityType: "project",
      entityId: project!.id,
      metadata: { name: input.name },
    });
    return project!;
  });
}

export async function updateProject(userId: string, workspaceId: string, projectId: string, raw: ProjectInput) {
  const input = projectSchema.parse(raw);
  await requireWorkspace(userId, workspaceId, "content:edit");
  await getProject(workspaceId, projectId);
  return db.transaction(async (tx) => {
    const [project] = await tx
      .update(projects)
      .set({ name: input.name, description: input.description ?? null, color: input.color })
      .where(eq(projects.id, projectId))
      .returning();
    await recordAudit(tx, {
      workspaceId,
      actorId: userId,
      action: "project.updated",
      entityType: "project",
      entityId: projectId,
      metadata: { name: input.name },
    });
    return project!;
  });
}

export async function setProjectArchived(userId: string, workspaceId: string, projectId: string, archived: boolean) {
  await requireWorkspace(userId, workspaceId, "content:edit");
  const project = await getProject(workspaceId, projectId);
  await db.transaction(async (tx) => {
    await tx
      .update(projects)
      .set({ archivedAt: archived ? new Date() : null })
      .where(eq(projects.id, projectId));
    await recordAudit(tx, {
      workspaceId,
      actorId: userId,
      action: archived ? "project.archived" : "project.restored",
      entityType: "project",
      entityId: projectId,
      metadata: { name: project.name },
    });
  });
}

export async function deleteProject(userId: string, workspaceId: string, projectId: string) {
  await requireWorkspace(userId, workspaceId, "content:edit");
  const project = await getProject(workspaceId, projectId);
  await db.transaction(async (tx) => {
    await tx.delete(projects).where(eq(projects.id, projectId));
    await recordAudit(tx, {
      workspaceId,
      actorId: userId,
      action: "project.deleted",
      entityType: "project",
      entityId: projectId,
      metadata: { name: project.name },
    });
  });
}

// ── Groups: custom folders on the projects page ──────────────────────────────

const groupName = z.string().trim().min(1).max(60);

export async function listGroups(workspaceId: string) {
  return db.select().from(projectGroups).where(eq(projectGroups.workspaceId, workspaceId)).orderBy(asc(projectGroups.position), asc(projectGroups.createdAt));
}

export async function createGroup(userId: string, workspaceId: string, rawName: string) {
  const name = groupName.parse(rawName);
  await requireWorkspace(userId, workspaceId, "content:edit");
  const [{ next } = { next: 0 }] = await db
    .select({ next: sql<number>`coalesce(max(${projectGroups.position}) + 1, 0)::int` })
    .from(projectGroups)
    .where(eq(projectGroups.workspaceId, workspaceId));
  const [group] = await db.insert(projectGroups).values({ workspaceId, name, position: next }).returning();
  return group!;
}

async function requireGroup(workspaceId: string, groupId: string) {
  const [group] = await db.select().from(projectGroups).where(and(eq(projectGroups.id, groupId), eq(projectGroups.workspaceId, workspaceId))).limit(1);
  if (!group) throw new AppError("notFound");
  return group;
}

export async function renameGroup(userId: string, workspaceId: string, groupId: string, rawName: string) {
  const name = groupName.parse(rawName);
  await requireWorkspace(userId, workspaceId, "content:edit");
  await requireGroup(workspaceId, groupId);
  await db.update(projectGroups).set({ name }).where(eq(projectGroups.id, groupId));
}

/** Deleting a group keeps its projects; they become ungrouped. */
export async function deleteGroup(userId: string, workspaceId: string, groupId: string) {
  await requireWorkspace(userId, workspaceId, "content:edit");
  await requireGroup(workspaceId, groupId);
  await db.delete(projectGroups).where(eq(projectGroups.id, groupId));
}

export async function moveGroup(userId: string, workspaceId: string, groupId: string, direction: "up" | "down") {
  await requireWorkspace(userId, workspaceId, "content:edit");
  const all = await listGroups(workspaceId);
  const i = all.findIndex((g) => g.id === groupId);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i < 0) throw new AppError("notFound");
  if (j < 0 || j >= all.length) return;
  [all[i], all[j]] = [all[j]!, all[i]!];
  await db.transaction(async (tx) => {
    for (const [position, g] of all.entries()) await tx.update(projectGroups).set({ position }).where(eq(projectGroups.id, g.id));
  });
}

export async function setProjectGroup(userId: string, workspaceId: string, projectId: string, groupId: string | null) {
  await requireWorkspace(userId, workspaceId, "content:edit");
  await getProject(workspaceId, projectId);
  if (groupId) await requireGroup(workspaceId, groupId);
  await db.update(projects).set({ groupId }).where(eq(projects.id, projectId));
}
