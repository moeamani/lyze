import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth";
import { requireWorkspaceBySlug } from "@/server/services/access";
import { isAppError } from "@/server/services/errors";
import { getProject } from "@/server/services/projects";
import { getStudy } from "@/server/services/studies";

/** Signed-in user + workspace membership for a `/w/[ws]` route. 404s for non-members. */
export const getWorkspaceContext = cache(async (slug: string) => {
  const user = await requireUser(`/w/${slug}`);
  try {
    const access = await requireWorkspaceBySlug(user.id, slug);
    return { user, workspace: access.workspace, role: access.role };
  } catch (error) {
    if (isAppError(error) && error.code === "notFound") notFound();
    throw error;
  }
});

export const getProjectContext = cache(async (slug: string, projectId: string) => {
  const ctx = await getWorkspaceContext(slug);
  try {
    return { ...ctx, project: await getProject(ctx.workspace.id, projectId) };
  } catch (error) {
    if (isAppError(error) && error.code === "notFound") notFound();
    throw error;
  }
});

export const getStudyContext = cache(async (slug: string, projectId: string, studyId: string) => {
  const ctx = await getProjectContext(slug, projectId);
  try {
    return { ...ctx, study: await getStudy(ctx.workspace.id, projectId, studyId) };
  } catch (error) {
    if (isAppError(error) && error.code === "notFound") notFound();
    throw error;
  }
});
