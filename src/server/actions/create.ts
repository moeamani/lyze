"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { requireUser } from "@/server/auth";
import * as create from "@/server/services/create";
import { generateSampleTranscript } from "@/server/services/sessions";
import { attempt } from "./result";

export type CreateScope = { workspaceId: string; slug: string; projectId: string; studyId?: string; sessionId?: string };
export type CreateKind = "questionnaire" | "guide" | "responses" | "participants" | "codebook" | "transcript";

/** Generate something from the brief (or test data), per kind. Returns a short summary for the toast. */
export async function generateAction(scope: CreateScope, kind: CreateKind, count = 30) {
  const user = await requireUser();
  const locale = await getLocale();
  const s = scope.studyId ?? "";
  const result = await attempt(async (): Promise<Record<string, number>> => {
    switch (kind) {
      case "questionnaire":
        return { count: (await create.generateQuestionnaire(user.id, scope.workspaceId, s, locale)).questions };
      case "guide":
        return { count: (await create.generateGuide(user.id, scope.workspaceId, s, locale)).sections };
      case "responses":
        return create.generateResponses(user.id, scope.workspaceId, s, count);
      case "participants":
        return { count: (await create.generateParticipants(user.id, scope.workspaceId, s, count)).created };
      case "codebook":
        return { count: (await create.generateCodebook(user.id, scope.workspaceId, scope.projectId, locale)).created };
      case "transcript":
        return { count: (await generateSampleTranscript(user.id, scope.workspaceId, s, scope.sessionId ?? "")).segments };
    }
  });
  if (result.ok) revalidatePath(`/w/${scope.slug}/p/${scope.projectId}`, "layout");
  return result;
}

/** Import a CSV, per kind. */
export async function uploadAction(scope: CreateScope, kind: CreateKind, csv: string) {
  const user = await requireUser();
  const s = scope.studyId ?? "";
  const result = await attempt(async (): Promise<{ count: number; errors: number }> => {
    switch (kind) {
      case "questionnaire": {
        const r = await create.importQuestionnaire(user.id, scope.workspaceId, s, csv);
        return { count: r.questions, errors: r.errors.length };
      }
      case "guide": {
        const r = await create.importGuide(user.id, scope.workspaceId, s, csv);
        return { count: r.sections, errors: r.errors.length };
      }
      case "responses": {
        const r = await create.importResponses(user.id, scope.workspaceId, s, csv);
        return { count: r.count, errors: r.errorCount };
      }
      case "codebook": {
        const r = await create.importCodebookCsv(user.id, scope.workspaceId, scope.projectId, csv);
        return { count: r.created, errors: r.errors.length + r.skipped };
      }
      default: {
        const { importParticipants } = await import("@/server/services/participants");
        const r = await importParticipants(user.id, scope.workspaceId, s, csv);
        return { count: r.created, errors: r.skipped };
      }
    }
  });
  if (result.ok) revalidatePath(`/w/${scope.slug}/p/${scope.projectId}`, "layout");
  return result;
}

export async function responsesTemplateAction(scope: CreateScope) {
  const user = await requireUser();
  return attempt(async () => {
    const { requireWorkspace } = await import("@/server/services/access");
    await requireWorkspace(user.id, scope.workspaceId, "workspace:view");
    return create.responsesTemplate(scope.workspaceId, scope.studyId ?? "");
  });
}

export async function deleteGeneratedAction(scope: CreateScope) {
  const user = await requireUser();
  const result = await attempt(() => create.deleteGeneratedResponses(user.id, scope.workspaceId, scope.studyId ?? ""));
  if (result.ok) revalidatePath(`/w/${scope.slug}/p/${scope.projectId}`, "layout");
  return result;
}
