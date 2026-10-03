import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/server/db";
import { userHandle } from "@/server/db/user-handle";
import { codeApplications, participants, researchSessions, segments, studies, transcripts, users } from "@/server/db/schema";
import type { CodeInfo, Coding, Person } from "@/lib/qual/patterns";
import { listCodes } from "./codebook";

/**
 * Everything the interview patterns need for a project: its participants with their attributes,
 * every coding on a transcript turn (who said it, who coded it), and the coders. Interviewer turns
 * are left out: patterns are about what participants said.
 */
export async function patternsData(workspaceId: string, projectId: string) {
  const [people, rows, codes] = await Promise.all([
    db
      .select({ id: participants.id, code: participants.code, attributes: participants.attributes })
      .from(participants)
      .innerJoin(studies, eq(studies.id, participants.studyId))
      .where(and(eq(studies.projectId, projectId), eq(participants.workspaceId, workspaceId))),
    db
      .select({
        codeId: codeApplications.codeId,
        unitId: codeApplications.segmentId,
        coderId: codeApplications.createdById,
        source: codeApplications.source,
        approved: codeApplications.approvedAt,
        speaker: segments.speaker,
        speakers: transcripts.speakers,
        transcriptId: transcripts.id,
      })
      .from(codeApplications)
      .innerJoin(segments, eq(segments.id, codeApplications.segmentId))
      .innerJoin(transcripts, eq(transcripts.id, segments.transcriptId))
      .innerJoin(researchSessions, eq(researchSessions.id, transcripts.sessionId))
      .where(and(eq(codeApplications.projectId, projectId), eq(codeApplications.workspaceId, workspaceId))),
    listCodes(workspaceId, projectId),
  ]);
  const persons: Person[] = people.map((p) => ({ id: p.id, code: p.code, attributes: Object.fromEntries(Object.entries((p.attributes ?? {}) as Record<string, unknown>).map(([k, v]) => [k, String(v ?? "").trim()])) }));
  const participantTurns = rows.filter((r) => !(r.speaker && r.speakers[r.speaker]?.role === "interviewer"));
  // Approved codings only (pending AI suggestions don't count).
  const codings: Coding[] = participantTurns
    .filter((r) => r.approved)
    .map((r) => ({ codeId: r.codeId, unitId: r.unitId!, coderId: r.coderId, participantId: (r.speaker && r.speakers[r.speaker]?.participantId) || null }));
  // For agreement: people's own codings (not AI), and which transcripts each coder worked in.
  const human = rows.filter((r) => r.source === "human" && r.coderId).map((r) => ({ codeId: r.codeId, unitId: r.unitId!, coderId: r.coderId, participantId: null, transcriptId: r.transcriptId }));
  const coderIds = [...new Set(human.map((h) => h.coderId!))];
  const coders = coderIds.length ? await db.select({ id: users.id, name: users.name, handle: userHandle }).from(users).where(inArray(users.id, coderIds)) : [];
  const codeInfo: CodeInfo[] = codes.map((c) => ({ id: c.id, name: c.name, color: c.color, parentId: c.parentId }));
  return {
    people: persons.filter((p) => codings.some((c) => c.participantId === p.id) || Object.keys(p.attributes).length),
    codings,
    human,
    coders: coders.map((c) => ({ id: c.id, name: c.name || c.handle || "—" })),
    codes: codeInfo,
  };
}

/** Every turn in the transcripts both coders worked in: the units agreement is measured over. */
export async function sharedUnits(human: { coderId: string | null; transcriptId: string }[], coderA: string, coderB: string) {
  const ta = new Set(human.filter((h) => h.coderId === coderA).map((h) => h.transcriptId));
  const shared = [...new Set(human.filter((h) => h.coderId === coderB && ta.has(h.transcriptId)).map((h) => h.transcriptId))];
  if (!shared.length) return [];
  const rows = await db
    .select({ id: segments.id, speaker: segments.speaker, speakers: transcripts.speakers })
    .from(segments)
    .innerJoin(transcripts, eq(transcripts.id, segments.transcriptId))
    .where(and(inArray(segments.transcriptId, shared), isNotNull(segments.text)));
  // Interviewer turns aren't coded, so counting them would inflate agreement.
  return rows.filter((r) => !(r.speaker && r.speakers[r.speaker]?.role === "interviewer")).map((r) => r.id);
}
