import { beforeAll, describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/server/db";
import { runMigrations } from "@/server/db/migrations";
import { codeApplications, codes, memos, projects, studies, themes, users } from "@/server/db/schema";
import { createWorkspace } from "@/server/services/workspaces";
import { acceptInvite, createInvite } from "@/server/services/members";
import { AppError } from "@/server/services/errors";
import { listDocuments, loadDocument } from "@/server/services/qual-docs";
import { createCode, deleteCode, exportCodebook, importCodebook, listCodes, mergeCodes, splitCode, updateCode } from "@/server/services/codebook";
import { applyCode, codeApplicationsOf, codingsForUnits, listQuotes, removeCoding, reviewSuggestions, setStarred } from "@/server/services/coding";
import { createTheme, listThemes, placeCode } from "@/server/services/themes";
import { createMemo, deleteMemo, listMemos } from "@/server/services/memos";
import { searchProject } from "@/server/services/qual-search";
import { clusterQuestion, createCodeFromCluster, draftTheme, suggestForDocument, summarizeSession } from "@/server/services/assist";
import { buildProjectQdpx } from "@/server/services/qual-export";
import { getSessionDetail, updateSegment } from "@/server/services/sessions";
import { listCodes as codesNow } from "@/server/services/codebook";
import { newId } from "@/lib/ids";

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toSatisfy((e: unknown) => e instanceof AppError && e.code === code);
}

/** A demo workspace. Its seeded codebook is cleared unless `seeded`, so tests start from a blank slate. */
async function demo({ seeded = false } = {}) {
  const [user] = await db.insert(users).values({ name: "Cora Coder", email: `cora-${newId("t")}@example.com` }).returning();
  const ws = await createWorkspace(user!.id, { name: "Coding Lab", withDemo: true });
  const [project] = await db.select().from(projects).where(eq(projects.workspaceId, ws.id));
  const [interviews] = await db.select().from(studies).where(and(eq(studies.workspaceId, ws.id), eq(studies.type, "interview")));
  const [survey] = await db.select().from(studies).where(and(eq(studies.workspaceId, ws.id), eq(studies.type, "survey")));
  if (!seeded) {
    await db.delete(codes).where(eq(codes.projectId, project!.id));
    await db.delete(themes).where(eq(themes.projectId, project!.id));
    await db.delete(memos).where(eq(memos.projectId, project!.id));
  }
  const docs = await listDocuments(ws.id, project!.id);
  return { user: user!, ws, project: project!, interviews: interviews!, survey: survey!, docs };
}

async function member(wsId: string, ownerId: string, role: "analyst" | "viewer") {
  const [u] = await db.insert(users).values({ name: role, email: `${role}-${newId("t")}@example.com` }).returning();
  const { invite } = await createInvite(ownerId, wsId, { email: u!.email!, role });
  await acceptInvite(u!.id, u!.email!, invite.token);
  return u!;
}

beforeAll(async () => {
  await runMigrations();
});

describe("documents", () => {
  it("lists transcripts and open-text questions across the project", async () => {
    const { docs } = await demo();
    const titles = docs.map((d) => d.title);
    expect(titles).toEqual(expect.arrayContaining(["Interview · P01", "Interview · P02", "Morning rush at Café Lumen", "Tell us about your perfect cup."]));
    // The upcoming interview has no transcript yet.
    expect(titles).not.toContain("Interview · P03");
    const open = docs.find((d) => d.title === "Tell us about your perfect cup.")!;
    expect(open.units).toBeGreaterThan(20);
  });
});

describe("demo coding", () => {
  it("seeds a small codebook, themes, codings and a pending suggestion", async () => {
    const { ws, project } = await demo({ seeded: true });
    const list = await listCodes(ws.id, project.id);
    expect(list.map((c) => c.path.join(" > "))).toEqual(expect.arrayContaining(["Ritual", "Ritual > Pause", "Ritual > Social", "Cutting down", "Cost", "Health & sleep"]));
    expect(list.every((c) => c.count >= 0)).toBe(true);
    expect(list.reduce((n, c) => n + c.count, 0)).toBeGreaterThan(5);
    const board = await listThemes(ws.id, project.id);
    expect(board.length).toBe(2);
    const pending = await db.select().from(codeApplications).where(and(eq(codeApplications.source, "ai"), isNull(codeApplications.approvedAt), inArray(codeApplications.codeId, list.map((c) => c.id))));
    expect(pending.length).toBe(1);
    expect((await listMemos(ws.id, project.id)).length).toBeGreaterThan(0);
  });
});

describe("codebook and coding", () => {
  it("codes passages, keeps them through edits, merges and splits", async () => {
    const { user, ws, project, interviews, docs } = await demo();
    const p = project.id;
    const ritual = await createCode(user.id, ws.id, p, { name: "Ritual", color: "3", definition: "Coffee as a repeated, meaningful act" });
    const pause = await createCode(user.id, ws.id, p, { name: "Pause", parentId: ritual.id });
    await expectCode(createCode(user.id, ws.id, p, { name: "pause", parentId: ritual.id }), "conflict");
    await expectCode(updateCode(user.id, ws.id, p, ritual.id, { name: "Ritual", parentId: pause.id }), "invalid");

    const maya = await loadDocument(ws.id, p, docs.find((d) => d.title === "Interview · P01")!.ref);
    const seg = maya.units.find((u) => u.text.includes("four minutes"))!;
    const start = seg.text.indexOf("that's the only four minutes");
    const coding = await applyCode(user.id, ws.id, p, { codeId: pause.id, unitKind: "segment", unitId: seg.id, start: start - 1, end: seg.text.length + 5 });
    expect(coding.quote.startsWith("that's the only four minutes")).toBe(true);
    // Same passage twice is a no-op.
    expect((await applyCode(user.id, ws.id, p, { codeId: pause.id, unitKind: "segment", unitId: seg.id, start: coding.start, end: coding.end })).id).toBe(coding.id);

    // Quote bank shows who said it.
    await setStarred(user.id, ws.id, p, coding.id, true);
    const quotes = await listQuotes(ws.id, p, { codeId: ritual.id });
    expect(quotes).toHaveLength(1);
    expect(quotes[0]).toMatchObject({ participantCode: "P01", starred: true, studyName: interviews.name });

    // Editing the transcript keeps the coding on its words.
    const sessionId = (maya.ref as { sessionId: string }).sessionId;
    await updateSegment(user.id, ws.id, interviews.id, sessionId, seg.id, { text: `Honestly, ${seg.text}`, speaker: (await getSessionDetail(ws.id, interviews.id, sessionId)).segments.find((s) => s.id === seg.id)!.speaker });
    const [moved] = await codingsForUnits(p, "segment", [seg.id]);
    expect(moved!.start).toBe(coding.start + "Honestly, ".length);

    // Merge "Pause" into a new "Quiet time" code, then split part of it back out.
    const quiet = await createCode(user.id, ws.id, p, { name: "Quiet time" });
    const other = maya.units.find((u) => u.text.includes("excuse for the pause"))!;
    await applyCode(user.id, ws.id, p, { codeId: pause.id, unitKind: "segment", unitId: other.id, start: 0, end: other.text.length });
    await mergeCodes(user.id, ws.id, p, [pause.id], quiet.id);
    expect((await listCodes(ws.id, p)).find((c) => c.id === quiet.id)!.count).toBe(2);
    const apps = await codeApplicationsOf(p, quiet.id);
    const split = await splitCode(user.id, ws.id, p, quiet.id, [apps[0]!.id], { name: "Excuse to pause", color: "5" });
    expect((await codeApplicationsOf(p, split.id)).length).toBe(1);

    // Deleting a parent lifts its children.
    const child = await createCode(user.id, ws.id, p, { name: "Weekend", parentId: ritual.id });
    await deleteCode(user.id, ws.id, p, ritual.id);
    expect((await listCodes(ws.id, p)).find((c) => c.id === child.id)!.parentId).toBeNull();
    await removeCoding(user.id, ws.id, p, apps[0]!.id);
  });

  it("checks roles and project boundaries", async () => {
    const a = await demo();
    const b = await demo();
    const viewer = await member(a.ws.id, a.user.id, "viewer");
    const analyst = await member(a.ws.id, a.user.id, "analyst");
    await expectCode(createCode(viewer.id, a.ws.id, a.project.id, { name: "X" }), "forbidden");
    const code = await createCode(analyst.id, a.ws.id, a.project.id, { name: "X" });
    // A unit from another workspace's project can't be coded here.
    const foreign = await loadDocument(b.ws.id, b.project.id, b.docs[0]!.ref);
    await expectCode(applyCode(analyst.id, a.ws.id, a.project.id, { codeId: code.id, unitKind: "segment", unitId: foreign.units[0]!.id, start: 0, end: 3 }), "notFound");
    // Analysts edit their own memos only.
    const mine = await createMemo(a.user.id, a.ws.id, a.project.id, { targetType: "code", targetId: code.id, body: "Owner's memo" });
    await expectCode(deleteMemo(analyst.id, a.ws.id, a.project.id, mine.id), "forbidden");
    await expectCode(createMemo(analyst.id, a.ws.id, a.project.id, { targetType: "code", targetId: "cod_missing", body: "x" }), "notFound");
    expect(await listMemos(a.ws.id, a.project.id, { targetType: "code", targetId: code.id })).toHaveLength(1);
  });
});

describe("codebook exchange", () => {
  it("imports a REFI codebook and exports it again", async () => {
    const { user, ws, project } = await demo();
    const xml = `<CodeBook xmlns="urn:QDA-XML:codebook:1.0"><Codes><Code guid="1" name="Barriers" isCodable="true" color="#E34948"><Description>What gets in the way</Description><Code guid="2" name="Time" isCodable="true"/><Code guid="3" name="Cost" isCodable="true"/></Code></Codes></CodeBook>`;
    expect(await importCodebook(user.id, ws.id, project.id, xml)).toEqual({ created: 3, total: 3 });
    // Importing again doesn't duplicate.
    expect(await importCodebook(user.id, ws.id, project.id, xml)).toEqual({ created: 0, total: 3 });
    const codes = await listCodes(ws.id, project.id);
    expect(codes.map((c) => c.path.join("/"))).toEqual(expect.arrayContaining(["Barriers", "Barriers/Time", "Barriers/Cost"]));
    expect(codes.find((c) => c.name === "Barriers")!.color).toBe("8");
    expect(await exportCodebook(ws.id, project.id)).toContain('name="Time"');
  });
});

describe("themes and search", () => {
  it("places codes on the board and searches across sources", async () => {
    const { user, ws, project, docs } = await demo();
    const p = project.id;
    const a = await createCode(user.id, ws.id, p, { name: "Habit" });
    const b = await createCode(user.id, ws.id, p, { name: "Price" });
    const theme = await createTheme(user.id, ws.id, p, { name: "Small rituals" });
    await placeCode(user.id, ws.id, p, a.id, theme.id, 0);
    await placeCode(user.id, ws.id, p, b.id, theme.id, 0);
    const placed = (await codesNow(ws.id, p)).filter((c) => c.themeId === theme.id).sort((x, y) => x.themePosition - y.themePosition);
    expect(placed.map((c) => c.name)).toEqual(["Price", "Habit"]);
    expect(await listThemes(ws.id, p)).toHaveLength(1);

    const res = await searchProject(ws.id, p, { q: "pour-over" });
    expect(res.hits.some((h) => h.kind === "segment" && h.who === "P01")).toBe(true);
    expect(res.hits.some((h) => h.kind === "answer")).toBe(true);
    const hit = res.hits[0]!;
    expect(hit.snippet.text.slice(hit.snippet.hits[0]!.start, hit.snippet.hits[0]!.end).toLowerCase()).toBe("pour-over");

    // Filter by code: only passages carrying it.
    const doc = await loadDocument(ws.id, p, docs.find((d) => d.title === "Interview · P02")!.ref);
    const u = doc.units.find((x) => x.text.includes("barista"))!;
    await applyCode(user.id, ws.id, p, { codeId: a.id, unitKind: "segment", unitId: u.id, start: 0, end: 10 });
    const coded = await searchProject(ws.id, p, { q: "", codeId: a.id });
    expect(coded.hits.map((h) => h.id)).toEqual([u.id]);
    expect(coded.hits[0]!.codeIds).toEqual([a.id]);
    expect((await searchProject(ws.id, p, { q: "pour-over -sunday" })).hits.length).toBeLessThan(res.hits.length);
  });
});

describe("assistant (built-in)", () => {
  it("suggests codings that need approval, clusters answers and drafts text", async () => {
    const { user, ws, project, survey, docs } = await demo();
    const p = project.id;
    const cost = await createCode(user.id, ws.id, p, { name: "Price", definition: "Mentions of cost, money or coffee being expensive" });
    const ref = docs.find((d) => d.title === "Interview · P01")!.ref;
    const res = await suggestForDocument(user.id, ws.id, p, ref);
    expect(res.created).toBeGreaterThanOrEqual(1);
    const doc = await loadDocument(ws.id, p, ref);
    const pending = (await codingsForUnits(p, "segment", doc.units.map((u) => u.id))).filter((c) => c.pending);
    expect(pending[0]).toMatchObject({ codeId: cost.id, pending: true });
    expect(pending.map((x) => x.quote).join(" ")).toMatch(/price|expensive/i);
    // Pending suggestions aren't quotes until accepted.
    expect(await listQuotes(ws.id, p, { codeId: cost.id })).toHaveLength(0);
    expect(await reviewSuggestions(user.id, ws.id, p, pending.map((x) => x.id), true)).toBe(pending.length);
    expect(await listQuotes(ws.id, p, { codeId: cost.id })).toHaveLength(pending.length);
    // Asking again doesn't duplicate.
    expect((await suggestForDocument(user.id, ws.id, p, ref)).created).toBe(0);

    const summary = await summarizeSession(user.id, ws.id, p, (ref as { sessionId: string }).sessionId);
    expect(summary.points.length).toBeGreaterThan(1);

    const q = docs.find((d) => d.title === "Tell us about your perfect cup.")!.ref as { studyId: string; questionId: string };
    expect(q.studyId).toBe(survey.id);
    const { clusters } = await clusterQuestion(user.id, ws.id, p, q.studyId, q.questionId);
    expect(clusters.length).toBeGreaterThan(1);
    const made = await createCodeFromCluster(user.id, ws.id, p, { code: { name: clusters[0]!.label.slice(0, 80) || "Cluster" }, answerIds: clusters[0]!.answerIds });
    expect(made.applied).toBe(clusters[0]!.answerIds.length);

    const theme = await createTheme(user.id, ws.id, p, { name: "Cost of the habit" });
    await placeCode(user.id, ws.id, p, cost.id, theme.id, 0);
    expect((await draftTheme(user.id, ws.id, p, theme.id)).text).toContain("Cost of the habit");
  });
});

describe("REFI-QDA project export", () => {
  it("exports sources with codings at the right positions", async () => {
    const { user, ws, project, docs } = await demo();
    const code = await createCode(user.id, ws.id, project.id, { name: "Sleep" });
    const doc = await loadDocument(ws.id, project.id, docs.find((d) => d.title === "Interview · P01")!.ref);
    const u = doc.units.find((x) => x.text.includes("smartwatch"))!;
    const s = u.text.indexOf("smartwatch");
    await applyCode(user.id, ws.id, project.id, { codeId: code.id, unitKind: "segment", unitId: u.id, start: s, end: s + "smartwatch".length });
    await createMemo(user.id, ws.id, project.id, { targetType: "project", body: "Sleep comes up a lot." });
    const files = unzipSync(await buildProjectQdpx(ws.id, project.id, { projectName: "Coffee", userName: "Cora" }));
    const qde = strFromU8(files["project.qde"]!);
    expect(qde).toContain('name="Sleep"');
    expect(qde).toContain("Sleep comes up a lot.");
    expect(qde).toMatch(/<Case guid="[^"]+" name="P01">/);
    // Find the source holding the selection and check its text.
    const sel = qde.match(/<TextSource guid="[^"]+" name="([^"]+)" plainTextPath="internal:\/\/([^"]+)"[^>]*>(?:(?!<\/TextSource>)[\s\S])*?startPosition="(\d+)" endPosition="(\d+)"/);
    expect(sel).toBeTruthy();
    const text = Array.from(strFromU8(files[`sources/${sel![2]}`]!).replace(/^﻿/, ""));
    expect(text.slice(Number(sel![3]), Number(sel![4])).join("")).toBe("smartwatch");
  });
});
