import fs from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { runMigrations } from "@/server/db/migrations";
import { users } from "@/server/db/schema";
import { createWorkspace } from "@/server/services/workspaces";
import { createProject } from "@/server/services/projects";
import { attachProposal, buildContext, generateWriteup, getBrief } from "@/server/services/writeup";
import { pdfText } from "@/lib/writeup/pdf";
import { applyExtracted, extractBrief } from "@/lib/writeup/brief-extract";
import { composeArticle, midpointTest } from "@/lib/writeup/article";
import { proseIssues } from "@/lib/writeup/style";
import { newId } from "@/lib/ids";

const pdf = () => new Uint8Array(fs.readFileSync("tests/fixtures/proposal.pdf"));

beforeAll(async () => {
  await runMigrations();
});

describe("reading a proposal", () => {
  it("extracts text from a PDF and finds the aim, questions and hypotheses", () => {
    const text = pdfText(pdf());
    expect(text).toContain("The aim of this study is to understand");
    expect(text).not.toMatch(/Cof fee/);
    const b = extractBrief(text);
    expect(b.aim).toMatch(/^The aim of this study is/);
    expect(b.questions).toEqual([
      "What role does the morning coffee ritual play in people's day?",
      "Why do people try to cut down, and what helps them stick to it?",
      "How much does price shape where and how often people buy coffee?",
    ]);
    expect(b.statements.map((s) => s.kind)).toEqual(["hypothesis", "hypothesis", "assumption"]);
  });

  it("understands unlabelled sections and stock phrases, and merges without duplicates", () => {
    const b = extractBrief("A study of dropout\n\n1.2 Purpose of the study\nThis research seeks to explain why students drop out of online courses.\n\n1.3 Research Questions\n1. How do students describe their reasons for leaving?\n\n1.4 Hypotheses\nWorkload is positively associated with dropout.\nH0: there is no effect.\nIt is expected that peer support lowers dropout.");
    expect(b.questions).toEqual(["How do students describe their reasons for leaving?"]);
    expect(b.statements.map((s) => s.text)).toEqual(["Workload is positively associated with dropout.", "Peer support lowers dropout."]);
    const applied = applyExtracted({ aim: "", questions: [{ id: "a", text: "How do students describe their reasons for leaving?" }, { id: "b", text: "An old question?" }], statements: [] }, b, () => newId("x"));
    expect(applied.questions).toEqual([{ id: "a", text: "How do students describe their reasons for leaving?" }]);
    expect(applied.statements).toHaveLength(2);
  });

  it("fills an empty brief from an uploaded PDF", async () => {
    const [u] = await db.insert(users).values({ name: "P", email: `p-${newId("t")}@example.com` }).returning();
    const ws = await createWorkspace(u!.id, { name: "Thesis Lab", withDemo: false });
    const project = await createProject(u!.id, ws.id, { name: "Thesis", color: "violet" });
    const file = new File([pdf()], "proposal.pdf", { type: "application/pdf" });
    const r = await attachProposal(u!.id, ws.id, project.id, file);
    expect(r).toMatchObject({ readable: true, found: { aim: true, questions: 3, statements: 3 } });
    // A second upload of the same file replaces rather than doubles the brief.
    await attachProposal(u!.id, ws.id, project.id, new File([pdf()], "proposal.pdf", { type: "application/pdf" }));
    const brief = await getBrief(ws.id, project.id);
    expect(brief.questions).toHaveLength(3);
    expect(brief.proposalText).toContain("Research questions");
  });
});

describe("finding only the real research questions", () => {
  it("ignores rhetorical, reviewed, restated and appendix questions", () => {
    const thesis = `Remote Work and Loneliness Among Junior Staff
A thesis submitted for the degree of Master of Science

Chapter 1. Introduction
Why do so many new graduates feel alone at work? Since 2020, remote work has become common. Is the office still needed? This thesis examines loneliness among junior staff who mostly work from home.

1.1 Purpose of the study
The purpose of this study is to examine how remote work relates to loneliness among junior employees and which practices reduce it.

1.2 Research questions
This study addresses the following questions:
RQ1: How do junior employees describe their experience of loneliness when working remotely?
RQ2: To what extent is the number of remote days per week associated with loneliness?
RQ3: Which team practices do junior employees see as reducing isolation?

1.3 Hypotheses
H1: More remote days per week are associated with higher loneliness scores.
H2: Regular one-to-one meetings with a manager are associated with lower loneliness.

Chapter 2. Literature review
Earlier work asked whether loneliness predicts turnover? Smith (2019) wondered how onboarding shapes belonging? We expect that the review will show mixed findings.

Chapter 3. Methodology
Participants were asked questions such as: How many days did you work from home last week?
H3: This is a numbered item in a method table and not a hypothesis.

Chapter 5. Discussion
RQ1: How do junior staff experience loneliness when they work remotely?
Turning to RQ2, the association was moderate.

References
Smith, J. (2019). What makes people stay? Journal of Work, 4(2), 1 to 20.

Appendix A. Questionnaire
Q1. How old are you?
Q2. How many days per week do you work remotely?
Q3. How lonely do you feel at work?`;
    const b = extractBrief(thesis);
    expect(b.title).toBe("Remote Work and Loneliness Among Junior Staff");
    expect(b.aim).toMatch(/^The purpose of this study is to examine/);
    expect(b.questions).toEqual([
      "How do junior employees describe their experience of loneliness when working remotely?",
      "To what extent is the number of remote days per week associated with loneliness?",
      "Which team practices do junior employees see as reducing isolation?",
    ]);
    expect(b.statements.map((s) => s.text)).toEqual([
      "More remote days per week are associated with higher loneliness scores.",
      "Regular one-to-one meetings with a manager are associated with lower loneliness.",
    ]);
  });

  it("uses a section's questions when nothing is labelled, and the introduction only as a last resort", () => {
    const sectioned = extractBrief("Title here\n\nResearch questions\nThe study asks two questions.\n1. How do nurses decide when to escalate care?\n2. What gets in the way of escalation?\n\nMethod\nInterviews will ask: What did you do next?");
    expect(sectioned.questions).toEqual(["How do nurses decide when to escalate care?", "What gets in the way of escalation?"]);
    const intro = extractBrief("A short proposal\n\nIntroduction\nHow do small farms adopt drip irrigation in dry regions? Would you buy it? We look at three villages.\n\nMethods\nWhat did farmers pay for their first system?");
    expect(intro.questions).toEqual(["How do small farms adopt drip irrigation in dry regions?"]);
  });
});

describe("article-style analysis", () => {
  it("tests a hypothesis against the scale midpoint", () => {
    const r = midpointTest({ mean: 3.3, sd: 0.81, n: 33, bounds: [1, 5] })!;
    expect(r.mid).toBe(3);
    expect(r.t).toBeCloseTo(2.128, 2);
    expect(r.df).toBe(32);
    expect(r.p).toBeCloseTo(0.041, 2);
    expect(r.d).toBeCloseTo(0.37, 2);
  });

  it("writes a results section from the demo project in plain academic prose", async () => {
    const [u] = await db.insert(users).values({ name: "A", email: `a-${newId("t")}@example.com` }).returning();
    const ws = await createWorkspace(u!.id, { name: "Article Lab", withDemo: true });
    const [p] = await db.select().from((await import("@/server/db/schema")).projects).where(eq((await import("@/server/db/schema")).projects.workspaceId, ws.id));
    const ctx = await buildContext(ws.id, p!.id);
    // A statement the survey measures directly gets a t-test.
    ctx.statements.push({ id: "x", kind: "hypothesis", text: "Coffee helps people focus." });
    const { body } = composeArticle(ctx);
    for (const h of ["## Data analysis", "### Sample", "### Survey results", "**Table 1.**", "### Qualitative findings", "### Hypotheses", "### Research questions"]) expect(body).toContain(h);
    expect(body).toMatch(/Of the 48 people who started the survey, 45 completed it/);
    expect(body).toMatch(/t\(32\) = 2\.\d\d, p = \.0\d\d, d = 0\.\d\d/);
    expect(body).toContain('"that\'s the only four minutes in the day that are mine"');
    expect(proseIssues(body)).toEqual([]);
    const w = await generateWriteup(u!.id, ws.id, p!.id);
    expect(w.title).toBe("Coffee habits (demo): data analysis and results");
  }, 60_000);
});
