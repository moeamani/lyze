import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { projects, reports, studies, writeups } from "@/server/db/schema";
import { newToken } from "@/lib/ids";
import { blocksSchema, newBlockId, type Block } from "@/lib/reports/blocks";
import { summarizeQuestion, type QuestionSummary } from "@/lib/analysis/summary";
import { cleanProse } from "@/lib/writeup/style";
import type { QuestionType } from "@/lib/forms/schema";
import { requireWorkspace } from "./access";
import { recordAudit } from "./audit";
import { AppError } from "./errors";
import { getProject } from "./projects";
import { loadStudyDataset } from "./analysis";
import { listCodes } from "./codebook";
import { listQuotes } from "./coding";
import { listThemes } from "./themes";
import { jointDisplay, type JointRow } from "./mixed";
import { getBrief, listWriteups } from "./writeup";

export async function listReports(workspaceId: string, projectId: string) {
  return db
    .select({ id: reports.id, title: reports.title, shareToken: reports.shareToken, updatedAt: reports.updatedAt, blocks: reports.blocks })
    .from(reports)
    .where(and(eq(reports.workspaceId, workspaceId), eq(reports.projectId, projectId)))
    .orderBy(desc(reports.updatedAt));
}

export async function getReport(workspaceId: string, projectId: string, id: string) {
  const [row] = await db.select().from(reports).where(and(eq(reports.id, id), eq(reports.workspaceId, workspaceId), eq(reports.projectId, projectId))).limit(1);
  if (!row) throw new AppError("notFound");
  return row;
}

const titleSchema = z.string().trim().min(1).max(200);

export async function createReport(userId: string, workspaceId: string, projectId: string, raw: { title: string; blocks?: Block[] }) {
  await requireWorkspace(userId, workspaceId, "content:analyze");
  await getProject(workspaceId, projectId);
  const [row] = await db
    .insert(reports)
    .values({ workspaceId, projectId, title: titleSchema.parse(raw.title), blocks: blocksSchema.parse(raw.blocks ?? []), createdById: userId })
    .returning();
  await recordAudit(db, { workspaceId, actorId: userId, action: "report.created", entityType: "report", entityId: row!.id, metadata: { name: row!.title } });
  return row!;
}

export async function updateReport(userId: string, workspaceId: string, projectId: string, id: string, raw: { title: string; blocks: unknown }) {
  await requireWorkspace(userId, workspaceId, "content:analyze");
  await getReport(workspaceId, projectId, id);
  const blocks = blocksSchema.parse(raw.blocks).map((b) => (b.type === "text" ? { ...b, text: cleanProse(b.text) } : b));
  await db.update(reports).set({ title: titleSchema.parse(raw.title), blocks }).where(eq(reports.id, id));
}

export async function deleteReport(userId: string, workspaceId: string, projectId: string, id: string) {
  await requireWorkspace(userId, workspaceId, "content:analyze");
  await getReport(workspaceId, projectId, id);
  await db.delete(reports).where(eq(reports.id, id));
}

/** Turn the public link on (new token) or off. Turning it off and on again gives a new link. */
export async function setReportShared(userId: string, workspaceId: string, projectId: string, id: string, shared: boolean) {
  await requireWorkspace(userId, workspaceId, "content:analyze");
  const report = await getReport(workspaceId, projectId, id);
  const token = shared ? (report.shareToken ?? newToken()) : null;
  await db.update(reports).set({ shareToken: token }).where(eq(reports.id, id));
  await recordAudit(db, { workspaceId, actorId: userId, action: shared ? "report.shared" : "report.unshared", entityType: "report", entityId: id, metadata: { name: report.title } });
  return token;
}

export async function getReportByToken(token: string) {
  if (!token || token.length < 16) return null;
  const [row] = await db
    .select({ report: reports, projectName: projects.name })
    .from(reports)
    .innerJoin(projects, eq(projects.id, reports.projectId))
    .where(eq(reports.shareToken, token))
    .limit(1);
  return row ?? null;
}

// ── Resolving blocks to data ────────────────────────────────────────────────

export type ResolvedQuestion = { number: number; title: string; type: QuestionType; dataKind: "quant" | "qual"; summary: QuestionSummary; study: string };
export type ResolvedReport = {
  questions: Record<string, ResolvedQuestion>;
  quotes: Record<string, { text: string; who: string | null; codes: { name: string; color: string }[]; source: string }>;
  themes: Record<string, { name: string; description: string | null; codes: { name: string; color: string; count: number }[] }>;
  joint: { rows: JointRow[]; respondents: number; sessions: number } | null;
  writeups: Record<string, { title: string; body: string }>;
};

/** Everything the blocks point at, read fresh, so a report always shows current data. */
export async function resolveReport(workspaceId: string, projectId: string, blocks: readonly Block[]): Promise<ResolvedReport> {
  const out: ResolvedReport = { questions: {}, quotes: {}, themes: {}, joint: null, writeups: {} };
  const studyIds = [...new Set(blocks.flatMap((b) => (b.type === "question" ? [b.studyId] : [])))];
  const studyRows = studyIds.length ? await db.select({ id: studies.id, name: studies.name }).from(studies).where(and(eq(studies.projectId, projectId), eq(studies.workspaceId, workspaceId))) : [];
  for (const s of studyRows.filter((s) => studyIds.includes(s.id))) {
    const data = await loadStudyDataset(workspaceId, s.id);
    for (const b of blocks) {
      if (b.type !== "question" || b.studyId !== s.id) continue;
      const entry = data.questions.get(b.questionId);
      if (entry) out.questions[b.id] = { number: entry.number, title: entry.question.title, type: entry.question.type, dataKind: entry.question.dataKind, summary: summarizeQuestion(entry.question, entry.number, data.rows), study: s.name };
    }
  }
  const needCodes = blocks.some((b) => b.type === "quote" || b.type === "theme");
  const codes = needCodes ? await listCodes(workspaceId, projectId) : [];
  const codeById = new Map(codes.map((c) => [c.id, c]));
  if (blocks.some((b) => b.type === "quote")) {
    const quotes = await listQuotes(workspaceId, projectId, {});
    const byId = new Map(quotes.map((q) => [q.id, q]));
    for (const b of blocks) {
      if (b.type !== "quote") continue;
      const q = byId.get(b.codingId);
      if (q)
        out.quotes[b.id] = {
          text: q.quote,
          who: q.participantCode ?? q.speaker,
          codes: q.codeIds.flatMap((id) => (codeById.get(id) ? [{ name: codeById.get(id)!.name, color: codeById.get(id)!.color }] : [])),
          source: q.studyName,
        };
    }
  }
  if (blocks.some((b) => b.type === "theme")) {
    const themes = new Map((await listThemes(workspaceId, projectId)).map((t) => [t.id, t]));
    for (const b of blocks) {
      if (b.type !== "theme") continue;
      const t = themes.get(b.themeId);
      if (t) out.themes[b.id] = { name: t.name, description: t.description, codes: codes.filter((c) => c.themeId === t.id).map((c) => ({ name: c.name, color: c.color, count: c.count })) };
    }
  }
  if (blocks.some((b) => b.type === "joint")) out.joint = await jointDisplay(workspaceId, projectId);
  for (const b of blocks) {
    if (b.type !== "writeup") continue;
    const [w] = await db.select({ title: writeups.title, body: writeups.body }).from(writeups).where(and(eq(writeups.id, b.writeupId), eq(writeups.projectId, projectId))).limit(1);
    if (w) out.writeups[b.id] = w;
  }
  return out;
}

/** What can be added to a report: survey questions, starred quotes, themes, write-ups. */
export async function reportSources(workspaceId: string, projectId: string) {
  const studyRows = await db.select({ id: studies.id, name: studies.name }).from(studies).where(and(eq(studies.projectId, projectId), eq(studies.workspaceId, workspaceId)));
  const questions: { studyId: string; study: string; questionId: string; title: string }[] = [];
  for (const s of studyRows) {
    const data = await loadStudyDataset(workspaceId, s.id);
    for (const { question } of data.questions.values()) if (!["file_upload", "media"].includes(question.type)) questions.push({ studyId: s.id, study: s.name, questionId: question.id, title: question.title });
  }
  const [quotes, themes, ws] = await Promise.all([listQuotes(workspaceId, projectId, {}), listThemes(workspaceId, projectId), listWriteups(workspaceId, projectId)]);
  return {
    questions,
    quotes: quotes.slice(0, 200).map((q) => ({ id: q.id, text: q.quote, who: q.participantCode, starred: q.starred })),
    themes: themes.map((t) => ({ id: t.id, name: t.name })),
    writeups: ws.map((w) => ({ id: w.id, title: w.title })),
  };
}

/**
 * The generated report: brief, key survey charts, the joint display, each theme with its best
 * quotes, and the latest written analysis. A first draft to rearrange and trim.
 */
export async function generateReport(userId: string, workspaceId: string, projectId: string) {
  await requireWorkspace(userId, workspaceId, "content:analyze");
  const project = await getProject(workspaceId, projectId);
  const [brief, sources, codes] = await Promise.all([getBrief(workspaceId, projectId), reportSources(workspaceId, projectId), listCodes(workspaceId, projectId)]);
  const blocks: Block[] = [];
  type NewBlock = Block extends infer B ? (B extends Block ? Omit<B, "id"> : never) : never;
  const add = (b: NewBlock) => blocks.push({ id: newBlockId(), ...b } as Block);
  if (brief.aim || brief.questions.length) {
    add({ type: "heading", text: "What we set out to learn" });
    add({ type: "text", text: cleanProse([brief.aim, ...brief.questions.map((q, i) => `${i + 1}. ${q.text}`)].filter(Boolean).join("\n\n")) });
  }
  const closed = sources.questions.filter((_, i) => i < 40);
  if (closed.length) {
    add({ type: "heading", text: "Survey results" });
    for (const q of closed.slice(0, 6)) add({ type: "question", studyId: q.studyId, questionId: q.questionId, note: "" });
  }
  if (codes.some((c) => c.count > 0)) {
    add({ type: "heading", text: "Conversations and survey side by side" });
    add({ type: "joint" });
  }
  if (sources.themes.length) {
    add({ type: "heading", text: "Themes" });
    const quotes = await listQuotes(workspaceId, projectId, {});
    for (const t of sources.themes) {
      add({ type: "theme", themeId: t.id });
      const themeCodes = new Set(codes.filter((c) => c.themeId === t.id).map((c) => c.id));
      const best = quotes.filter((q) => q.codeIds.some((id) => themeCodes.has(id))).sort((a, b) => Number(b.starred) - Number(a.starred)).slice(0, 2);
      for (const q of best) add({ type: "quote", codingId: q.id });
    }
  }
  if (sources.writeups[0]) {
    add({ type: "heading", text: "Written analysis" });
    add({ type: "writeup", writeupId: sources.writeups[0].id });
  }
  return createReport(userId, workspaceId, projectId, { title: `${project.name}: report`, blocks });
}

/** A report as Markdown, for pasting into a thesis chapter or a document editor. */
export function reportMarkdown(title: string, blocks: readonly Block[], data: ResolvedReport): string {
  const out: string[] = [`# ${title}`];
  for (const b of blocks) {
    if (b.type === "heading") out.push(`## ${b.text}`);
    else if (b.type === "text") out.push(b.text);
    else if (b.type === "question") {
      const q = data.questions[b.id];
      if (!q) continue;
      out.push(`### Q${q.number}. ${q.title}`);
      const s = q.summary;
      if ((s.kind === "choice" || s.kind === "multi") && s.categories.length) out.push(["| Answer | n | % |", "| --- | --- | --- |", ...s.categories.map((c) => `| ${c.label} | ${c.count} | ${Math.round(c.percent)}% |`)].join("\n"));
      else if (s.kind === "scale" && s.stats.mean !== null) out.push(`Mean ${s.stats.mean.toFixed(2)}${s.stats.sd !== null ? `, SD ${s.stats.sd.toFixed(2)}` : ""}, n = ${s.answered}.`);
      else if (s.kind === "text") out.push(`${s.answered} answers. Most used words: ${s.words.slice(0, 8).map((w) => w.word).join(", ")}.`);
      if (b.note) out.push(b.note);
    } else if (b.type === "quote" && data.quotes[b.id]) out.push(`> "${data.quotes[b.id]!.text}"${data.quotes[b.id]!.who ? ` (${data.quotes[b.id]!.who})` : ""}`);
    else if (b.type === "theme" && data.themes[b.id]) {
      const t = data.themes[b.id]!;
      out.push(`### ${t.name}`, ...(t.description ? [t.description] : []), `Codes: ${t.codes.map((c) => `${c.name} (${c.count})`).join(", ")}.`);
    } else if (b.type === "joint" && data.joint)
      out.push(["| Code | Conversations | Survey | Found in |", "| --- | --- | --- | --- |", ...data.joint.rows.filter((r) => r.convergence).map((r) => `| ${r.name} | ${r.qual.passages} passages, ${r.qual.people} people | ${Math.round(r.quant.share * 100)}% of respondents | ${r.convergence} |`)].join("\n"));
    else if (b.type === "writeup" && data.writeups[b.id]) out.push(data.writeups[b.id]!.body);
  }
  return cleanProse(out.join("\n\n")) + "\n";
}
