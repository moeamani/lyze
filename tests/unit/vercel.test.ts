import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { runMigrations } from "@/server/db/migrations";
import { files, researchSessions, users } from "@/server/db/schema";
import { createWorkspace } from "@/server/services/workspaces";
import { createProject } from "@/server/services/projects";
import { createStudy } from "@/server/services/studies";
import { createForm, publishForm, saveDraft } from "@/server/services/forms";
import { RespondentError, startResponse, uploadAnswerFile } from "@/server/services/respondent";
import { attachMedia } from "@/server/services/sessions";
import { uploadTarget } from "@/server/services/upload-targets";
import { claimUpload } from "@/server/storage/direct";
import { storageFor } from "@/server/storage";
import { setupProblems } from "@/server/setup";
import { AppError } from "@/server/services/errors";
import { createQuestion } from "@/lib/forms/questions";
import type { Question } from "@/lib/forms/schema";
import { newId } from "@/lib/ids";

// Stand-in for Vercel Blob: what the browser "uploaded", by path.
const blobs = new Map<string, { size: number; contentType: string }>();
const deleted: string[] = [];
vi.mock("@vercel/blob", () => ({
  head: async (pathname: string) => {
    const b = blobs.get(pathname);
    if (!b) throw new Error("BlobNotFoundError");
    return { pathname, size: b.size, contentType: b.contentType };
  },
  del: async (pathname: string) => void deleted.push(pathname),
  put: async () => ({}),
  get: async () => null,
}));

const code = (p: Promise<unknown>, c: string) => expect(p).rejects.toSatisfy((e: unknown) => e instanceof AppError && e.code === c);
const env = { ...process.env };

beforeAll(async () => {
  await runMigrations();
});
afterEach(() => {
  process.env = { ...env };
});

async function user(name: string) {
  const [u] = await db.insert(users).values({ name, email: `${name}-${newId("t")}@example.com` }).returning();
  return u!;
}

describe("setup page", () => {
  it("lists what a fresh Vercel deployment is missing", () => {
    process.env.VERCEL = "1";
    (process.env as Record<string, string>).NODE_ENV = "production";
    delete process.env.AUTH_SECRET;
    expect(setupProblems().map((p) => p.key)).toEqual(["database", "authSecret"]);
    process.env.POSTGRES_URL = "postgres://x";
    process.env.AUTH_SECRET = "s".repeat(32);
    expect(setupProblems()).toEqual([]);
  });
});

describe("direct uploads", () => {
  it("only hands out upload paths to people allowed to write there, and checks what comes back", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_test";
    const owner = await user("owner");
    const stranger = await user("stranger");
    const ws = await createWorkspace(owner.id, { name: "Blob Lab", withDemo: true });
    const [session] = await db.select().from(researchSessions).where(eq(researchSessions.workspaceId, ws.id)).limit(1);

    // Recordings: members with edit rights only; outsiders learn nothing.
    await code(uploadTarget(null, { kind: "media", sessionId: session!.id }), "unauthorized");
    await code(uploadTarget(stranger.id, { kind: "media", sessionId: session!.id }), "notFound");
    const target = await uploadTarget(owner.id, { kind: "media", sessionId: session!.id });
    expect(target).toMatchObject({ prefix: `${ws.id}/sessions/${session!.id}/`, contentTypes: ["audio/*", "video/*"] });

    // The reported path must be under that prefix and exist.
    await code(claimUpload(`${ws.id}/sessions/other/x.m4a`, target), "invalid");
    await code(claimUpload(`${target.prefix}missing.m4a`, target), "invalid");
    await code(claimUpload(`${target.prefix}../../x.m4a`, target), "invalid");
    blobs.set(`${target.prefix}talk-abc.m4a`, { size: 12_000_000, contentType: "audio/mp4" });
    const stored = await claimUpload(`${target.prefix}talk-abc.m4a`, target);
    expect(stored).toEqual({ key: `${target.prefix}talk-abc.m4a`, size: 12_000_000, mime: "audio/mp4" });

    // Recording the session points at the blob; no bytes pass through the server.
    const { fileId } = await attachMedia(owner.id, ws.id, session!.studyId, session!.id, { stored, mime: stored.mime, name: "talk.m4a", durationMs: 60_000 });
    const [row] = await db.select().from(files).where(eq(files.id, fileId));
    expect(row).toMatchObject({ storage: "blob", key: stored.key, size: 12_000_000, mime: "audio/mp4", name: "talk.m4a" });
    expect(storageFor("blob").name).toBe("blob");

    // A non-media file reported as a recording is refused and removed.
    blobs.set(`${target.prefix}notes.pdf`, { size: 100, contentType: "application/pdf" });
    const pdf = await claimUpload(`${target.prefix}notes.pdf`, target);
    await code(attachMedia(owner.id, ws.id, session!.studyId, session!.id, { stored: pdf, mime: pdf.mime, name: "notes.pdf", durationMs: null }), "invalid");
    expect(deleted).toContain(`${target.prefix}notes.pdf`);
  }, 30_000);

  it("lets respondents upload answers directly, within the question's limits", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_test";
    const owner = await user("forms");
    const ws = await createWorkspace(owner.id, { name: "Blob Forms" });
    const project = await createProject(owner.id, ws.id, { name: "P" });
    const study = await createStudy(owner.id, ws.id, project.id, { name: "S", type: "survey" });
    const form = await createForm(owner.id, ws.id, project.id, study.id, "blank");
    const q = createQuestion("file_upload") as Extract<Question, { type: "file_upload" }>;
    q.id = "doc";
    q.title = "Upload a photo";
    q.config = { accept: "image", maxFiles: 1, maxSizeMb: 1 };
    await saveDraft(owner.id, ws.id, form.id, { ...form.draft, pages: [{ id: "p", shuffleQuestions: false, questions: [q] }] });
    await publishForm(owner.id, ws.id, form.id);
    const { token } = await startResponse(form.publicId, {});

    const target = await uploadTarget(null, { kind: "answer", publicId: form.publicId, token, questionId: "doc" });
    expect(target.prefix).toMatch(new RegExp(`^${ws.id}/responses/rsp`));
    expect(target.maxBytes).toBe(1024 * 1024);
    await expect(uploadTarget(null, { kind: "answer", publicId: form.publicId, token: "x".repeat(20), questionId: "doc" })).rejects.toBeInstanceOf(RespondentError);

    blobs.set(`${target.prefix}pic-1.png`, { size: 2000, contentType: "image/png" });
    const saved = await uploadAnswerFile(form.publicId, token, "doc", { blob: `${target.prefix}pic-1.png`, name: "pic.png" });
    expect(saved).toMatchObject({ name: "pic.png", size: 2000, mime: "image/png" });

    blobs.set(`${target.prefix}page.html`, { size: 10, contentType: "text/html" });
    await expect(uploadAnswerFile(form.publicId, token, "doc", { blob: `${target.prefix}page.html`, name: "page.html" })).rejects.toSatisfy((e: unknown) => e instanceof RespondentError && e.code === "fileType");
    expect(deleted).toContain(`${target.prefix}page.html`);
  }, 30_000);
});
