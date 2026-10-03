import { mockProvider } from "@/server/transcription/mock";
import { membersWithRoles, notify, studyLink } from "./notifications";
import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { files, participants, researchSessions, segments, sessionNotes, sessionParticipants, transcripts, users, type ResearchSession } from "@/server/db/schema";
import { storage, storageFor } from "@/server/storage";
import { newId } from "@/lib/ids";
import { isConversation, maxParticipants, SESSION_KINDS, SESSION_STATUSES, SPEAKER_ROLES, type SessionKind, type SessionStatus, type Speakers } from "@/lib/interviews/sessions";
import { parseTranscript, type SegmentInput } from "@/lib/interviews/transcript";
import { transcriptionProvider, type TranscriptionProvider } from "@/server/transcription";
import { recordAudit } from "./audit";
import { requireWorkspace } from "./access";
import { AppError } from "./errors";
import { getGuide } from "./guides";
import { advanceParticipants, requireStudyIn } from "./participants";
import { relocateSegmentCodings } from "./coding";

const MAX_SEGMENTS = 5000;
const MAX_TEXT = 200_000;

export function mediaMaxBytes(): number {
  const mb = Number(process.env.MEDIA_MAX_MB) || 500;
  return mb * 1024 * 1024;
}

const optionalText = (maxLen: number) =>
  z
    .string()
    .trim()
    .max(maxLen)
    .transform((v) => v || null)
    .nullish();

export const sessionInputSchema = z.object({
  kind: z.enum(SESSION_KINDS),
  title: z.string().trim().max(200).optional(),
  scheduledAt: z.coerce.date().nullish(),
  durationMin: z.coerce.number().int().min(1).max(24 * 60).nullish(),
  location: optionalText(500),
  interviewerId: optionalText(64),
  participantIds: z.array(z.string().min(1).max(64)).max(12).default([]),
  /** Field notes and diary entries can be written straight away. */
  body: z.string().max(MAX_TEXT).optional(),
});
export type SessionInput = z.input<typeof sessionInputSchema>;

// ── Reads ──────────────────────────────────────────────────────────────────

export async function getSessionRow(workspaceId: string, studyId: string, sessionId: string): Promise<ResearchSession> {
  const [row] = await db
    .select()
    .from(researchSessions)
    .where(and(eq(researchSessions.id, sessionId), eq(researchSessions.studyId, studyId), eq(researchSessions.workspaceId, workspaceId)))
    .limit(1);
  if (!row) throw new AppError("notFound");
  return row;
}

export async function listSessions(workspaceId: string, studyId: string) {
  const rows = await db
    .select({
      session: researchSessions,
      transcriptStatus: transcripts.status,
      interviewerName: users.name,
      mediaMime: files.mime,
    })
    .from(researchSessions)
    .leftJoin(transcripts, eq(transcripts.sessionId, researchSessions.id))
    .leftJoin(users, eq(users.id, researchSessions.interviewerId))
    .leftJoin(files, eq(files.id, researchSessions.mediaFileId))
    .where(and(eq(researchSessions.workspaceId, workspaceId), eq(researchSessions.studyId, studyId)))
    .orderBy(desc(researchSessions.scheduledAt), desc(researchSessions.createdAt));
  const ids = rows.map((r) => r.session.id);
  const [people, notes] = ids.length
    ? await Promise.all([
        db
          .select({ sessionId: sessionParticipants.sessionId, id: participants.id, code: participants.code, name: participants.name })
          .from(sessionParticipants)
          .innerJoin(participants, eq(participants.id, sessionParticipants.participantId))
          .where(inArray(sessionParticipants.sessionId, ids))
          .orderBy(asc(participants.code)),
        db.select({ sessionId: sessionNotes.sessionId, n: count() }).from(sessionNotes).where(inArray(sessionNotes.sessionId, ids)).groupBy(sessionNotes.sessionId),
      ])
    : [[], []];
  const noteCount = new Map(notes.map((n) => [n.sessionId, n.n]));
  return rows.map((r) => ({
    ...r.session,
    transcriptStatus: r.transcriptStatus,
    interviewerName: r.interviewerName,
    mediaKind: r.mediaMime ? (r.mediaMime.startsWith("video/") ? ("video" as const) : ("audio" as const)) : null,
    participants: people.filter((p) => p.sessionId === r.session.id).map(({ id, code, name }) => ({ id, code, name })),
    noteCount: noteCount.get(r.session.id) ?? 0,
  }));
}

export type SessionListItem = Awaited<ReturnType<typeof listSessions>>[number];

export async function getSessionDetail(workspaceId: string, studyId: string, sessionId: string) {
  const session = await getSessionRow(workspaceId, studyId, sessionId);
  const [people, [transcript], notes, [media], [interviewer]] = await Promise.all([
    db
      .select({ id: participants.id, code: participants.code, name: participants.name, consentAt: participants.consentAt, anonymizedAt: participants.anonymizedAt })
      .from(sessionParticipants)
      .innerJoin(participants, eq(participants.id, sessionParticipants.participantId))
      .where(eq(sessionParticipants.sessionId, sessionId))
      .orderBy(asc(participants.code)),
    db.select().from(transcripts).where(eq(transcripts.sessionId, sessionId)).limit(1),
    db
      .select({ id: sessionNotes.id, atMs: sessionNotes.atMs, tag: sessionNotes.tag, text: sessionNotes.text, createdAt: sessionNotes.createdAt, authorId: sessionNotes.authorId, authorName: users.name, authorEmail: users.email })
      .from(sessionNotes)
      .leftJoin(users, eq(users.id, sessionNotes.authorId))
      .where(eq(sessionNotes.sessionId, sessionId))
      .orderBy(asc(sessionNotes.atMs), asc(sessionNotes.createdAt)),
    session.mediaFileId ? db.select({ id: files.id, name: files.name, mime: files.mime, size: files.size }).from(files).where(eq(files.id, session.mediaFileId)).limit(1) : Promise.resolve([]),
    session.interviewerId ? db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(eq(users.id, session.interviewerId)).limit(1) : Promise.resolve([]),
  ]);
  const segs = transcript
    ? await db
        .select({ id: segments.id, position: segments.position, speaker: segments.speaker, startMs: segments.startMs, endMs: segments.endMs, text: segments.text })
        .from(segments)
        .where(eq(segments.transcriptId, transcript.id))
        .orderBy(asc(segments.position))
    : [];
  return { session, participants: people, transcript: transcript ?? null, segments: segs, notes, media: media ?? null, interviewer: interviewer ?? null };
}

export type SessionDetail = Awaited<ReturnType<typeof getSessionDetail>>;

export async function sessionCounts(workspaceId: string, studyId: string) {
  const rows = await db
    .select({ status: researchSessions.status, n: count() })
    .from(researchSessions)
    .where(and(eq(researchSessions.workspaceId, workspaceId), eq(researchSessions.studyId, studyId)))
    .groupBy(researchSessions.status);
  const out = Object.fromEntries(SESSION_STATUSES.map((s) => [s, 0])) as Record<SessionStatus, number>;
  for (const r of rows) out[r.status] = r.n;
  return { ...out, total: rows.reduce((a, r) => a + r.n, 0) };
}

// ── Create / update ────────────────────────────────────────────────────────

async function checkParticipants(studyId: string, kind: SessionKind, ids: string[]) {
  const unique = [...new Set(ids)];
  if (unique.length > maxParticipants(kind)) throw new AppError("invalid");
  if (!unique.length) return unique;
  const found = await db.select({ id: participants.id }).from(participants).where(and(eq(participants.studyId, studyId), inArray(participants.id, unique)));
  if (found.length !== unique.length) throw new AppError("invalid");
  return unique;
}

async function participantCodes(ids: string[]) {
  if (!ids.length) return [];
  const rows = await db.select({ id: participants.id, code: participants.code }).from(participants).where(inArray(participants.id, ids)).orderBy(asc(participants.code));
  return rows;
}

const KIND_TITLE: Record<SessionKind, string> = { interview: "Interview", focus_group: "Focus group", field_notes: "Field notes", diary: "Diary entry" };

function defaultTitle(kind: SessionKind, codes: string[]) {
  if (!codes.length) return KIND_TITLE[kind];
  return `${KIND_TITLE[kind]} · ${codes.join(", ")}`;
}

export async function createSession(userId: string, workspaceId: string, studyId: string, raw: SessionInput) {
  const input = sessionInputSchema.parse(raw);
  await requireWorkspace(userId, workspaceId, "content:edit");
  await requireStudyIn(workspaceId, studyId);
  const ids = await checkParticipants(studyId, input.kind, input.participantIds);
  const people = await participantCodes(ids);
  const codes = people.map((p) => p.code);
  const written = !isConversation(input.kind);
  const hasBody = written && !!input.body?.trim();
  const status: SessionStatus = hasBody ? "completed" : "scheduled";
  const author = await userName(userId);

  const session = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(researchSessions)
      .values({
        workspaceId,
        studyId,
        kind: input.kind,
        title: input.title || defaultTitle(input.kind, codes),
        status,
        scheduledAt: input.scheduledAt ?? (hasBody ? new Date() : null),
        durationMin: input.durationMin ?? (isConversation(input.kind) ? 60 : null),
        location: input.location,
        interviewerId: input.interviewerId ?? userId,
        endedAt: hasBody ? new Date() : null,
        createdById: userId,
      })
      .returning();
    if (ids.length) await tx.insert(sessionParticipants).values(ids.map((participantId) => ({ sessionId: row!.id, participantId })));
    if (ids.length && (input.scheduledAt || hasBody)) await advanceParticipants(tx, ids, hasBody ? "completed" : "scheduled");
    if (hasBody) await writeTranscript(tx, { workspaceId, sessionId: row!.id, provider: "manual", language: null, ...textEntry(input.kind, input.body!, author, people) });
    await recordAudit(tx, { workspaceId, actorId: userId, action: "session.created", entityType: "session", entityId: row!.id, metadata: { kind: input.kind, participants: codes } });
    return row!;
  });
  return session;
}

export async function updateSession(userId: string, workspaceId: string, studyId: string, sessionId: string, raw: SessionInput) {
  const input = sessionInputSchema.parse(raw);
  await requireWorkspace(userId, workspaceId, "content:edit");
  const current = await getSessionRow(workspaceId, studyId, sessionId);
  const ids = await checkParticipants(studyId, input.kind, input.participantIds);
  const codes = (await participantCodes(ids)).map((p) => p.code);
  await db.transaction(async (tx) => {
    await tx
      .update(researchSessions)
      .set({
        kind: input.kind,
        title: input.title || defaultTitle(input.kind, codes),
        scheduledAt: input.scheduledAt ?? null,
        durationMin: input.durationMin ?? null,
        location: input.location,
        interviewerId: input.interviewerId ?? current.interviewerId,
      })
      .where(eq(researchSessions.id, sessionId));
    await tx.delete(sessionParticipants).where(eq(sessionParticipants.sessionId, sessionId));
    if (ids.length) await tx.insert(sessionParticipants).values(ids.map((participantId) => ({ sessionId, participantId })));
    if (ids.length && input.scheduledAt && current.status === "scheduled") await advanceParticipants(tx, ids, "scheduled");
    await recordAudit(tx, { workspaceId, actorId: userId, action: "session.updated", entityType: "session", entityId: sessionId, metadata: { kind: input.kind } });
  });
}

export async function setSessionStatus(userId: string, workspaceId: string, studyId: string, sessionId: string, raw: SessionStatus) {
  const status = z.enum(SESSION_STATUSES).parse(raw);
  await requireWorkspace(userId, workspaceId, "content:edit");
  const current = await getSessionRow(workspaceId, studyId, sessionId);
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(researchSessions)
      .set({
        status,
        startedAt: status === "in_progress" ? (current.startedAt ?? now) : current.startedAt,
        endedAt: status === "completed" ? (current.endedAt ?? now) : current.endedAt,
      })
      .where(eq(researchSessions.id, sessionId));
    if (status === "completed") {
      const ids = await tx.select({ id: sessionParticipants.participantId }).from(sessionParticipants).where(eq(sessionParticipants.sessionId, sessionId));
      await advanceParticipants(tx, ids.map((r) => r.id), "completed");
    }
    await recordAudit(tx, { workspaceId, actorId: userId, action: "session.status", entityType: "session", entityId: sessionId, metadata: { from: current.status, to: status } });
  });
}

export async function deleteSession(userId: string, workspaceId: string, studyId: string, sessionId: string) {
  await requireWorkspace(userId, workspaceId, "content:edit");
  const current = await getSessionRow(workspaceId, studyId, sessionId);
  await db.transaction(async (tx) => {
    await tx.delete(researchSessions).where(eq(researchSessions.id, sessionId));
    if (current.mediaFileId) await removeFile(tx, current.mediaFileId);
    await recordAudit(tx, { workspaceId, actorId: userId, action: "session.deleted", entityType: "session", entityId: sessionId, metadata: { title: current.title } });
  });
}

async function removeFile(executor: Pick<typeof db, "select" | "delete">, fileId: string) {
  const [file] = await executor.select().from(files).where(eq(files.id, fileId)).limit(1);
  if (!file) return;
  await executor.delete(files).where(eq(files.id, fileId));
  await storageFor(file.storage)
    .delete(file.key)
    .catch((e: unknown) => console.error("Could not delete stored file", file.key, e));
}

async function userName(userId: string) {
  const [u] = await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  return u?.name || u?.email?.split("@")[0] || "Researcher";
}

// ── Transcripts ────────────────────────────────────────────────────────────

type TranscriptWrite = { workspaceId: string; sessionId: string; provider: string; language: string | null; segments: SegmentInput[]; speakers: Speakers; status?: "processing" | "ready" | "failed"; error?: string | null };

/** Replace a session's transcript (one per session) and its segments. */
async function writeTranscript(executor: Pick<typeof db, "select" | "insert" | "update" | "delete">, t: TranscriptWrite) {
  const values = { provider: t.provider, language: t.language, speakers: t.speakers, status: t.status ?? ("ready" as const), error: t.error ?? null };
  const [existing] = await executor.select({ id: transcripts.id }).from(transcripts).where(eq(transcripts.sessionId, t.sessionId)).limit(1);
  let id: string;
  if (existing) {
    id = existing.id;
    await executor.update(transcripts).set(values).where(eq(transcripts.id, id));
    await executor.delete(segments).where(eq(segments.transcriptId, id));
  } else {
    id = newId("trn");
    await executor.insert(transcripts).values({ id, workspaceId: t.workspaceId, sessionId: t.sessionId, ...values });
  }
  const rows = t.segments.slice(0, MAX_SEGMENTS).map((s, position) => ({
    transcriptId: id,
    position,
    speaker: s.speaker,
    startMs: s.startMs,
    endMs: s.endMs,
    text: s.text.slice(0, 4000),
  }));
  for (let i = 0; i < rows.length; i += 500) await executor.insert(segments).values(rows.slice(i, i + 500));
  return id;
}

/** Paragraphs of a written entry become segments, attributed to the author or the diarist. */
function textEntry(kind: SessionKind, body: string, authorName: string, people: { id: string; code: string }[]): { segments: SegmentInput[]; speakers: Speakers } {
  const diarist = kind === "diary" ? people[0] : undefined;
  const speakers: Speakers = diarist ? { S1: { name: diarist.code, role: "participant", participantId: diarist.id } } : { S1: { name: authorName, role: "interviewer" } };
  const paragraphs = body
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  return { speakers, segments: paragraphs.map((text) => ({ speaker: "S1", startMs: null, endMs: null, text })) };
}

/**
 * Normalize speaker labels to S1…Sn (in order of first appearance) and work out who is who:
 * names matching a participant (name or code) link to them; a name matching the interviewer is the
 * interviewer; otherwise the first voice is assumed to be the interviewer and the next ones the
 * session's participants, in order. Participants are always shown by their code.
 */
export function assignSpeakers(
  segs: SegmentInput[],
  ctx: { interviewerName: string; participants: { id: string; code: string; name: string | null }[] },
): { segments: SegmentInput[]; speakers: Speakers } {
  const order: string[] = [];
  for (const s of segs) if (s.speaker && !order.includes(s.speaker)) order.push(s.speaker);
  const key = new Map(order.map((label, i) => [label, `S${i + 1}`]));
  const norm = (v: string) => v.trim().toLowerCase();
  const speakers: Speakers = {};
  const used = new Set<string>();
  let interviewer = false;
  for (const label of order) {
    const p = ctx.participants.find((x) => !used.has(x.id) && (norm(x.code) === norm(label) || (x.name && norm(x.name) === norm(label))));
    if (p) {
      used.add(p.id);
      speakers[key.get(label)!] = { name: p.code, role: "participant", participantId: p.id };
    } else if (!interviewer && norm(label) === norm(ctx.interviewerName)) {
      interviewer = true;
      speakers[key.get(label)!] = { name: label, role: "interviewer" };
    }
  }
  const unassigned = order.filter((l) => !speakers[key.get(l)!]);
  if (!interviewer && order.length > 1 && unassigned.length) {
    const first = unassigned.shift()!;
    const generic = /^(s\d+|speaker\s*\d+|[a-z])$/i.test(first);
    speakers[key.get(first)!] = { name: generic ? ctx.interviewerName : first, role: "interviewer" };
  }
  for (const label of unassigned) {
    const p = ctx.participants.find((x) => !used.has(x.id));
    if (p && order.length > 1) {
      used.add(p.id);
      speakers[key.get(label)!] = { name: p.code, role: "participant", participantId: p.id };
    } else {
      speakers[key.get(label)!] = { name: /^s\d+$/i.test(label) ? `Speaker ${key.get(label)!.slice(1)}` : label, role: "other" };
    }
  }
  return { segments: segs.map((s) => ({ ...s, speaker: s.speaker ? key.get(s.speaker)! : null })), speakers };
}

async function speakerContext(session: ResearchSession) {
  const people = await db
    .select({ id: participants.id, code: participants.code, name: participants.name })
    .from(sessionParticipants)
    .innerJoin(participants, eq(participants.id, sessionParticipants.participantId))
    .where(eq(sessionParticipants.sessionId, session.id))
    .orderBy(asc(participants.code));
  const interviewerName = session.interviewerId ? await userName(session.interviewerId) : "Interviewer";
  return { interviewerName, participants: people };
}

const ALLOWED_MEDIA = /^(audio|video)\/[\w.+-]+$/;

/**
 * Store a recording for a session (replacing any earlier one) and queue transcription.
 * Returns the transcript id; call `runTranscription` with it after responding.
 */
export async function attachMedia(
  userId: string,
  workspaceId: string,
  studyId: string,
  sessionId: string,
  media: { data: Uint8Array; mime: string; name: string; durationMs: number | null },
) {
  await requireWorkspace(userId, workspaceId, "content:edit");
  const session = await getSessionRow(workspaceId, studyId, sessionId);
  const mime = media.mime.split(";")[0]!.trim().toLowerCase();
  if (!ALLOWED_MEDIA.test(mime)) throw new AppError("invalid", "fileType");
  if (!media.data.byteLength || media.data.byteLength > mediaMaxBytes()) throw new AppError("invalid", "fileSize");
  const store = storage();
  const fileId = newId("fil");
  const ext = (media.name.match(/\.([a-z0-9]{1,5})$/i)?.[1] ?? mime.split("/")[1]!.replace(/[^a-z0-9]/g, "")).toLowerCase();
  const key = `${workspaceId}/sessions/${sessionId}/${fileId}.${ext}`;
  await store.put(key, media.data, mime);
  const durationMs = media.durationMs && Number.isFinite(media.durationMs) && media.durationMs > 0 ? Math.round(media.durationMs) : null;
  return db.transaction(async (tx) => {
    await tx.insert(files).values({ id: fileId, workspaceId, storage: store.name, key, name: media.name.slice(0, 200) || `recording.${ext}`, mime, size: media.data.byteLength, uploadedById: userId });
    await tx.update(researchSessions).set({ mediaFileId: fileId, mediaDurationMs: durationMs }).where(eq(researchSessions.id, sessionId));
    if (session.mediaFileId) await removeFile(tx, session.mediaFileId);
    const transcriptId = await writeTranscript(tx, { workspaceId, sessionId, provider: transcriptionProvider().name, language: null, segments: [], speakers: {}, status: "processing" });
    await recordAudit(tx, { workspaceId, actorId: userId, action: "session.media_uploaded", entityType: "session", entityId: sessionId, metadata: { mime, size: media.data.byteLength } });
    return { fileId, transcriptId };
  });
}

/** Re-run transcription on the current recording (e.g. after a failure). */
export async function retranscribe(userId: string, workspaceId: string, studyId: string, sessionId: string) {
  await requireWorkspace(userId, workspaceId, "content:edit");
  const session = await getSessionRow(workspaceId, studyId, sessionId);
  if (!session.mediaFileId) throw new AppError("invalid");
  return writeTranscript(db, { workspaceId, sessionId, provider: transcriptionProvider().name, language: null, segments: [], speakers: {}, status: "processing" });
}

/** Transcribe a session's recording. Runs after the upload response; never throws. */
export async function runTranscription(transcriptId: string, provider: TranscriptionProvider = transcriptionProvider()) {
  try {
    const [t] = await db.select().from(transcripts).where(eq(transcripts.id, transcriptId)).limit(1);
    if (!t || t.status !== "processing") return;
    const [session] = await db.select().from(researchSessions).where(eq(researchSessions.id, t.sessionId)).limit(1);
    if (!session?.mediaFileId) throw new Error("No recording");
    const [file] = await db.select().from(files).where(eq(files.id, session.mediaFileId)).limit(1);
    if (!file) throw new Error("Recording not found");
    const object = await storageFor(file.storage).get(file.key);
    if (!object) throw new Error("Recording not found in storage");
    const data = object.body instanceof Uint8Array ? object.body : new Uint8Array(await new Response(object.body).arrayBuffer());
    const ctx = await speakerContext(session);
    const { doc: guide } = await getGuide(session.workspaceId, session.studyId);
    const result = await provider.transcribe({
      media: data,
      mime: file.mime,
      filename: file.name,
      durationMs: session.mediaDurationMs,
      guide: guide.sections.length ? guide : null,
      participantCount: Math.max(1, ctx.participants.length),
      seed: session.id,
    });
    const assigned = assignSpeakers(result.segments, ctx);
    await db.transaction((tx) => writeTranscript(tx, { workspaceId: session.workspaceId, sessionId: session.id, provider: provider.name, language: result.language, ...assigned }));
    await notifyTranscript(session, "transcript");
  } catch (error) {
    console.error("Transcription failed", transcriptId, error);
    const [t] = await db.select({ sessionId: transcripts.sessionId }).from(transcripts).where(eq(transcripts.id, transcriptId)).limit(1).catch(() => []);
    const [session] = t ? await db.select().from(researchSessions).where(eq(researchSessions.id, t.sessionId)).limit(1).catch(() => []) : [];
    if (session) await notifyTranscript(session, "transcriptFailed");
    await db
      .update(transcripts)
      .set({ status: "failed", error: error instanceof Error ? error.message.slice(0, 500) : "Transcription failed" })
      .where(eq(transcripts.id, transcriptId))
      .catch(() => undefined);
  }
}

async function notifyTranscript(session: ResearchSession, kind: "transcript" | "transcriptFailed") {
  const link = await studyLink(session.studyId);
  if (!link) return;
  const people = [...new Set([...(session.interviewerId ? [session.interviewerId] : []), ...(await membersWithRoles(session.workspaceId, ["owner", "editor"]))])];
  await notify(people, { workspaceId: session.workspaceId, kind, data: { session: session.title, study: link.studyName }, href: `${link.base}/sessions/${session.id}` });
}

/** Import a transcript file (WebVTT, SRT or text) from Zoom, Teams, Otter… */
export async function importTranscript(userId: string, workspaceId: string, studyId: string, sessionId: string, raw: string) {
  await requireWorkspace(userId, workspaceId, "content:edit");
  const session = await getSessionRow(workspaceId, studyId, sessionId);
  const text = String(raw).slice(0, 5_000_000);
  const parsed = parseTranscript(text);
  if (!parsed.segments.length) throw new AppError("invalid");
  const assigned = assignSpeakers(parsed.segments, await speakerContext(session));
  await db.transaction(async (tx) => {
    await writeTranscript(tx, { workspaceId, sessionId, provider: "import", language: null, ...assigned });
    await recordAudit(tx, { workspaceId, actorId: userId, action: "session.transcript_imported", entityType: "session", entityId: sessionId, metadata: { format: parsed.format, segments: parsed.segments.length } });
  });
  return { format: parsed.format, segments: parsed.segments.length };
}

/** A made-up transcript for trying coding and analysis before real interviews exist (built from the guide). */
export async function generateSampleTranscript(userId: string, workspaceId: string, studyId: string, sessionId: string) {
  await requireWorkspace(userId, workspaceId, "content:edit");
  const session = await getSessionRow(workspaceId, studyId, sessionId);
  const ctx = await speakerContext(session);
  const { doc: guide } = await getGuide(workspaceId, studyId);
  const result = await mockProvider().transcribe({
    media: new Uint8Array(),
    mime: "audio/webm",
    filename: "sample",
    durationMs: (session.durationMin ?? 30) * 60_000,
    guide: guide.sections.length ? guide : null,
    participantCount: Math.max(1, ctx.participants.length),
    seed: session.id,
  });
  const assigned = assignSpeakers(result.segments, ctx);
  await db.transaction(async (tx) => {
    await writeTranscript(tx, { workspaceId, sessionId, provider: "generated", language: result.language, ...assigned });
    await recordAudit(tx, { workspaceId, actorId: userId, action: "session.transcript_imported", entityType: "session", entityId: sessionId, metadata: { format: "generated", segments: result.segments.length } });
  });
  return { segments: result.segments.length };
}

/** Write or rewrite a field note / diary entry. */
export async function saveTextEntry(userId: string, workspaceId: string, studyId: string, sessionId: string, body: string) {
  await requireWorkspace(userId, workspaceId, "content:edit");
  const session = await getSessionRow(workspaceId, studyId, sessionId);
  const text = z.string().max(MAX_TEXT).parse(body);
  const ctx = await speakerContext(session);
  const entry = textEntry(session.kind, text, await userName(userId), ctx.participants);
  await db.transaction(async (tx) => {
    await rewriteEntry(tx, workspaceId, sessionId, entry);
    if (text.trim() && session.status !== "completed") {
      await tx.update(researchSessions).set({ status: "completed", endedAt: new Date(), scheduledAt: session.scheduledAt ?? new Date() }).where(eq(researchSessions.id, sessionId));
      await advanceParticipants(tx, ctx.participants.map((p) => p.id), "completed");
    }
  });
}

/**
 * Re-save a written entry without losing work: paragraphs whose text didn't change keep their
 * segment (and its codings); changed or removed paragraphs are replaced.
 */
async function rewriteEntry(tx: Pick<typeof db, "select" | "insert" | "update" | "delete">, workspaceId: string, sessionId: string, entry: { segments: SegmentInput[]; speakers: Speakers }) {
  const [existing] = await tx.select({ id: transcripts.id }).from(transcripts).where(eq(transcripts.sessionId, sessionId)).limit(1);
  if (!existing) {
    await writeTranscript(tx, { workspaceId, sessionId, provider: "manual", language: null, ...entry });
    return;
  }
  await tx.update(transcripts).set({ provider: "manual", status: "ready", error: null, speakers: entry.speakers }).where(eq(transcripts.id, existing.id));
  const old = await tx.select({ id: segments.id, text: segments.text }).from(segments).where(eq(segments.transcriptId, existing.id));
  const pool = new Map<string, string[]>();
  for (const o of old) pool.set(o.text, [...(pool.get(o.text) ?? []), o.id]);
  const keep = new Set<string>();
  for (const [position, seg] of entry.segments.entries()) {
    const reuse = pool.get(seg.text)?.shift();
    if (reuse) {
      keep.add(reuse);
      await tx.update(segments).set({ position, speaker: seg.speaker }).where(eq(segments.id, reuse));
    } else {
      const id = newId("seg");
      keep.add(id);
      await tx.insert(segments).values({ id, transcriptId: existing.id, position, speaker: seg.speaker, startMs: null, endMs: null, text: seg.text.slice(0, 4000) });
    }
  }
  const drop = old.map((o) => o.id).filter((id) => !keep.has(id));
  if (drop.length) await tx.delete(segments).where(inArray(segments.id, drop));
}

async function transcriptFor(workspaceId: string, studyId: string, sessionId: string) {
  await getSessionRow(workspaceId, studyId, sessionId);
  const [t] = await db.select().from(transcripts).where(eq(transcripts.sessionId, sessionId)).limit(1);
  if (!t) throw new AppError("notFound");
  return t;
}

export async function updateSegment(userId: string, workspaceId: string, studyId: string, sessionId: string, segmentId: string, raw: { text: string; speaker: string | null }) {
  await requireWorkspace(userId, workspaceId, "content:edit");
  const input = z.object({ text: z.string().trim().min(1).max(4000), speaker: z.string().max(16).nullable() }).parse(raw);
  const t = await transcriptFor(workspaceId, studyId, sessionId);
  if (input.speaker && !t.speakers[input.speaker]) throw new AppError("invalid");
  await db.transaction(async (tx) => {
    const result = await tx
      .update(segments)
      .set(input)
      .where(and(eq(segments.id, segmentId), eq(segments.transcriptId, t.id)))
      .returning({ id: segments.id });
    if (!result.length) throw new AppError("notFound");
    // Coded passages follow their words.
    await relocateSegmentCodings(tx, segmentId, input.text);
  });
}

const speakersSchema = z.record(
  z.string().regex(/^S\d{1,3}$/),
  z.object({ name: z.string().trim().min(1).max(80), role: z.enum(SPEAKER_ROLES), participantId: z.string().max(64).nullish() }),
);

/** Rename speakers, set their role, or link them to participants. */
export async function updateSpeakers(userId: string, workspaceId: string, studyId: string, sessionId: string, raw: unknown) {
  await requireWorkspace(userId, workspaceId, "content:edit");
  const input = speakersSchema.parse(raw);
  const t = await transcriptFor(workspaceId, studyId, sessionId);
  const linked = Object.values(input)
    .map((s) => s.participantId)
    .filter((id): id is string => !!id);
  const people = linked.length ? await db.select({ id: participants.id, code: participants.code }).from(participants).where(and(eq(participants.studyId, studyId), inArray(participants.id, linked))) : [];
  if (people.length !== new Set(linked).size) throw new AppError("invalid");
  const speakers: Speakers = {};
  for (const [k, s] of Object.entries(input)) {
    if (!t.speakers[k]) continue;
    const p = people.find((x) => x.id === s.participantId);
    // Linked participants are shown by their code, never by name.
    speakers[k] = p ? { name: p.code, role: "participant", participantId: p.id } : { name: s.name, role: s.role, participantId: null };
  }
  await db.update(transcripts).set({ speakers: { ...t.speakers, ...speakers } }).where(eq(transcripts.id, t.id));
}

// ── Notes ──────────────────────────────────────────────────────────────────

export const noteInputSchema = z.object({
  text: z.string().trim().max(2000),
  tag: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[\p{L}\p{N}_-]{1,40}$/u)
    .nullish(),
  atMs: z.number().int().min(0).max(24 * 3_600_000).nullish(),
});

export async function addNote(userId: string, workspaceId: string, studyId: string, sessionId: string, raw: z.input<typeof noteInputSchema>) {
  await requireWorkspace(userId, workspaceId, "content:analyze");
  const input = noteInputSchema.parse(raw);
  if (!input.text && !input.tag) throw new AppError("invalid");
  await getSessionRow(workspaceId, studyId, sessionId);
  const [row] = await db
    .insert(sessionNotes)
    .values({ workspaceId, sessionId, text: input.text, tag: input.tag ?? null, atMs: input.atMs ?? null, authorId: userId })
    .returning();
  return row!;
}

export async function deleteNote(userId: string, workspaceId: string, studyId: string, sessionId: string, noteId: string) {
  const { role } = await requireWorkspace(userId, workspaceId, "content:analyze");
  await getSessionRow(workspaceId, studyId, sessionId);
  const [note] = await db.select().from(sessionNotes).where(and(eq(sessionNotes.id, noteId), eq(sessionNotes.sessionId, sessionId))).limit(1);
  if (!note) throw new AppError("notFound");
  // Your own notes, or anyone's if you can edit the study.
  if (note.authorId !== userId && role === "analyst") throw new AppError("forbidden");
  await db.delete(sessionNotes).where(eq(sessionNotes.id, noteId));
}

export async function saveSummary(userId: string, workspaceId: string, studyId: string, sessionId: string, summary: string) {
  await requireWorkspace(userId, workspaceId, "content:analyze");
  await getSessionRow(workspaceId, studyId, sessionId);
  const text = z.string().max(20_000).parse(summary).trim();
  await db.update(researchSessions).set({ summary: text || null }).where(eq(researchSessions.id, sessionId));
}

/** Resolve a session by id for route handlers (which only get the id), checking membership. */
export async function sessionForMember(userId: string, sessionId: string, permission: Parameters<typeof requireWorkspace>[2] = "workspace:view") {
  const [row] = await db.select().from(researchSessions).where(eq(researchSessions.id, sessionId)).limit(1);
  if (!row) throw new AppError("notFound");
  try {
    await requireWorkspace(userId, row.workspaceId, permission);
  } catch (e) {
    // Non-members learn nothing; members without the permission are told so.
    if (e instanceof AppError && e.code === "forbidden") throw e;
    throw new AppError("notFound");
  }
  return row;
}
