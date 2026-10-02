import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { runMigrations } from "@/server/db/migrations";
import { answers, files, responses, studies, users } from "@/server/db/schema";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createWorkspace } from "@/server/services/workspaces";
import { createProject } from "@/server/services/projects";
import { createStudy, updateStudy } from "@/server/services/studies";
import { createForm, getFormForStudy, hasUnpublishedChanges, publishForm, PublishError, saveDraft } from "@/server/services/forms";
import { RespondentError, getPublicForm, resumeResponse, saveProgress, startResponse, submitResponse, uploadAnswerFile } from "@/server/services/respondent";
import { createFormInvites, deleteResponse, getResponseDetail, listResponses, parseEmailList, responseCounts } from "@/server/services/responses";
import { acceptInvite, createInvite } from "@/server/services/members";
import { AppError } from "@/server/services/errors";
import { newId } from "@/lib/ids";
import { createQuestion } from "@/lib/forms/questions";
import type { FormDoc, Question } from "@/lib/forms/schema";

async function makeUser(name: string) {
  const [user] = await db.insert(users).values({ name, email: `${name.toLowerCase()}-${newId("t")}@example.com` }).returning();
  return user!;
}

async function setup(template: Parameters<typeof createForm>[4] = "blank") {
  const owner = await makeUser("Owner");
  const ws = await createWorkspace(owner.id, { name: "Forms Lab" });
  const project = await createProject(owner.id, ws.id, { name: "P" });
  const study = await createStudy(owner.id, ws.id, project.id, { name: "Survey", type: "survey" });
  const form = await createForm(owner.id, ws.id, project.id, study.id, template);
  return { owner, ws, project, study, form };
}

/** A two-question form: a required choice that can screen people out, then a number. */
function screenerDoc(base: FormDoc): FormDoc {
  const pick = createQuestion("single_choice") as Extract<Question, { type: "single_choice" }>;
  pick.id = "pick";
  pick.title = "Pick one";
  pick.required = true;
  pick.config.options = [
    { id: "a", label: "A" },
    { id: "b", label: "B" },
    { id: "out", label: "Not me" },
  ];
  const age = createQuestion("number");
  age.id = "age";
  age.title = "Age";
  age.required = true;
  return {
    ...base,
    pages: [
      { id: "p1", shuffleQuestions: false, questions: [pick] },
      { id: "p2", shuffleQuestions: false, questions: [age] },
    ],
    logic: [{ id: "end", action: "end_form", screenOut: true, when: { match: "all", conditions: [{ questionId: "pick", operator: "equals", value: "out" }] } }],
    settings: {
      ...base.settings,
      quotas: [{ id: "qa", name: "As", limit: 1, when: { match: "all", conditions: [{ questionId: "pick", operator: "equals", value: "a" }] }, message: "Full" }],
    },
  };
}

async function expectRespondentError(p: Promise<unknown>, code: RespondentError["code"]) {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof RespondentError && e.code === code);
}

beforeAll(async () => {
  await runMigrations();
});

describe("form lifecycle", () => {
  it("creates one form per study from a template", async () => {
    const { owner, ws, project, study, form } = await setup("customerFeedback");
    expect(form.draft.title).toBe("Customer feedback");
    expect(form.publicId).toMatch(/^[a-z0-9]{10}$/);
    const again = await createForm(owner.id, ws.id, project.id, study.id, "blank");
    expect(again.id).toBe(form.id);
  });

  it("refuses forms for interview studies", async () => {
    const owner = await makeUser("Owner");
    const ws = await createWorkspace(owner.id, { name: "X" });
    const project = await createProject(owner.id, ws.id, { name: "P" });
    const study = await createStudy(owner.id, ws.id, project.id, { name: "Talks", type: "interview" });
    await expect(createForm(owner.id, ws.id, project.id, study.id, "blank")).rejects.toBeInstanceOf(AppError);
  });

  it("validates drafts on save", async () => {
    const { owner, ws, form } = await setup();
    await expect(saveDraft(owner.id, ws.id, form.id, { nope: true })).rejects.toThrow();
    await expect(saveDraft(owner.id, ws.id, form.id, { ...form.draft, title: "Renamed" })).resolves.toHaveProperty("updatedAt");
  });

  it("blocks publishing an empty form and explains why", async () => {
    const { owner, ws, form } = await setup();
    await expect(publishForm(owner.id, ws.id, form.id)).rejects.toSatisfy(
      (e: unknown) => e instanceof PublishError && e.issues.some((i) => i.code === "noQuestions"),
    );
  });

  it("publishes immutable versions and opens the study", async () => {
    const { owner, ws, study, form } = await setup();
    await saveDraft(owner.id, ws.id, form.id, screenerDoc(form.draft));
    expect(await publishForm(owner.id, ws.id, form.id)).toEqual({ version: 1 });
    const [s] = await db.select().from(studies).where(eq(studies.id, study.id));
    expect(s!.status).toBe("live");

    const current = (await getFormForStudy(ws.id, study.id))!;
    expect(await hasUnpublishedChanges(current)).toBe(false);
    await saveDraft(owner.id, ws.id, form.id, { ...current.draft, title: "v2" });
    expect(await hasUnpublishedChanges((await getFormForStudy(ws.id, study.id))!)).toBe(true);
    expect(await publishForm(owner.id, ws.id, form.id)).toEqual({ version: 2 });
    expect((await getPublicForm(form.publicId))!.doc.title).toBe("v2");
  });

  it("only lets editors change forms", async () => {
    const { owner, ws, form } = await setup();
    const viewer = await makeUser("Viewer");
    const { invite } = await createInvite(owner.id, ws.id, { email: viewer.email!, role: "viewer" });
    await acceptInvite(viewer.id, viewer.email, invite.token);
    await expect(saveDraft(viewer.id, ws.id, form.id, form.draft)).rejects.toSatisfy((e: unknown) => e instanceof AppError && e.code === "forbidden");
  });
});

describe("responding", () => {
  async function published(mode: FormDoc["settings"]["oneResponse"] = "none") {
    const ctx = await setup();
    const doc = screenerDoc(ctx.form.draft);
    doc.settings.oneResponse = mode;
    await saveDraft(ctx.owner.id, ctx.ws.id, ctx.form.id, doc);
    await publishForm(ctx.owner.id, ctx.ws.id, ctx.form.id);
    return ctx;
  }

  it("saves progress as people answer, then submits", async () => {
    const { ws, study, form } = await published();
    const start = await startResponse(form.publicId, { deviceId: "d1" });
    await saveProgress(form.publicId, start.token, { answers: { pick: { choice: "b" }, bogus: 1 }, pageId: "p2" });

    const resumed = await resumeResponse(form.publicId, start.token);
    expect(resumed.answers).toEqual({ pick: { choice: "b" } });
    expect(resumed.pageId).toBe("p2");

    // Clearing an answer with null removes it.
    await saveProgress(form.publicId, start.token, { answers: { age: 30 } });
    await saveProgress(form.publicId, start.token, { answers: { age: null } });
    expect((await resumeResponse(form.publicId, start.token)).answers).toEqual({ pick: { choice: "b" } });

    expect(await submitResponse(form.publicId, start.token, { pick: { choice: "b" }, age: 41 })).toEqual({ status: "complete", message: undefined });
    const rows = await db.select().from(answers).innerJoin(responses, eq(responses.id, answers.responseId)).where(eq(responses.resumeToken, start.token));
    expect(rows.find((r) => r.answers.questionId === "age")!.answers.numeric).toBe(41);

    // Finished responses can't be changed or resumed.
    await expectRespondentError(submitResponse(form.publicId, start.token, { pick: { choice: "b" }, age: 41 }), "alreadyResponded");
    await expectRespondentError(resumeResponse(form.publicId, start.token), "alreadyResponded");

    expect(await responseCounts(ws.id, study.id)).toMatchObject({ complete: 1, partial: 0 });
  });

  it("rejects invalid submissions with per-question errors", async () => {
    const { form } = await published();
    const { token } = await startResponse(form.publicId, {});
    await expect(submitResponse(form.publicId, token, { pick: { choice: "a" } })).rejects.toSatisfy(
      (e: unknown) => e instanceof RespondentError && e.code === "invalid" && e.details?.age === "required",
    );
  });

  it("records screened-out respondents without asking the rest", async () => {
    const { form } = await published();
    const { token } = await startResponse(form.publicId, {});
    expect((await submitResponse(form.publicId, token, { pick: { choice: "out" }, age: 99 })).status).toBe("screened_out");
  });

  it("closes quotas once full", async () => {
    const { form } = await published();
    const first = await startResponse(form.publicId, {});
    expect((await submitResponse(form.publicId, first.token, { pick: { choice: "a" }, age: 20 })).status).toBe("complete");
    const second = await startResponse(form.publicId, {});
    expect(await submitResponse(form.publicId, second.token, { pick: { choice: "a" }, age: 21 })).toEqual({ status: "over_quota", message: "Full" });
    const third = await startResponse(form.publicId, {});
    expect((await submitResponse(form.publicId, third.token, { pick: { choice: "b" }, age: 22 })).status).toBe("complete");
  });

  it("allows one response per device when asked", async () => {
    const { form } = await published("device");
    const a = await startResponse(form.publicId, { deviceId: "phone" });
    // Starting again on the same device resumes the same response.
    expect((await startResponse(form.publicId, { deviceId: "phone" })).token).toBe(a.token);
    await submitResponse(form.publicId, a.token, { pick: { choice: "b" }, age: 30 });
    await expectRespondentError(startResponse(form.publicId, { deviceId: "phone" }), "alreadyResponded");
    await expect(startResponse(form.publicId, { deviceId: "laptop" })).resolves.toHaveProperty("token");
  });

  it("requires a personal link in invite-only mode", async () => {
    const { owner, ws, form } = await published("invite");
    await expectRespondentError(startResponse(form.publicId, {}), "inviteRequired");
    const { invites } = await createFormInvites(owner.id, ws.id, form.id, ["Ada@Example.com".toLowerCase()]);
    const { token } = await startResponse(form.publicId, { inviteToken: invites[0]!.token });
    await submitResponse(form.publicId, token, { pick: { choice: "b" }, age: 30 });
    await expectRespondentError(startResponse(form.publicId, { inviteToken: invites[0]!.token }), "alreadyResponded");
  });

  it("stops accepting responses when the study closes", async () => {
    const { owner, ws, project, study, form } = await published();
    const { token } = await startResponse(form.publicId, {});
    await updateStudy(owner.id, ws.id, project.id, study.id, { name: "Survey", status: "closed" });
    await expectRespondentError(submitResponse(form.publicId, token, { pick: { choice: "b" }, age: 1 }), "closed");
    await expectRespondentError(startResponse(form.publicId, {}), "closed");
  });

  it("lists, shows and deletes responses for the team", async () => {
    const { owner, ws, study, form } = await published();
    const { token } = await startResponse(form.publicId, {});
    await submitResponse(form.publicId, token, { pick: { choice: "b" }, age: 33 });
    const { items } = await listResponses(ws.id, study.id);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ status: "complete", answerCount: 2 });
    const detail = await getResponseDetail(ws.id, study.id, items[0]!.id);
    expect(detail.answers).toEqual({ pick: { choice: "b" }, age: 33 });
    expect(detail.doc?.pages).toHaveLength(2);
    await deleteResponse(owner.id, ws.id, study.id, items[0]!.id);
    expect((await listResponses(ws.id, study.id)).items).toHaveLength(0);
  });

  it("does not serve unpublished forms", async () => {
    const { form } = await setup();
    expect(await getPublicForm(form.publicId)).toBeNull();
    await expectRespondentError(startResponse(form.publicId, {}), "notFound");
  });
});

describe("file answers", () => {
  it("stores accepted files, rejects bad ones, and cleans up unused uploads", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lyze-uploads-"));
    process.env.UPLOADS_DIR = dir;
    const { owner, ws, study, form } = await setup();
    const upload = createQuestion("file_upload") as Extract<Question, { type: "file_upload" }>;
    upload.id = "doc";
    upload.title = "Upload a photo";
    upload.config = { accept: "image", maxFiles: 2, maxSizeMb: 1 };
    await saveDraft(owner.id, ws.id, form.id, { ...form.draft, pages: [{ id: "p", shuffleQuestions: false, questions: [upload] }] });
    await publishForm(owner.id, ws.id, form.id);

    const { token } = await startResponse(form.publicId, {});
    const png = new File([new Uint8Array([137, 80, 78, 71])], "pic.png", { type: "image/png" });
    const kept = await uploadAnswerFile(form.publicId, token, "doc", png);
    const dropped = await uploadAnswerFile(form.publicId, token, "doc", png);
    await expectRespondentError(uploadAnswerFile(form.publicId, token, "doc", new File(["<script>"], "x.html", { type: "text/html" })), "fileType");
    await expectRespondentError(uploadAnswerFile(form.publicId, token, "doc", new File([new Uint8Array(2 * 1024 * 1024)], "big.png", { type: "image/png" })), "tooLarge");

    await submitResponse(form.publicId, token, { doc: { fileIds: [kept.id] } });
    const rows = await db.select().from(files).where(eq(files.workspaceId, ws.id));
    expect(rows.map((r) => r.id)).toEqual([kept.id]);
    expect(rows[0]!.storage).toBe("local");
    expect(fs.existsSync(path.join(dir, rows[0]!.key))).toBe(true);
    expect(dropped.id).not.toBe(kept.id);

    const { items } = await listResponses(ws.id, study.id);
    const detail = await getResponseDetail(ws.id, study.id, items[0]!.id);
    expect(Object.keys(detail.files)).toEqual([kept.id]);
  });
});

describe("parseEmailList", () => {
  it("splits, normalizes and dedupes", () => {
    expect(parseEmailList("A@x.co, b@y.co\nnot-an-email; a@x.co")).toEqual({ valid: ["a@x.co", "b@y.co"], invalid: ["not-an-email"] });
  });
});
