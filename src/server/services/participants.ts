import { and, asc, count, desc, eq, inArray, max, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { interviewGuides, participants, researchSessions, sessionParticipants, studies, transcripts, type Participant } from "@/server/db/schema";
import { newToken } from "@/lib/ids";
import { emailSchema } from "@/lib/validation";
import { advanceStatus, CONSENT_METHODS, nextParticipantCode, parseParticipantCsv, PARTICIPANT_STATUSES, type ParticipantStatus } from "@/lib/interviews/participants";
import type { Speakers } from "@/lib/interviews/sessions";
import { recordAudit } from "./audit";
import { requireWorkspace } from "./access";
import { AppError } from "./errors";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null)
    .nullish();

export const participantInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z
    .union([z.literal(""), emailSchema])
    .transform((v) => v || null)
    .nullish(),
  phone: optionalText(40),
  externalId: optionalText(100),
  notes: optionalText(5000),
  attributes: z.record(z.string().trim().min(1).max(60), z.string().trim().max(500)).default({}),
  status: z.enum(PARTICIPANT_STATUSES).optional(),
});
export type ParticipantInput = z.input<typeof participantInputSchema>;

/** The study, checked to belong to the workspace. */
export async function requireStudyIn(workspaceId: string, studyId: string) {
  const [study] = await db.select().from(studies).where(and(eq(studies.id, studyId), eq(studies.workspaceId, workspaceId))).limit(1);
  if (!study) throw new AppError("notFound");
  return study;
}

export async function listParticipants(workspaceId: string, studyId: string) {
  const rows = await db
    .select()
    .from(participants)
    .where(and(eq(participants.workspaceId, workspaceId), eq(participants.studyId, studyId)))
    .orderBy(asc(participants.code));
  const stats = rows.length
    ? await db
        .select({ participantId: sessionParticipants.participantId, sessions: count(), last: max(researchSessions.scheduledAt) })
        .from(sessionParticipants)
        .innerJoin(researchSessions, eq(researchSessions.id, sessionParticipants.sessionId))
        .where(inArray(sessionParticipants.participantId, rows.map((r) => r.id)))
        .groupBy(sessionParticipants.participantId)
    : [];
  const byId = new Map(stats.map((s) => [s.participantId, s]));
  return rows.map((p) => ({ ...p, sessionCount: byId.get(p.id)?.sessions ?? 0, lastSessionAt: byId.get(p.id)?.last ?? null }));
}

export async function participantCounts(workspaceId: string, studyId: string) {
  const rows = await db
    .select({ status: participants.status, n: count() })
    .from(participants)
    .where(and(eq(participants.workspaceId, workspaceId), eq(participants.studyId, studyId)))
    .groupBy(participants.status);
  const out = Object.fromEntries(PARTICIPANT_STATUSES.map((s) => [s, 0])) as Record<ParticipantStatus, number>;
  for (const r of rows) out[r.status] = r.n;
  return { ...out, total: rows.reduce((a, r) => a + r.n, 0) };
}

export async function getParticipant(workspaceId: string, studyId: string, participantId: string) {
  const [row] = await db
    .select()
    .from(participants)
    .where(and(eq(participants.id, participantId), eq(participants.studyId, studyId), eq(participants.workspaceId, workspaceId)))
    .limit(1);
  if (!row) throw new AppError("notFound");
  return row;
}

export async function participantSessions(participantId: string) {
  return db
    .select({
      id: researchSessions.id,
      title: researchSessions.title,
      kind: researchSessions.kind,
      status: researchSessions.status,
      scheduledAt: researchSessions.scheduledAt,
      transcriptStatus: transcripts.status,
    })
    .from(sessionParticipants)
    .innerJoin(researchSessions, eq(researchSessions.id, sessionParticipants.sessionId))
    .leftJoin(transcripts, eq(transcripts.sessionId, researchSessions.id))
    .where(eq(sessionParticipants.participantId, participantId))
    .orderBy(desc(researchSessions.scheduledAt));
}

export async function codesIn(executor: Pick<typeof db, "select">, studyId: string) {
  const rows = await executor.select({ code: participants.code }).from(participants).where(eq(participants.studyId, studyId));
  return rows.map((r) => r.code);
}

export async function createParticipant(userId: string, workspaceId: string, studyId: string, raw: ParticipantInput) {
  const input = participantInputSchema.parse(raw);
  await requireWorkspace(userId, workspaceId, "content:edit");
  await requireStudyIn(workspaceId, studyId);
  return db.transaction(async (tx) => {
    // Serialize code allocation per study so two quick adds never collide.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${studyId}))`);
    const code = nextParticipantCode(await codesIn(tx, studyId));
    const [row] = await tx
      .insert(participants)
      .values({ ...input, status: input.status ?? "recruited", workspaceId, studyId, code, consentToken: newToken(), createdById: userId })
      .returning();
    await recordAudit(tx, { workspaceId, actorId: userId, action: "participant.created", entityType: "participant", entityId: row!.id, metadata: { code } });
    return row!;
  });
}

/** Add many people from a pasted spreadsheet. People whose email is already in the study are skipped. */
export async function importParticipants(userId: string, workspaceId: string, studyId: string, csv: string) {
  await requireWorkspace(userId, workspaceId, "content:edit");
  await requireStudyIn(workspaceId, studyId);
  const { rows, skipped } = parseParticipantCsv(String(csv).slice(0, 2_000_000));
  if (!rows.length) throw new AppError("invalid");
  if (rows.length > 1000) throw new AppError("invalid", "Import at most 1000 people at a time.");
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${studyId}))`);
    const codes = await codesIn(tx, studyId);
    const existing = await tx.select({ email: participants.email }).from(participants).where(eq(participants.studyId, studyId));
    const seen = new Set(existing.map((e) => e.email).filter(Boolean));
    let duplicates = 0;
    const values = [];
    for (const r of rows) {
      if (r.email && seen.has(r.email)) {
        duplicates++;
        continue;
      }
      if (r.email) seen.add(r.email);
      const code = nextParticipantCode(codes);
      codes.push(code);
      values.push({ ...r, workspaceId, studyId, code, consentToken: newToken(), createdById: userId });
    }
    if (values.length) await tx.insert(participants).values(values);
    await recordAudit(tx, { workspaceId, actorId: userId, action: "participant.imported", entityType: "study", entityId: studyId, metadata: { count: values.length } });
    return { created: values.length, skipped, duplicates };
  });
}

export async function updateParticipant(userId: string, workspaceId: string, studyId: string, participantId: string, raw: ParticipantInput) {
  const input = participantInputSchema.parse(raw);
  await requireWorkspace(userId, workspaceId, "content:edit");
  const current = await getParticipant(workspaceId, studyId, participantId);
  if (current.anonymizedAt) throw new AppError("conflict");
  const [row] = await db.update(participants).set(input).where(eq(participants.id, participantId)).returning();
  await recordAudit(db, { workspaceId, actorId: userId, action: "participant.updated", entityType: "participant", entityId: participantId, metadata: { code: current.code } });
  return row!;
}

export async function setParticipantStatus(userId: string, workspaceId: string, studyId: string, participantId: string, status: ParticipantStatus) {
  const parsed = z.enum(PARTICIPANT_STATUSES).parse(status);
  await requireWorkspace(userId, workspaceId, "content:edit");
  const current = await getParticipant(workspaceId, studyId, participantId);
  await db.update(participants).set({ status: parsed }).where(eq(participants.id, participantId));
  await recordAudit(db, { workspaceId, actorId: userId, action: "participant.status", entityType: "participant", entityId: participantId, metadata: { code: current.code, from: current.status, to: parsed } });
}

/** Consent taken by the researcher (on paper or out loud), recorded against the current form. */
export async function recordConsent(userId: string, workspaceId: string, studyId: string, participantId: string, raw: { method: string; name?: string | null }) {
  const input = z.object({ method: z.enum(CONSENT_METHODS).exclude(["online"]), name: optionalText(200) }).parse(raw);
  await requireWorkspace(userId, workspaceId, "content:edit");
  const current = await getParticipant(workspaceId, studyId, participantId);
  const { consentVersion } = await currentConsentVersion(studyId);
  await db
    .update(participants)
    .set({ consentAt: new Date(), consentMethod: input.method, consentName: input.name ?? current.name, consentVersion })
    .where(eq(participants.id, participantId));
  await recordAudit(db, { workspaceId, actorId: userId, action: "participant.consent_recorded", entityType: "participant", entityId: participantId, metadata: { code: current.code, method: input.method, version: consentVersion } });
}

export async function revokeConsent(userId: string, workspaceId: string, studyId: string, participantId: string) {
  await requireWorkspace(userId, workspaceId, "content:edit");
  const current = await getParticipant(workspaceId, studyId, participantId);
  await db.update(participants).set({ consentAt: null, consentMethod: null, consentName: null, consentVersion: null }).where(eq(participants.id, participantId));
  await recordAudit(db, { workspaceId, actorId: userId, action: "participant.consent_revoked", entityType: "participant", entityId: participantId, metadata: { code: current.code } });
}

async function currentConsentVersion(studyId: string): Promise<{ consentVersion: number | null }> {
  const [row] = await db.select({ consent: interviewGuides.consent }).from(interviewGuides).where(eq(interviewGuides.studyId, studyId)).limit(1);
  return { consentVersion: row?.consent?.version ?? null };
}

/**
 * Remove everything that identifies a person but keep their pseudonym, attributes and data, so
 * analysis still works. Transcript speaker names linked to them become the code.
 */
export async function anonymizeParticipant(userId: string, workspaceId: string, studyId: string, participantId: string) {
  await requireWorkspace(userId, workspaceId, "content:edit");
  const current = await getParticipant(workspaceId, studyId, participantId);
  await db.transaction(async (tx) => {
    await tx
      .update(participants)
      .set({ name: null, email: null, phone: null, externalId: null, notes: null, consentName: null, anonymizedAt: new Date() })
      .where(eq(participants.id, participantId));
    const linked = await tx
      .select({ id: transcripts.id, speakers: transcripts.speakers })
      .from(transcripts)
      .innerJoin(researchSessions, eq(researchSessions.id, transcripts.sessionId))
      .where(eq(researchSessions.studyId, studyId));
    for (const t of linked) {
      let changed = false;
      const speakers: Speakers = { ...t.speakers };
      for (const [key, s] of Object.entries(speakers)) {
        if (s.participantId === participantId && s.name !== current.code) {
          speakers[key] = { ...s, name: current.code };
          changed = true;
        }
      }
      if (changed) await tx.update(transcripts).set({ speakers }).where(eq(transcripts.id, t.id));
    }
    await recordAudit(tx, { workspaceId, actorId: userId, action: "participant.anonymized", entityType: "participant", entityId: participantId, metadata: { code: current.code } });
  });
}

export async function deleteParticipant(userId: string, workspaceId: string, studyId: string, participantId: string) {
  await requireWorkspace(userId, workspaceId, "content:edit");
  const current = await getParticipant(workspaceId, studyId, participantId);
  await db.delete(participants).where(eq(participants.id, participantId));
  await recordAudit(db, { workspaceId, actorId: userId, action: "participant.deleted", entityType: "participant", entityId: participantId, metadata: { code: current.code } });
}

/** Move people forward when sessions are scheduled or completed (never backwards). */
export async function advanceParticipants(executor: Pick<typeof db, "select" | "update">, ids: string[], to: "scheduled" | "completed") {
  if (!ids.length) return;
  const rows = await executor.select({ id: participants.id, status: participants.status }).from(participants).where(inArray(participants.id, ids));
  for (const r of rows) {
    const next = advanceStatus(r.status, to);
    if (next !== r.status) await executor.update(participants).set({ status: next }).where(eq(participants.id, r.id));
  }
}

/** Contact details are only shown to people who can edit the study. */
export function redactContact<T extends Pick<Participant, "email" | "phone">>(p: T, canSeeContact: boolean): T {
  return canSeeContact ? p : { ...p, email: p.email ? "•••" : null, phone: p.phone ? "•••" : null };
}
