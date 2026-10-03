import { beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { runMigrations } from "@/server/db/migrations";
import { participants, researchSessions, sessionParticipants, studies, users } from "@/server/db/schema";
import { createWorkspace } from "@/server/services/workspaces";
import { getSessionDetail, importTranscriptAsSession } from "@/server/services/sessions";
import { AppError } from "@/server/services/errors";
import { docxText } from "@/lib/docx";
import { newId } from "@/lib/ids";
import { FOCUS_GROUP } from "./docx-import.test";

beforeAll(async () => {
  await runMigrations();
});

describe("importing transcripts as sessions", () => {
  it("creates a completed session, merges spellings, and turns voices into participants once", async () => {
    const [u] = await db.insert(users).values({ name: "Owner", email: `o-${newId("t")}@example.com` }).returning();
    const ws = await createWorkspace(u!.id, { name: "Import", withDemo: true });
    const [study] = await db.select().from(studies).where(and(eq(studies.workspaceId, ws.id), eq(studies.type, "interview"))).limit(1);
    const before = await db.select().from(participants).where(eq(participants.studyId, study!.id));
    const plan = {
      names: { Leena: "Lena", "one of the teachers": "One of the teachers" },
      roles: { Nadia: "interviewer" as const, Omar: "participant" as const, Lena: "participant" as const, "Multiple people": "other" as const, "One of the teachers": "other" as const },
      addParticipants: true,
    };
    const text = docxText(FOCUS_GROUP);
    const r = await importTranscriptAsSession(u!.id, ws.id, study!.id, { title: "Session 3", kind: "focus_group", text }, plan);
    expect(r.segments).toBe(11);

    const detail = await getSessionDetail(ws.id, study!.id, r.sessionId);
    expect(detail.session).toMatchObject({ title: "Session 3", kind: "focus_group", status: "completed" });
    const speakers = Object.values(detail.transcript!.speakers);
    const created = (await db.select().from(participants).where(eq(participants.studyId, study!.id))).filter((p) => !before.some((b) => b.id === p.id));
    expect(created.map((p) => p.name).sort()).toEqual(["Lena", "Omar"]);
    expect(speakers).toEqual(
      expect.arrayContaining([
        { name: "Nadia", role: "interviewer" },
        { name: "Multiple people", role: "other" },
        { name: "One of the teachers", role: "other" },
        ...created.map((p) => ({ name: p.code, role: "participant", participantId: p.id })),
      ]),
    );
    expect(speakers).toHaveLength(5);
    expect(await db.select().from(sessionParticipants).where(eq(sessionParticipants.sessionId, r.sessionId))).toHaveLength(2);

    // A second session with the same people reuses them.
    await importTranscriptAsSession(u!.id, ws.id, study!.id, { title: "Session 4", kind: "focus_group", text }, plan);
    expect((await db.select().from(participants).where(eq(participants.studyId, study!.id))).length).toBe(before.length + 2);

    // An empty file leaves no session behind.
    const sessions = (await db.select().from(researchSessions).where(eq(researchSessions.studyId, study!.id))).length;
    await expect(importTranscriptAsSession(u!.id, ws.id, study!.id, { title: "Empty", kind: "interview", text: "   " }, plan)).rejects.toBeInstanceOf(AppError);
    expect((await db.select().from(researchSessions).where(eq(researchSessions.studyId, study!.id))).length).toBe(sessions);
  }, 30_000);
});
