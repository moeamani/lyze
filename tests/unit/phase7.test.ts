import { beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { runMigrations } from "@/server/db/migrations";
import { forms, projects, researchSessions, responses, studies, transcripts, users } from "@/server/db/schema";
import { createWorkspace } from "@/server/services/workspaces";
import { createStudy } from "@/server/services/studies";
import { getGuide } from "@/server/services/guides";
import { listCodes } from "@/server/services/codebook";
import { startResponse } from "@/server/services/respondent";
import * as create from "@/server/services/create";
import { generateSampleTranscript } from "@/server/services/sessions";
import { generateReport, getReportByToken, reportMarkdown, resolveReport, setReportShared } from "@/server/services/reports";
import { FORM_CSV_EXAMPLE, buildForm, draftFormRows, parseFormCsv, toRespondent } from "@/lib/create/form";
import { CODEBOOK_CSV_EXAMPLE, GUIDE_CSV_EXAMPLE, parseCodebookCsv, parseGuideCsv } from "@/lib/create/misc";
import { fakeAnswers, parseResponsesCsv, responsesCsvExample, seeded } from "@/lib/create/responses";
import { validateAnswer } from "@/lib/forms/answers";
import { allQuestions } from "@/lib/forms/doc";
import { proseIssues } from "@/lib/writeup/style";
import { newId } from "@/lib/ids";

beforeAll(async () => {
  await runMigrations();
});

describe("CSV formats and generators", () => {
  it("reads the questionnaire example and builds pages", () => {
    const { rows, errors } = parseFormCsv(FORM_CSV_EXAMPLE);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(9);
    const doc = buildForm("Coffee", rows);
    expect(doc.pages.map((p) => p.title)).toEqual(["About you", "Your mornings", "In your words"]);
    const qs = allQuestions(doc);
    expect(qs.find((q) => q.type === "number")!.config).toMatchObject({ min: 0, max: 15 });
    expect(parseFormCsv("question,type\nHi,single_choice\n").errors[0]!.message).toBe("needsOptions");
  });

  it("drafts respondent-facing questions from a brief", () => {
    expect(toRespondent("Why do people try to cut down?")).toBe("Why do you try to cut down?");
    const rows = draftFormRows({ questions: [{ text: "What role does coffee play in people's day?" }], statements: [{ text: "The pause matters more than caffeine." }] });
    expect(rows.map((r) => r.type)).toEqual(["likert", "long_text", "single_choice"]);
    expect(rows[1]!.question).toBe("What role does coffee play in your day?");
  });

  it("reads guides and codebooks", () => {
    const g = parseGuideCsv(GUIDE_CSV_EXAMPLE);
    expect(g.guide.sections.map((s) => s.title)).toEqual(["Warm-up", "Coffee routine", "Cutting down", "Wrap-up"]);
    expect(g.guide.sections[1]!.questions).toHaveLength(2);
    expect(parseCodebookCsv(CODEBOOK_CSV_EXAMPLE).rows.filter((r) => r.parent === "Ritual")).toHaveLength(2);
  });

  it("fakes valid answers and round-trips the responses template", () => {
    const qs = allQuestions(buildForm("x", parseFormCsv(FORM_CSV_EXAMPLE).rows));
    const a = fakeAnswers(qs, seeded(1));
    for (const q of qs) if (a[q.id] !== undefined) expect(validateAnswer(q, a[q.id], false).ok).toBe(true);
    expect(Object.keys(a).length).toBeGreaterThan(5);
    expect(fakeAnswers(qs, seeded(5))).toEqual(fakeAnswers(qs, seeded(5)));
    const parsed = parseResponsesCsv(responsesCsvExample(qs), qs);
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.unmatched).toEqual([]);
  });
});

async function demo() {
  const [user] = await db.insert(users).values({ name: "Gen Tester", email: `gen-${newId("t")}@example.com` }).returning();
  const ws = await createWorkspace(user!.id, { name: "Gen Lab", withDemo: true });
  const [project] = await db.select().from(projects).where(eq(projects.workspaceId, ws.id));
  const [survey] = await db.select().from(studies).where(and(eq(studies.workspaceId, ws.id), eq(studies.type, "survey")));
  const [interviews] = await db.select().from(studies).where(and(eq(studies.workspaceId, ws.id), eq(studies.type, "interview")));
  return { user: user!, ws, project: project!, survey: survey!, interviews: interviews! };
}

describe("generate, upload, enter manually", () => {
  it("creates questionnaires and guides from the brief or a CSV", async () => {
    const { user, ws, project, interviews } = await demo();
    const a = await createStudy(user.id, ws.id, project.id, { name: "Follow-up survey", type: "survey" });
    const g = await create.generateQuestionnaire(user.id, ws.id, a.id);
    expect(g.questions).toBe(3 + 3 + 1);
    const b = await createStudy(user.id, ws.id, project.id, { name: "Imported survey", type: "survey" });
    expect((await create.importQuestionnaire(user.id, ws.id, b.id, FORM_CSV_EXAMPLE)).questions).toBe(9);
    await create.generateGuide(user.id, ws.id, interviews.id);
    expect((await getGuide(ws.id, interviews.id)).doc.sections.map((s) => s.title)).toEqual(["Warm-up", "RQ1", "RQ2", "RQ3", "Reactions", "Wrap-up"]);
  });

  it("adds generated, imported and manual responses, and removes test data", async () => {
    const { user, ws, survey } = await demo();
    expect((await create.generateResponses(user.id, ws.id, survey.id, 25)).count).toBe(25);
    const csv = await create.responsesTemplate(ws.id, survey.id);
    expect((await create.importResponses(user.id, ws.id, survey.id, csv)).count).toBe(2);
    const [form] = await db.select().from(forms).where(eq(forms.studyId, survey.id));
    const state = await startResponse(form!.publicId, { enteredBy: user.id, deviceId: "x" });
    const [manual] = await db.select().from(responses).where(eq(responses.resumeToken, state.token));
    expect(manual!.source).toBe("manual");
    expect(await create.sourceCounts(ws.id, survey.id)).toMatchObject({ generated: 25, import: 2, manual: 1 });
    expect((await create.deleteGeneratedResponses(user.id, ws.id, survey.id)).count).toBe(25);
  });

  it("generates participants, a codebook and a sample transcript", async () => {
    const { user, ws, project, interviews } = await demo();
    expect((await create.generateParticipants(user.id, ws.id, interviews.id, 5)).created).toBe(5);
    const before = (await listCodes(ws.id, project.id)).length;
    const r = await create.generateCodebook(user.id, ws.id, project.id);
    expect((await listCodes(ws.id, project.id)).length).toBe(before + r.created);
    expect(r.created).toBeGreaterThan(0);
    const [p03] = await db.select().from(researchSessions).where(and(eq(researchSessions.studyId, interviews.id), eq(researchSessions.title, "Interview · P03")));
    expect((await generateSampleTranscript(user.id, ws.id, interviews.id, p03!.id)).segments).toBeGreaterThan(5);
    const [t] = await db.select().from(transcripts).where(eq(transcripts.sessionId, p03!.id));
    expect(t!.provider).toBe("generated");
  });
});

describe("reports", () => {
  it("generates a report, resolves live data, shares and exports it", async () => {
    const { user, ws, project } = await demo();
    const report = await generateReport(user.id, ws.id, project.id);
    const types = report.blocks.map((b) => b.type);
    expect(types).toEqual(expect.arrayContaining(["heading", "text", "question", "joint", "theme", "quote"]));
    const data = await resolveReport(ws.id, project.id, report.blocks);
    for (const b of report.blocks) {
      if (b.type === "question") expect(data.questions[b.id]).toBeDefined();
      if (b.type === "quote") expect(data.quotes[b.id]).toBeDefined();
      if (b.type === "theme") expect(data.themes[b.id]).toBeDefined();
    }
    const md = reportMarkdown(report.title, report.blocks, data);
    expect(md).toContain(`# ${report.title}`);
    expect(proseIssues(md).filter((x) => x === "dash")).toEqual([]);

    const token = await setReportShared(user.id, ws.id, project.id, report.id, true);
    expect((await getReportByToken(token!))!.report.id).toBe(report.id);
    await setReportShared(user.id, ws.id, project.id, report.id, false);
    expect(await getReportByToken(token!)).toBeNull();
  });
});
