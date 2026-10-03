import { beforeAll, describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { runMigrations } from "@/server/db/migrations";
import { projects, studies, users } from "@/server/db/schema";
import { createWorkspace } from "@/server/services/workspaces";
import { createGroup, deleteGroup, listGroups, listProjects, moveGroup, setProjectGroup } from "@/server/services/projects";
import { listNotifications, markRead, notify, unreadCount } from "@/server/services/notifications";
import { listAuditEvents } from "@/server/services/audit";
import { caseMatrix, closedQuestions, codeByQuestion, jointDisplay } from "@/server/services/mixed";
import { attachProposal, buildContext, generateWriteup, getBrief, listWriteups, saveBrief } from "@/server/services/writeup";
import { cleanProse, proseIssues } from "@/lib/writeup/style";
import { composeWriteup, relevantCodes } from "@/lib/writeup/compose";
import { docxText } from "@/lib/writeup/extract";
import { newId } from "@/lib/ids";

async function demo() {
  const [user] = await db.insert(users).values({ name: "Mina Mixed", email: `mina-${newId("t")}@example.com` }).returning();
  const ws = await createWorkspace(user!.id, { name: "Mixed Lab", withDemo: true });
  const [project] = await db.select().from(projects).where(eq(projects.workspaceId, ws.id));
  const [survey] = await db.select().from(studies).where(and(eq(studies.workspaceId, ws.id), eq(studies.type, "survey")));
  return { user: user!, ws, project: project!, survey: survey! };
}

beforeAll(async () => {
  await runMigrations();
});

describe("house style", () => {
  it("removes dashes and curly quotes, and spots AI vocabulary", () => {
    expect(cleanProse("Coffee — mostly — is a pause. 3–5 cups. “Yes”")).toBe('Coffee, mostly, is a pause. 3 to 5 cups. "Yes"');
    expect(proseIssues("Let's delve into this vibrant tapestry")).toEqual(expect.arrayContaining(["delve", "vibrant", "tapestry"]));
    expect(proseIssues("People drink it on the balcony.")).toEqual([]);
  });

  it("reads paragraphs from a Word file", () => {
    const xml = `<w:document><w:body><w:p><w:r><w:t>Aim: study coffee &amp; sleep</w:t></w:r></w:p><w:p><w:r><w:t>RQ1</w:t></w:r></w:p></w:body></w:document>`;
    expect(docxText(zipSync({ "word/document.xml": strToU8(xml) }))).toBe("Aim: study coffee & sleep\nRQ1");
  });
});

describe("mixed methods", () => {
  it("lines codes up across conversations and the survey, and links people", async () => {
    const { ws, project, survey } = await demo();
    const joint = await jointDisplay(ws.id, project.id);
    expect(joint.respondents).toBeGreaterThan(40);
    const by = new Map(joint.rows.map((r) => [r.name, r]));
    expect(by.get("Pause")!.convergence).toBe("both");
    expect(by.get("Pause")!.qual.people).toBeGreaterThan(0);
    expect(joint.rows.some((r) => r.convergence === "qual")).toBe(true);

    const questions = await closedQuestions(ws.id, project.id);
    expect(questions.length).toBeGreaterThan(0);
    const q = questions[0]!;
    const cross = await codeByQuestion(ws.id, project.id, survey.id, q.questionId);
    expect(cross!.all.n).toBeGreaterThan(40);
    expect(cross!.rows.length).toBeGreaterThan(0);
    for (const r of cross!.rows) expect(r.n).toBeLessThanOrEqual(cross!.all.n);

    const cases = await caseMatrix(ws.id, project.id);
    const p01 = cases.find((c) => c.code === "P01")!;
    expect(p01.sessions).toBeGreaterThan(0);
    expect(p01.responses).toBe(1);
    expect(p01.codes.length).toBeGreaterThan(0);
  });
});

describe("written analysis", () => {
  it("writes a plain draft framed by the brief", async () => {
    const { user, ws, project } = await demo();
    const seeded = await getBrief(ws.id, project.id);
    expect(seeded.questions).toHaveLength(3);

    const ctx = await buildContext(ws.id, project.id);
    expect(relevantCodes(ctx.questions[2]!.text, ctx.codes).map((c) => c.name)).toContain("Cost");
    const { body } = composeWriteup(ctx);
    expect(body).toContain(ctx.questions[0]!.text);
    expect(body).toMatch(/H1\./);
    expect(proseIssues(body)).toEqual([]);

    await saveBrief(user.id, ws.id, project.id, { aim: "Why do people pause?", questions: [{ text: "When do people take their pause?" }], statements: [] });
    const file = new File(["Chapter 1. The pause."], "proposal.txt", { type: "text/plain" });
    expect(await attachProposal(user.id, ws.id, project.id, file)).toEqual({ name: "proposal.txt", readable: true });
    const w = await generateWriteup(user.id, ws.id, project.id);
    expect(w.provider).toBe("builtin");
    expect(w.body).toContain("When do people take their pause?");
    expect(w.body).toContain("proposal.txt");
    expect((await listWriteups(ws.id, project.id)).map((x) => x.id)).toContain(w.id);
    const events = await listAuditEvents(ws.id, { categories: ["writeup"] });
    expect(events.map((e) => e.action)).toEqual(expect.arrayContaining(["writeup.created", "brief.updated"]));
  });
});

describe("groups and notifications", () => {
  it("groups projects into folders that can be reordered and removed", async () => {
    const { user, ws, project } = await demo();
    const seeded = await listGroups(ws.id);
    expect(seeded.map((g) => g.name)).toEqual(["Examples"]);
    const thesis = await createGroup(user.id, ws.id, "Thesis");
    await moveGroup(user.id, ws.id, thesis.id, "up");
    expect((await listGroups(ws.id)).map((g) => g.name)).toEqual(["Thesis", "Examples"]);
    await setProjectGroup(user.id, ws.id, project.id, thesis.id);
    expect((await listProjects(ws.id))[0]!.groupId).toBe(thesis.id);
    await deleteGroup(user.id, ws.id, thesis.id);
    expect((await listProjects(ws.id))[0]!.groupId).toBeNull();
  });

  it("folds repeats into one unread notification", async () => {
    const { user, ws } = await demo();
    const before = await unreadCount(user.id);
    expect(before).toBe(2);
    await notify([user.id], { workspaceId: ws.id, kind: "responses", data: { study: "Test" }, groupKey: "responses:x" });
    await notify([user.id], { workspaceId: ws.id, kind: "responses", data: { study: "Test" }, groupKey: "responses:x" });
    const list = await listNotifications(user.id);
    expect(list[0]!.data.count).toBe(2);
    expect(await unreadCount(user.id)).toBe(3);
    await markRead(user.id, [list[0]!.id]);
    expect(await unreadCount(user.id)).toBe(2);
    await markRead(user.id);
    expect(await unreadCount(user.id)).toBe(0);
  });
});

describe("humanize swaps", () => {
  it("drops filler and swaps AI phrasing without breaking sentences", () => {
    expect(cleanProse("It is important to note that sleep matters. In order to cut down, people delve into habits.")).toBe("Sleep matters. To cut down, people look at habits.");
    expect(cleanProse("The cup serves as a pause, e.g. at 7am.")).toBe("The cup is a pause, e.g. at 7am.");
  });
});
