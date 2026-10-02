import { and, desc, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { projects, studies } from "@/server/db/schema";
import { studySchema, studyUpdateSchema, type StudyInput, type StudyUpdateInput } from "@/lib/validation";
import { recordAudit } from "./audit";
import { requireWorkspace } from "./access";
import { AppError } from "./errors";
import { getProject } from "./projects";

export async function listStudies(workspaceId: string, projectId: string) {
  return db
    .select()
    .from(studies)
    .where(and(eq(studies.workspaceId, workspaceId), eq(studies.projectId, projectId)))
    .orderBy(desc(studies.updatedAt));
}

export async function recentStudies(workspaceId: string, limit = 6) {
  return db
    .select({
      id: studies.id,
      name: studies.name,
      type: studies.type,
      status: studies.status,
      updatedAt: studies.updatedAt,
      projectId: projects.id,
      projectName: projects.name,
      projectColor: projects.color,
    })
    .from(studies)
    .innerJoin(projects, eq(projects.id, studies.projectId))
    .where(eq(studies.workspaceId, workspaceId))
    .orderBy(desc(studies.updatedAt))
    .limit(limit);
}

export async function getStudy(workspaceId: string, projectId: string, studyId: string) {
  const [study] = await db
    .select()
    .from(studies)
    .where(and(eq(studies.id, studyId), eq(studies.projectId, projectId), eq(studies.workspaceId, workspaceId)))
    .limit(1);
  if (!study) throw new AppError("notFound");
  return study;
}

async function touchProject(executor: Pick<typeof db, "update">, projectId: string) {
  await executor.update(projects).set({ updatedAt: new Date() }).where(eq(projects.id, projectId));
}

export async function createStudy(userId: string, workspaceId: string, projectId: string, raw: StudyInput) {
  const input = studySchema.parse(raw);
  await requireWorkspace(userId, workspaceId, "content:edit");
  await getProject(workspaceId, projectId);
  return db.transaction(async (tx) => {
    const [study] = await tx
      .insert(studies)
      .values({ workspaceId, projectId, createdById: userId, ...input })
      .returning();
    await touchProject(tx, projectId);
    await recordAudit(tx, {
      workspaceId,
      actorId: userId,
      action: "study.created",
      entityType: "study",
      entityId: study!.id,
      metadata: { name: input.name, type: input.type },
    });
    return study!;
  });
}

export async function updateStudy(
  userId: string,
  workspaceId: string,
  projectId: string,
  studyId: string,
  raw: StudyUpdateInput,
) {
  const input = studyUpdateSchema.parse(raw);
  await requireWorkspace(userId, workspaceId, "content:edit");
  const before = await getStudy(workspaceId, projectId, studyId);
  return db.transaction(async (tx) => {
    const [study] = await tx
      .update(studies)
      .set({ name: input.name, description: input.description ?? null, status: input.status })
      .where(eq(studies.id, studyId))
      .returning();
    await touchProject(tx, projectId);
    await recordAudit(tx, {
      workspaceId,
      actorId: userId,
      action: before.status !== input.status ? "study.status_changed" : "study.updated",
      entityType: "study",
      entityId: studyId,
      metadata: { name: input.name, from: before.status, to: input.status },
    });
    return study!;
  });
}

export async function deleteStudy(userId: string, workspaceId: string, projectId: string, studyId: string) {
  await requireWorkspace(userId, workspaceId, "content:edit");
  const study = await getStudy(workspaceId, projectId, studyId);
  await db.transaction(async (tx) => {
    await tx.delete(studies).where(eq(studies.id, studyId));
    await recordAudit(tx, {
      workspaceId,
      actorId: userId,
      action: "study.deleted",
      entityType: "study",
      entityId: studyId,
      metadata: { name: study.name },
    });
  });
}
