import { beforeAll, describe, expect, it } from "vitest";
import os from "node:os";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { runMigrations } from "@/server/db/migrations";
import { participants, studies, users } from "@/server/db/schema";
import { createWorkspace } from "@/server/services/workspaces";
import { createProject } from "@/server/services/projects";
import { createStudy } from "@/server/services/studies";
import { acceptInvite, createInvite } from "@/server/services/members";
import { AppError } from "@/server/services/errors";
import {
  anonymizeParticipant,
  createParticipant,
  getParticipant,
  importParticipants,
  listParticipants,
  recordConsent,
  setParticipantStatus,
} from "@/server/services/participants";
import { getConsentByToken, getGuide, saveConsent, saveGuide, signConsent } from "@/server/services/guides";
import {
  addNote,
  assignSpeakers,
  attachMedia,
  createSession,
  deleteNote,
  getSessionDetail,
  importTranscript,
  listSessions,
  runTranscription,
  saveTextEntry,
  setSessionStatus,
  updateSegment,
  updateSpeakers,
} from "@/server/services/sessions";
import { guideTemplate } from "@/lib/interviews/guide";
import { newId } from "@/lib/ids";
import type { TranscriptionProvider } from "@/server/transcription";
import { parseVerbose } from "@/server/transcription/openai";

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toSatisfy((e: unknown) => e instanceof AppError && e.code === code);
}

async function setup() {
  const [owner] = await db.insert(users).values({ name: "Rita Researcher", email: `rita-${newId("t")}@example.com` }).returning();
  const ws = await createWorkspace(owner!.id, { name: "Interview Lab" });
  const project = await createProject(owner!.id, ws.id, { name: "Coffee", color: "amber" });
  const study = await createStudy(owner!.id, ws.id, project.id, { name: "Rituals", type: "interview" });
  return { owner: owner!, ws, study };
}

async function member(wsId: string, ownerId: string, role: "analyst" | "viewer") {
  const [u] = await db.insert(users).values({ name: role, email: `${role}-${newId("t")}@example.com` }).returning();
  const { invite } = await createInvite(ownerId, wsId, { email: u!.email!, role });
  await acceptInvite(u!.id, u!.email!, invite.token);
  return u!;
}

beforeAll(async () => {
  process.env.UPLOADS_DIR = path.join(os.tmpdir(), `lyze-test-uploads-${process.pid}`);
  delete process.env.S3_BUCKET;
  await runMigrations();
});

describe("participants", () => {
  it("creates, numbers, imports and anonymizes participants", async () => {
    const { owner, ws, study } = await setup();
    const a = await createParticipant(owner.id, ws.id, study.id, { name: "Ada Lovelace", email: "ADA@example.com", attributes: { Segment: "Heavy" } });
    const b = await createParticipant(owner.id, ws.id, study.id, { name: "Bob" });
    expect([a.code, b.code]).toEqual(["P01", "P02"]);
    expect(a.email).toBe("ada@example.com");

    const res = await importParticipants(owner.id, ws.id, study.id, "Name,Email,Age\nAda again,ada@example.com,40\nCy,cy@example.com,31\nDee,,22\n");
    expect(res).toEqual({ created: 2, skipped: 0, duplicates: 1 });
    const list = await listParticipants(ws.id, study.id);
    expect(list.map((p) => p.code)).toEqual(["P01", "P02", "P03", "P04"]);
    expect(list[2]!.attributes).toEqual({ Age: "31" });

    await anonymizeParticipant(owner.id, ws.id, study.id, a.id);
    const anon = await getParticipant(ws.id, study.id, a.id);
    expect(anon).toMatchObject({ name: null, email: null, code: "P01", attributes: { Segment: "Heavy" } });
    expect(anon.anonymizedAt).toBeInstanceOf(Date);
  });

  it("only lets editors change participants", async () => {
    const { owner, ws, study } = await setup();
    const analyst = await member(ws.id, owner.id, "analyst");
    await expectCode(createParticipant(analyst.id, ws.id, study.id, { name: "X" }), "forbidden");
    const p = await createParticipant(owner.id, ws.id, study.id, { name: "X" });
    await expectCode(setParticipantStatus(analyst.id, ws.id, study.id, p.id, "eligible"), "forbidden");
    // Another workspace can't reach this study.
    const other = await setup();
    await expectCode(createParticipant(other.owner.id, other.ws.id, study.id, { name: "Y" }), "notFound");
  });
});

describe("consent", () => {
  it("versions the form and records online signatures", async () => {
    const { owner, ws, study } = await setup();
    const p = await createParticipant(owner.id, ws.id, study.id, { name: "Ana" });
    expect(await getConsentByToken(p.consentToken)).toBeNull(); // no form yet
    const c1 = await saveConsent(owner.id, ws.id, study.id, { title: "Consent", body: "Info", statements: ["I agree", "Record me"] });
    expect(c1.version).toBe(1);
    expect((await saveConsent(owner.id, ws.id, study.id, { title: "Consent", body: "Info", statements: ["I agree", "Record me"] })).version).toBe(1);

    const page = (await getConsentByToken(p.consentToken))!;
    expect(page).toMatchObject({ code: "P01", signedCurrent: false, studyName: "Rituals" });
    await expectCode(signConsent(p.consentToken, { name: "Ana Silva", agreed: [0], version: 1 }), "invalid");
    await signConsent(p.consentToken, { name: "Ana Silva", agreed: [0, 1], version: 1 });
    expect((await getConsentByToken(p.consentToken))!.signedCurrent).toBe(true);

    // New wording → new version → the old signature no longer counts as current.
    await saveConsent(owner.id, ws.id, study.id, { title: "Consent", body: "Info v2", statements: ["I agree"] });
    expect((await getConsentByToken(p.consentToken))!.signedCurrent).toBe(false);
    await expectCode(signConsent(p.consentToken, { name: "Ana Silva", agreed: [0], version: 1 }), "conflict");

    await recordConsent(owner.id, ws.id, study.id, p.id, { method: "verbal" });
    const [row] = await db.select().from(participants).where(eq(participants.id, p.id));
    expect(row).toMatchObject({ consentMethod: "verbal", consentVersion: 2, consentName: "Ana" });
    expect(await getConsentByToken("not-a-real-token-0000000")).toBeNull();
  });
});

describe("guides", () => {
  it("saves a guide document", async () => {
    const { owner, ws, study } = await setup();
    expect((await getGuide(ws.id, study.id)).doc.sections).toEqual([]);
    const doc = guideTemplate("coffee");
    await saveGuide(owner.id, ws.id, study.id, doc);
    expect((await getGuide(ws.id, study.id)).doc).toEqual(doc);
    await expect(saveGuide(owner.id, ws.id, study.id, { intro: 1 })).rejects.toThrow();
  });
});

describe("sessions", () => {
  it("schedules sessions and moves participants along", async () => {
    const { owner, ws, study } = await setup();
    const p = await createParticipant(owner.id, ws.id, study.id, { name: "Ana" });
    const s = await createSession(owner.id, ws.id, study.id, { kind: "interview", scheduledAt: new Date("2026-10-10T10:00:00Z"), participantIds: [p.id] });
    expect(s.title).toBe("Interview · P01");
    expect((await getParticipant(ws.id, study.id, p.id)).status).toBe("scheduled");
    await setSessionStatus(owner.id, ws.id, study.id, s.id, "completed");
    expect((await getParticipant(ws.id, study.id, p.id)).status).toBe("completed");
    const list = await listSessions(ws.id, study.id);
    expect(list[0]).toMatchObject({ id: s.id, status: "completed", participants: [{ code: "P01" }] });
    // Interviews hold one participant; focus groups more.
    const q = await createParticipant(owner.id, ws.id, study.id, { name: "Bo" });
    await expectCode(createSession(owner.id, ws.id, study.id, { kind: "interview", participantIds: [p.id, q.id] }), "invalid");
    await createSession(owner.id, ws.id, study.id, { kind: "focus_group", participantIds: [p.id, q.id] });
  });

  it("transcribes an uploaded recording with the mock provider", async () => {
    const { owner, ws, study } = await setup();
    await saveGuide(owner.id, ws.id, study.id, guideTemplate("coffee"));
    const p = await createParticipant(owner.id, ws.id, study.id, { name: "Ana" });
    const s = await createSession(owner.id, ws.id, study.id, { kind: "interview", participantIds: [p.id] });
    await expectCode(attachMedia(owner.id, ws.id, study.id, s.id, { data: new Uint8Array([1, 2]), mime: "text/html", name: "x.html", durationMs: null }), "invalid");
    const { transcriptId } = await attachMedia(owner.id, ws.id, study.id, s.id, { data: new Uint8Array(1024), mime: "audio/webm;codecs=opus", name: "rec.webm", durationMs: 300_000 });
    expect((await getSessionDetail(ws.id, study.id, s.id)).transcript!.status).toBe("processing");
    await runTranscription(transcriptId);
    const detail = await getSessionDetail(ws.id, study.id, s.id);
    expect(detail.transcript).toMatchObject({ status: "ready", provider: "mock" });
    expect(detail.transcript!.speakers).toEqual({
      S1: { name: "Rita Researcher", role: "interviewer" },
      S2: { name: "P01", role: "participant", participantId: p.id },
    });
    expect(detail.segments.length).toBeGreaterThan(8);
    expect(detail.segments.at(-1)!.endMs!).toBeLessThanOrEqual(300_000);
    expect(detail.media).toMatchObject({ mime: "audio/webm", size: 1024 });

    // Fix a segment and rename the interviewer.
    const seg = detail.segments[1]!;
    await updateSegment(owner.id, ws.id, study.id, s.id, seg.id, { text: "Corrected text", speaker: "S1" });
    await updateSpeakers(owner.id, ws.id, study.id, s.id, { S1: { name: "Rita", role: "interviewer" } });
    const after = await getSessionDetail(ws.id, study.id, s.id);
    expect(after.segments[1]).toMatchObject({ text: "Corrected text", speaker: "S1" });
    expect(after.transcript!.speakers.S1!.name).toBe("Rita");
    await expectCode(updateSegment(owner.id, ws.id, study.id, s.id, seg.id, { text: "x", speaker: "S9" }), "invalid");
  });

  it("marks failed transcriptions", async () => {
    const { owner, ws, study } = await setup();
    const s = await createSession(owner.id, ws.id, study.id, { kind: "interview" });
    const { transcriptId } = await attachMedia(owner.id, ws.id, study.id, s.id, { data: new Uint8Array(10), mime: "audio/wav", name: "a.wav", durationMs: 1000 });
    const broken: TranscriptionProvider = { name: "broken", transcribe: () => Promise.reject(new Error("service down")) };
    await runTranscription(transcriptId, broken);
    expect((await getSessionDetail(ws.id, study.id, s.id)).transcript).toMatchObject({ status: "failed", error: "service down" });
  });

  it("imports transcripts and links speakers to participants", async () => {
    const { owner, ws, study } = await setup();
    const p = await createParticipant(owner.id, ws.id, study.id, { name: "Sam Lee" });
    const s = await createSession(owner.id, ws.id, study.id, { kind: "interview", participantIds: [p.id] });
    const res = await importTranscript(owner.id, ws.id, study.id, s.id, "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nJane: Hi Sam\n\n00:00:03.000 --> 00:00:05.000\nSam Lee: Hi!\n");
    expect(res).toEqual({ format: "vtt", segments: 2 });
    const d = await getSessionDetail(ws.id, study.id, s.id);
    expect(d.transcript!.speakers).toEqual({ S2: { name: "P01", role: "participant", participantId: p.id }, S1: { name: "Jane", role: "interviewer" } });
    expect(d.segments.map((x) => x.speaker)).toEqual(["S1", "S2"]);
    await expectCode(importTranscript(owner.id, ws.id, study.id, s.id, "   "), "invalid");
  });

  it("stores field notes and diary entries as text", async () => {
    const { owner, ws, study } = await setup();
    const p = await createParticipant(owner.id, ws.id, study.id, { name: "Dia" });
    const diary = await createSession(owner.id, ws.id, study.id, { kind: "diary", participantIds: [p.id], body: "Woke up late.\n\nSkipped coffee — regretted it." });
    expect(diary.status).toBe("completed");
    const d = await getSessionDetail(ws.id, study.id, diary.id);
    expect(d.segments.map((x) => x.text)).toEqual(["Woke up late.", "Skipped coffee — regretted it."]);
    expect(d.transcript!.speakers.S1).toMatchObject({ name: "P01", role: "participant" });
    expect((await getParticipant(ws.id, study.id, p.id)).status).toBe("completed");

    const notes = await createSession(owner.id, ws.id, study.id, { kind: "field_notes", title: "Café visit" });
    expect(notes.status).toBe("scheduled");
    await saveTextEntry(owner.id, ws.id, study.id, notes.id, "Queue of 12 at 8:05.");
    const n = await getSessionDetail(ws.id, study.id, notes.id);
    expect(n.session.status).toBe("completed");
    expect(n.transcript!.speakers.S1).toMatchObject({ name: "Rita Researcher", role: "interviewer" });
  });

  it("takes timestamped notes; analysts can, viewers can't", async () => {
    const { owner, ws, study } = await setup();
    const s = await createSession(owner.id, ws.id, study.id, { kind: "interview" });
    const analyst = await member(ws.id, owner.id, "analyst");
    const viewer = await member(ws.id, owner.id, "viewer");
    const note = await addNote(analyst.id, ws.id, study.id, s.id, { text: "Great quote", tag: "Quote", atMs: 65_000 });
    expect(note).toMatchObject({ tag: "quote", atMs: 65_000 });
    await expectCode(addNote(viewer.id, ws.id, study.id, s.id, { text: "x" }), "forbidden");
    await expectCode(addNote(owner.id, ws.id, study.id, s.id, { text: "" }), "invalid");
    const mine = await addNote(owner.id, ws.id, study.id, s.id, { text: "Owner note", atMs: 1000 });
    await expectCode(deleteNote(analyst.id, ws.id, study.id, s.id, mine.id), "forbidden");
    await deleteNote(owner.id, ws.id, study.id, s.id, note.id);
    expect((await getSessionDetail(ws.id, study.id, s.id)).notes.map((x) => x.text)).toEqual(["Owner note"]);
  });
});

describe("demo", () => {
  it("seeds an interview study people can explore", async () => {
    const [user] = await db.insert(users).values({ name: "Demo Dee", email: `dee-${newId("t")}@example.com` }).returning();
    const ws = await createWorkspace(user!.id, { name: "Demo Lab", withDemo: true });
    const [study] = await db.select().from(studies).where(and(eq(studies.workspaceId, ws.id), eq(studies.type, "interview")));
    const people = await listParticipants(ws.id, study!.id);
    expect(people.map((p) => p.status)).toEqual(["completed", "completed", "scheduled", "eligible", "recruited"]);
    const sessions = await listSessions(ws.id, study!.id);
    expect(sessions).toHaveLength(4);
    const maya = sessions.find((s) => s.title === "Interview · P01")!;
    const d = await getSessionDetail(ws.id, study!.id, maya.id);
    expect(d.transcript!.speakers.S1).toEqual({ name: "Demo Dee", role: "interviewer" });
    expect(d.segments[1]).toMatchObject({ speaker: "S2", startMs: 12_000 });
    expect(d.notes).toHaveLength(4);
    expect((await getGuide(ws.id, study!.id)).consent?.version).toBe(1);
  });
});

describe("speaker assignment", () => {
  const ctx = { interviewerName: "Rita", participants: [{ id: "p1", code: "P01", name: "Ana" }, { id: "p2", code: "P02", name: null }] };

  it("assumes the first unknown voice is the interviewer", () => {
    const r = assignSpeakers(
      [
        { speaker: "A", startMs: 0, endMs: 1, text: "q" },
        { speaker: "B", startMs: 1, endMs: 2, text: "a" },
        { speaker: "C", startMs: 2, endMs: 3, text: "a" },
      ],
      ctx,
    );
    expect(r.speakers).toEqual({
      S1: { name: "Rita", role: "interviewer" },
      S2: { name: "P01", role: "participant", participantId: "p1" },
      S3: { name: "P02", role: "participant", participantId: "p2" },
    });
  });

  it("keeps a single unknown voice neutral", () => {
    expect(assignSpeakers([{ speaker: "S1", startMs: 0, endMs: 1, text: "x" }], ctx).speakers).toEqual({ S1: { name: "Speaker 1", role: "other" } });
  });

  it("reads OpenAI-style verbose JSON", () => {
    expect(parseVerbose({ language: "english", segments: [{ start: 0.5, end: 2.25, text: " Hello " }, { start: 3, end: 4, text: " " }] })).toEqual({
      language: "english",
      segments: [{ speaker: "S1", startMs: 500, endMs: 2250, text: "Hello" }],
    });
  });
});
