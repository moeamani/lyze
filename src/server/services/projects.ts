import { and, asc, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { projects, studies } from "@/server/db/schema";
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
      archivedAt: projects.archivedAt,
      updatedAt: projects.updatedAt,
      studyCount: sql<number>`(select count(*)::int from ${studies} where ${studies.projectId} = ${projects.id})`,
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
