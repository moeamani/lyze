"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireUser } from "@/server/auth";
import { sendMail } from "@/server/mail";
import { consentEmail } from "@/server/mail/templates";
import { appUrl } from "@/server/url";
import { db } from "@/server/db";
import { participants } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { recordAudit } from "@/server/services/audit";
import { requireWorkspace } from "@/server/services/access";
import { AppError } from "@/server/services/errors";
import { saveConsent, saveGuide } from "@/server/services/guides";
import {
  anonymizeParticipant,
  createParticipant,
  deleteParticipant,
  getParticipant,
  importParticipants,
  recordConsent,
  requireStudyIn,
  revokeConsent,
  setParticipantStatus,
  updateParticipant,
  type ParticipantInput,
} from "@/server/services/participants";
import {
  addNote,
  createSession,
  deleteNote,
  deleteSession,
  importTranscript,
  retranscribe,
  runTranscription,
  saveSummary,
  saveTextEntry,
  setSessionStatus,
  updateSegment,
  updateSession,
  updateSpeakers,
  type SessionInput,
} from "@/server/services/sessions";
import type { ParticipantStatus } from "@/lib/interviews/participants";
import type { SessionStatus } from "@/lib/interviews/sessions";
import { attempt } from "./result";

type Scope = { workspaceId: string; slug: string; projectId: string; studyId: string };
const studyPath = (s: Scope) => `/w/${s.slug}/p/${s.projectId}/s/${s.studyId}`;

/** Run, then refresh the study's pages on success. */
async function run<T>(scope: Scope, fn: (userId: string) => Promise<T>) {
  const user = await requireUser();
  const result = await attempt(() => fn(user.id));
  if (result.ok) revalidatePath(studyPath(scope), "layout");
  return result;
}

// ── Guide & consent ────────────────────────────────────────────────────────

/** Autosave: no revalidation, the builder holds the state. */
export async function saveGuideAction(scope: Scope, doc: unknown) {
  const user = await requireUser();
  const result = await attempt(() => saveGuide(user.id, scope.workspaceId, scope.studyId, doc));
  return result.ok ? { ok: true as const, data: undefined } : result;
}

export async function saveConsentAction(scope: Scope, consent: unknown) {
  return run(scope, async (userId) => (await saveConsent(userId, scope.workspaceId, scope.studyId, consent)).version);
}

// ── Participants ───────────────────────────────────────────────────────────

export async function createParticipantAction(scope: Scope, input: ParticipantInput) {
  return run(scope, async (userId) => (await createParticipant(userId, scope.workspaceId, scope.studyId, input)).id);
}

export async function updateParticipantAction(scope: Scope, participantId: string, input: ParticipantInput) {
  return run(scope, async (userId) => void (await updateParticipant(userId, scope.workspaceId, scope.studyId, participantId, input)));
}

export async function importParticipantsAction(scope: Scope, csv: string) {
  return run(scope, (userId) => importParticipants(userId, scope.workspaceId, scope.studyId, csv));
}

export async function setParticipantStatusAction(scope: Scope, participantId: string, status: ParticipantStatus) {
  return run(scope, (userId) => setParticipantStatus(userId, scope.workspaceId, scope.studyId, participantId, status));
}

export async function recordConsentAction(scope: Scope, participantId: string, input: { method: string; name?: string | null }) {
  return run(scope, (userId) => recordConsent(userId, scope.workspaceId, scope.studyId, participantId, input));
}

export async function revokeConsentAction(scope: Scope, participantId: string) {
  return run(scope, (userId) => revokeConsent(userId, scope.workspaceId, scope.studyId, participantId));
}

export async function anonymizeParticipantAction(scope: Scope, participantId: string) {
  return run(scope, (userId) => anonymizeParticipant(userId, scope.workspaceId, scope.studyId, participantId));
}

export async function deleteParticipantAction(scope: Scope, participantId: string) {
  return run(scope, (userId) => deleteParticipant(userId, scope.workspaceId, scope.studyId, participantId));
}

/** Email the participant their personal consent link. */
export async function sendConsentLinkAction(scope: Scope, participantId: string) {
  return run(scope, async (userId) => {
    await requireWorkspace(userId, scope.workspaceId, "content:edit");
    const study = await requireStudyIn(scope.workspaceId, scope.studyId);
    const p = await getParticipant(scope.workspaceId, scope.studyId, participantId);
    if (!p.email) throw new AppError("invalid");
    const user = await requireUser();
    const url = `${await appUrl()}/consent/${p.consentToken}`;
    await sendMail({ to: p.email, url, ...consentEmail(url, study.name, user.name || user.email || "A researcher") });
    await db.update(participants).set({ consentSentAt: new Date() }).where(eq(participants.id, p.id));
    await recordAudit(db, { workspaceId: scope.workspaceId, actorId: userId, action: "participant.consent_sent", entityType: "participant", entityId: p.id, metadata: { code: p.code } });
  });
}

// ── Sessions ───────────────────────────────────────────────────────────────

export async function createSessionAction(scope: Scope, input: SessionInput) {
  return run(scope, async (userId) => (await createSession(userId, scope.workspaceId, scope.studyId, input)).id);
}

export async function updateSessionAction(scope: Scope, sessionId: string, input: SessionInput) {
  return run(scope, (userId) => updateSession(userId, scope.workspaceId, scope.studyId, sessionId, input));
}

export async function setSessionStatusAction(scope: Scope, sessionId: string, status: SessionStatus) {
  return run(scope, (userId) => setSessionStatus(userId, scope.workspaceId, scope.studyId, sessionId, status));
}

export async function deleteSessionAction(scope: Scope, sessionId: string) {
  return run(scope, (userId) => deleteSession(userId, scope.workspaceId, scope.studyId, sessionId));
}

export async function importTranscriptAction(scope: Scope, sessionId: string, text: string) {
  return run(scope, (userId) => importTranscript(userId, scope.workspaceId, scope.studyId, sessionId, text));
}

export async function retranscribeAction(scope: Scope, sessionId: string) {
  return run(scope, async (userId) => {
    const transcriptId = await retranscribe(userId, scope.workspaceId, scope.studyId, sessionId);
    after(() => runTranscription(transcriptId));
  });
}

export async function saveTextEntryAction(scope: Scope, sessionId: string, body: string) {
  return run(scope, (userId) => saveTextEntry(userId, scope.workspaceId, scope.studyId, sessionId, body));
}

export async function updateSegmentAction(scope: Scope, sessionId: string, segmentId: string, input: { text: string; speaker: string | null }) {
  return run(scope, (userId) => updateSegment(userId, scope.workspaceId, scope.studyId, sessionId, segmentId, input));
}

export async function updateSpeakersAction(scope: Scope, sessionId: string, speakers: unknown) {
  return run(scope, (userId) => updateSpeakers(userId, scope.workspaceId, scope.studyId, sessionId, speakers));
}

export async function saveSummaryAction(scope: Scope, sessionId: string, summary: string) {
  return run(scope, (userId) => saveSummary(userId, scope.workspaceId, scope.studyId, sessionId, summary));
}

// ── Notes (live and afterwards) ────────────────────────────────────────────

export async function addNoteAction(scope: Scope, sessionId: string, input: { text: string; tag?: string | null; atMs?: number | null }) {
  const user = await requireUser();
  // No revalidation: the live view keeps notes locally so typing never waits on a page refresh.
  return attempt(async () => {
    const n = await addNote(user.id, scope.workspaceId, scope.studyId, sessionId, input);
    return { id: n.id, atMs: n.atMs, tag: n.tag, text: n.text, createdAt: n.createdAt.toISOString() };
  });
}

export async function deleteNoteAction(scope: Scope, sessionId: string, noteId: string) {
  return run(scope, (userId) => deleteNote(userId, scope.workspaceId, scope.studyId, sessionId, noteId));
}
