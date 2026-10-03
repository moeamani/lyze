import { and, asc, eq, isNull, like, ne } from "drizzle-orm";
import { db } from "@/server/db";
import { memberships, projects, responses, studies, workspaces } from "@/server/db/schema";
import { slugify, uniqueSlug } from "@/lib/slug";
import {
  createWorkspaceSchema,
  updateWorkspaceSchema,
  type CreateWorkspaceInput,
  type UpdateWorkspaceInput,
} from "@/lib/validation";
import { TEMPLATES } from "@/lib/forms/templates";
import { recordAudit } from "./audit";
import { createPublishedForm } from "./forms";
import { seedDemoResponses } from "./demo";
import { seedDemoInterviews } from "./demo-interviews";
import { seedDemoCoding } from "./demo-coding";
import { seedDemoMixed } from "./demo-mixed";
import { requireWorkspace } from "./access";
import { AppError } from "./errors";

export async function listUserWorkspaces(userId: string) {
  return db
    .select({ id: workspaces.id, name: workspaces.name, slug: workspaces.slug, role: memberships.role })
    .from(memberships)
    .innerJoin(workspaces, eq(workspaces.id, memberships.workspaceId))
    .where(eq(memberships.userId, userId))
    .orderBy(asc(workspaces.name));
}

async function freeSlug(base: string, excludeId?: string) {
  const rows = await db
    .select({ slug: workspaces.slug })
    .from(workspaces)
    .where(and(like(workspaces.slug, `${base}%`), excludeId ? ne(workspaces.id, excludeId) : undefined));
  return uniqueSlug(base, rows.map((r) => r.slug));
}

export async function createWorkspace(userId: string, raw: CreateWorkspaceInput) {
  const input = createWorkspaceSchema.parse(raw);
  const slug = await freeSlug(slugify(input.name));

  return db.transaction(async (tx) => {
    const [workspace] = await tx
      .insert(workspaces)
      .values({ name: input.name, slug, createdById: userId })
      .returning();
    if (!workspace) throw new Error("Workspace insert failed");
    await tx.insert(memberships).values({ workspaceId: workspace.id, userId, role: "owner" });
    await recordAudit(tx, {
      workspaceId: workspace.id,
      actorId: userId,
      action: "workspace.created",
      entityType: "workspace",
      entityId: workspace.id,
      metadata: { name: workspace.name },
    });

    if (input.withDemo) {
      const [project] = await tx
        .insert(projects)
        .values({
          workspaceId: workspace.id,
          name: "Coffee habits (demo)",
          description: "A sample mixed-methods project to explore Lyze. Delete it whenever you like.",
          color: "amber",
          createdById: userId,
        })
        .returning();
      if (project) {
        const [survey, interviews] = await tx.insert(studies).values([
          {
            workspaceId: workspace.id,
            projectId: project.id,
            name: "Morning coffee survey",
            description: "How, when and why people drink coffee.",
            type: "survey",
            status: "live",
            isDemo: true,
            createdById: userId,
          },
          {
            workspaceId: workspace.id,
            projectId: project.id,
            name: "Café regulars interviews",
            description: "Follow-up conversations with five regulars.",
            type: "interview",
            status: "live",
            isDemo: true,
            createdById: userId,
          },
        ]).returning();
        // The demo survey comes with a ready-to-share form.
        if (survey) {
          const doc = TEMPLATES.coffee();
          const form = await createPublishedForm(tx, { workspaceId: workspace.id, studyId: survey.id, doc, userId });
          await seedDemoResponses(tx, { workspaceId: workspace.id, studyId: survey.id, formId: form.id, doc });
        }
        if (interviews) await seedDemoInterviews(tx, { workspaceId: workspace.id, studyId: interviews.id, userId });
        if (survey && interviews) {
          await seedDemoCoding(tx, { workspaceId: workspace.id, projectId: project.id, interviewStudyId: interviews.id, surveyStudyId: survey.id, userId });
          await seedDemoMixed(tx, { workspaceId: workspace.id, slug: workspace.slug, projectId: project.id, interviewStudyId: interviews.id, surveyStudyId: survey.id, userId });
        }
      }
    }
    return workspace;
  });
}

export async function updateWorkspace(userId: string, raw: UpdateWorkspaceInput) {
  const input = updateWorkspaceSchema.parse(raw);
  const { workspace } = await requireWorkspace(userId, input.workspaceId, "workspace:manage");

  if (input.slug !== workspace.slug) {
    const [clash] = await db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.slug, input.slug))
      .limit(1);
    if (clash) throw new AppError("conflict");
  }

  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(workspaces)
      .set({ name: input.name, slug: input.slug })
      .where(eq(workspaces.id, workspace.id))
      .returning();
    await recordAudit(tx, {
      workspaceId: workspace.id,
      actorId: userId,
      action: "workspace.updated",
      entityType: "workspace",
      entityId: workspace.id,
      metadata: { name: input.name, slug: input.slug },
    });
    return updated!;
  });
}

export async function deleteWorkspace(userId: string, workspaceId: string) {
  const { workspace } = await requireWorkspace(userId, workspaceId, "workspace:manage");
  await db.transaction(async (tx) => {
    await tx.delete(workspaces).where(eq(workspaces.id, workspace.id));
    // Workspace-scoped events cascade away; keep a global trace of the deletion.
    await recordAudit(tx, {
      workspaceId: null,
      actorId: userId,
      action: "workspace.deleted",
      entityType: "workspace",
      entityId: workspace.id,
      metadata: { name: workspace.name, slug: workspace.slug },
    });
  });
}

export async function workspaceCounts(workspaceId: string) {
  const [projectCount, studyCount, liveStudies, members, completed] = await Promise.all([
    db.$count(projects, and(eq(projects.workspaceId, workspaceId), isNull(projects.archivedAt))),
    db.$count(studies, eq(studies.workspaceId, workspaceId)),
    db.$count(studies, and(eq(studies.workspaceId, workspaceId), eq(studies.status, "live"))),
    db.$count(memberships, eq(memberships.workspaceId, workspaceId)),
    db.$count(responses, and(eq(responses.workspaceId, workspaceId), eq(responses.status, "complete"))),
  ]);
  return { projects: projectCount, studies: studyCount, liveStudies, members, responses: completed };
}
