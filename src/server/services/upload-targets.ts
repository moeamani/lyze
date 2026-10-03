import { z } from "zod";
import { PROPOSAL_MAX_BYTES, PROPOSAL_TYPES } from "@/lib/writeup/extract";
import type { UploadTarget } from "@/server/storage/direct";
import { requireWorkspace } from "./access";
import { AppError } from "./errors";
import { getProject } from "./projects";
import { answerUploadTarget } from "./respondent";
import { mediaMaxBytes, sessionForMember } from "./sessions";

/** What a direct upload is for; the server works out where it may go from this. */
export const uploadPurpose = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("media"), sessionId: z.string().min(1).max(64) }),
  z.object({ kind: z.literal("answer"), publicId: z.string().min(1).max(64), token: z.string().min(10).max(128), questionId: z.string().min(1).max(64) }),
  z.object({ kind: z.literal("proposal"), workspaceId: z.string().min(1).max(64), projectId: z.string().min(1).max(64) }),
]);
export type UploadPurpose = z.infer<typeof uploadPurpose>;

export const mediaTarget = (workspaceId: string, sessionId: string): UploadTarget => ({ prefix: `${workspaceId}/sessions/${sessionId}/`, maxBytes: mediaMaxBytes(), contentTypes: ["audio/*", "video/*"] });
export const proposalTarget = (workspaceId: string, projectId: string): UploadTarget => ({ prefix: `${workspaceId}/projects/${projectId}/`, maxBytes: PROPOSAL_MAX_BYTES, contentTypes: Object.keys(PROPOSAL_TYPES) });

/** Check the caller may upload for this purpose, and return where to. Respondents need no account. */
export async function uploadTarget(userId: string | null, purpose: UploadPurpose): Promise<UploadTarget> {
  switch (purpose.kind) {
    case "media": {
      if (!userId) throw new AppError("unauthorized");
      const session = await sessionForMember(userId, purpose.sessionId, "content:edit");
      return mediaTarget(session.workspaceId, session.id);
    }
    case "proposal": {
      if (!userId) throw new AppError("unauthorized");
      await requireWorkspace(userId, purpose.workspaceId, "content:edit");
      await getProject(purpose.workspaceId, purpose.projectId);
      return proposalTarget(purpose.workspaceId, purpose.projectId);
    }
    case "answer":
      return answerUploadTarget(purpose.publicId, purpose.token, purpose.questionId);
  }
}
