import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { files, researchSessions, projectBriefs, studies, writeups, type ProjectBrief } from "@/server/db/schema";
import { newId } from "@/lib/ids";
import { summarizeQuestion } from "@/lib/analysis/summary";
import type { WriteupContext } from "@/lib/writeup/context";
import { PROPOSAL_MAX_BYTES, PROPOSAL_TYPES, proposalText } from "@/lib/writeup/extract";
import { cleanProse } from "@/lib/writeup/style";
import { assistProvider } from "@/server/ai";
import { storage, storageFor } from "@/server/storage";
import { requireWorkspace } from "./access";
import { recordAudit } from "./audit";
import { AppError } from "./errors";
import { getProject } from "./projects";
import { loadStudyDataset } from "./analysis";
import { listCodes } from "./codebook";
import { listQuotes } from "./coding";
import { listThemes } from "./themes";
import { listMemos } from "./memos";
import { jointDisplay } from "./mixed";

// ── Brief: aim, research questions, statements, proposal ─────────────────────

const item = z.string().trim().min(1).max(600);
export const briefSchema = z.object({
  aim: z.string().trim().max(4000).default(""),
  questions: z.array(z.object({ id: z.string().max(40).optional(), text: item })).max(20).default([]),
  statements: z.array(z.object({ id: z.string().max(40).optional(), text: item, kind: z.enum(["hypothesis", "proposition", "assumption"]).default("hypothesis") })).max(30).default([]),
});
export type BriefInput = z.input<typeof briefSchema>;

const EMPTY = (projectId: string, workspaceId: string): ProjectBrief => ({
  projectId,
  workspaceId,
  aim: "",
  questions: [],
  statements: [],
  proposalFileId: null,
  proposalName: null,
  proposalText: null,
  updatedAt: new Date(0),
});

export async function getBrief(workspaceId: string, projectId: string): Promise<ProjectBrief> {
  await getProject(workspaceId, projectId);
  const [row] = await db.select().from(projectBriefs).where(eq(projectBriefs.projectId, projectId)).limit(1);
  return row ?? EMPTY(projectId, workspaceId);
}

export async function saveBrief(userId: string, workspaceId: string, projectId: string, raw: BriefInput) {
  await requireWorkspace(userId, workspaceId, "content:edit");
  await getProject(workspaceId, projectId);
  const input = briefSchema.parse(raw);
  const values = {
    aim: input.aim,
    questions: input.questions.map((q) => ({ id: q.id || newId("rq"), text: q.text })),
    statements: input.statements.map((s) => ({ id: s.id || newId("st"), text: s.text, kind: s.kind })),
  };
  await db
    .insert(projectBriefs)
    .values({ projectId, workspaceId, ...values })
    .onConflictDoUpdate({ target: projectBriefs.projectId, set: { ...values, updatedAt: new Date() } });
  await recordAudit(db, { workspaceId, actorId: userId, action: "brief.updated", entityType: "brief", entityId: projectId, metadata: { questions: values.questions.length } });
}

export async function attachProposal(userId: string, workspaceId: string, projectId: string, file: File) {
  await requireWorkspace(userId, workspaceId, "content:edit");
  await getProject(workspaceId, projectId);
  const mime = file.type || (file.name.endsWith(".md") ? "text/markdown" : "");
  const kind = PROPOSAL_TYPES[mime] ?? (file.name.toLowerCase().endsWith(".md") ? "md" : null);
  if (!kind) throw new AppError("invalid");
  if (file.size > PROPOSAL_MAX_BYTES) throw new AppError("invalid");
  const data = new Uint8Array(await file.arrayBuffer());
  const text = proposalText(kind, data);
  const store = storage();
  const id = newId("fil");
  const key = `${workspaceId}/projects/${projectId}/${id}-${file.name.replace(/[^\w.-]+/g, "_").slice(0, 80)}`;
  await store.put(key, data, mime || "application/octet-stream");
  await db.insert(files).values({ id, workspaceId, storage: store.name, key, name: file.name.slice(0, 200), mime: mime || "application/octet-stream", size: file.size, uploadedById: userId });
  const brief = await getBrief(workspaceId, projectId);
  await db
    .insert(projectBriefs)
    .values({ projectId, workspaceId, proposalFileId: id, proposalName: file.name.slice(0, 200), proposalText: text })
    .onConflictDoUpdate({ target: projectBriefs.projectId, set: { proposalFileId: id, proposalName: file.name.slice(0, 200), proposalText: text, updatedAt: new Date() } });
  if (brief.proposalFileId) await removeFile(brief.proposalFileId);
  return { name: file.name, readable: text !== null };
}

async function removeFile(fileId: string) {
  const [old] = await db.delete(files).where(eq(files.id, fileId)).returning();
  if (old) await storageFor(old.storage).delete(old.key).catch(() => undefined);
}

export async function removeProposal(userId: string, workspaceId: string, projectId: string) {
  await requireWorkspace(userId, workspaceId, "content:edit");
  const brief = await getBrief(workspaceId, projectId);
  await db.update(projectBriefs).set({ proposalFileId: null, proposalName: null, proposalText: null }).where(eq(projectBriefs.projectId, projectId));
  if (brief.proposalFileId) await removeFile(brief.proposalFileId);
}

// ── Context for writers ───────────────────────────────────────────────────────

function describe(s: ReturnType<typeof summarizeQuestion>): string | null {
  const pc = (x: number) => `${Math.round(x)}%`;
  if (s.kind === "choice" && s.answered) return `${s.categories.slice(0, 3).map((c) => `${pc(c.percent)} ${c.label}`).join(", ")} (n = ${s.answered})`;
  if (s.kind === "multi" && s.answered) return `${s.categories.slice(0, 3).map((c) => `${pc(c.percent)} chose ${c.label}`).join(", ")} (n = ${s.answered})`;
  if (s.kind === "scale" && s.answered && s.stats.mean !== null) return `mean ${s.stats.mean.toFixed(1)}${s.stats.sd !== null ? `, SD ${s.stats.sd.toFixed(1)}` : ""} (n = ${s.answered})`;
  return null;
}

export async function buildContext(workspaceId: string, projectId: string): Promise<WriteupContext> {
  const project = await getProject(workspaceId, projectId);
  const [brief, codes, quotes, themes, memos, joint, studyRows] = await Promise.all([
    getBrief(workspaceId, projectId),
    listCodes(workspaceId, projectId),
    listQuotes(workspaceId, projectId, {}),
    listThemes(workspaceId, projectId),
    listMemos(workspaceId, projectId),
    jointDisplay(workspaceId, projectId),
    db.select({ id: studies.id, name: studies.name, type: studies.type }).from(studies).where(and(eq(studies.projectId, projectId), eq(studies.workspaceId, workspaceId))),
  ]);
  const byCode = new Map(joint.rows.map((r) => [r.codeId, r]));
  const survey: WriteupContext["survey"] = [];
  const studyInfo: WriteupContext["studies"] = [];
  for (const s of studyRows) {
    const data = await loadStudyDataset(workspaceId, s.id);
    for (const { question, number } of data.questions.values()) {
      const text = describe(summarizeQuestion(question, number, data.rows));
      if (text) survey.push({ study: s.name, question: question.title, summary: text });
    }
    const sessions = await db.$count(researchSessions, eq(researchSessions.studyId, s.id));
    studyInfo.push({ name: s.name, type: s.type, responses: data.rows.length, sessions });
  }
  const codeName = new Map(codes.map((c) => [c.id, c.name]));
  return {
    project: { name: project.name, description: project.description },
    aim: brief.aim,
    questions: brief.questions,
    statements: brief.statements,
    proposal: brief.proposalName ? { name: brief.proposalName, text: brief.proposalText } : null,
    studies: studyInfo,
    respondents: joint.respondents,
    conversations: joint.sessions,
    codes: codes.map((c) => {
      const j = byCode.get(c.id);
      return {
        name: c.name,
        path: c.path,
        definition: c.definition,
        qualPassages: j?.qual.passages ?? 0,
        qualPeople: j?.qual.people ?? 0,
        quantPassages: j?.quant.passages ?? 0,
        quantShare: j?.quant.share ?? 0,
        quotes: quotes
          .filter((q) => q.codeIds.includes(c.id))
          .sort((a, b) => Number(b.starred) - Number(a.starred))
          .slice(0, 4)
          .map((q) => ({ text: q.quote, who: q.participantCode, source: q.source.kind === "session" ? ("conversation" as const) : ("survey" as const) })),
      };
    }),
    themes: themes.map((t) => ({ name: t.name, description: t.description, codes: codes.filter((c) => c.themeId === t.id).map((c) => codeName.get(c.id)!) })),
    survey: survey.slice(0, 40),
    memos: memos.slice(0, 20).map((m) => [m.title, m.body].filter(Boolean).join(": ").slice(0, 600)),
  };
}

// ── Write-ups ────────────────────────────────────────────────────────────────

const LANGUAGES: Record<string, string> = { en: "English", fa: "Persian (Farsi)", ar: "Arabic" };

export async function generateWriteup(userId: string, workspaceId: string, projectId: string, locale = "en") {
  await requireWorkspace(userId, workspaceId, "content:analyze");
  const context = await buildContext(workspaceId, projectId);
  const brief = await getBrief(workspaceId, projectId);
  let pdf: Uint8Array | null = null;
  if (brief.proposalFileId && !brief.proposalText) {
    const [f] = await db.select().from(files).where(eq(files.id, brief.proposalFileId)).limit(1);
    if (f?.mime === "application/pdf") {
      const obj = await storageFor(f.storage).get(f.key);
      if (obj) pdf = obj.body instanceof Uint8Array ? obj.body : new Uint8Array(await new Response(obj.body).arrayBuffer());
    }
  }
  const provider = assistProvider();
  const { title, body } = await provider.writeAnalysis({ context, language: LANGUAGES[locale] ?? "English", proposalPdf: pdf });
  const [row] = await db.insert(writeups).values({ workspaceId, projectId, title: title.slice(0, 200), body, provider: provider.name, createdById: userId }).returning();
  await recordAudit(db, { workspaceId, actorId: userId, action: "writeup.created", entityType: "writeup", entityId: row!.id, metadata: { name: row!.title } });
  return row!;
}

export async function listWriteups(workspaceId: string, projectId: string) {
  return db
    .select({ id: writeups.id, title: writeups.title, provider: writeups.provider, createdAt: writeups.createdAt, updatedAt: writeups.updatedAt })
    .from(writeups)
    .where(and(eq(writeups.workspaceId, workspaceId), eq(writeups.projectId, projectId)))
    .orderBy(desc(writeups.createdAt));
}

export async function getWriteup(workspaceId: string, projectId: string, id: string) {
  const [row] = await db.select().from(writeups).where(and(eq(writeups.id, id), eq(writeups.workspaceId, workspaceId), eq(writeups.projectId, projectId))).limit(1);
  if (!row) throw new AppError("notFound");
  return row;
}

export async function updateWriteup(userId: string, workspaceId: string, projectId: string, id: string, raw: { title: string; body: string }) {
  await requireWorkspace(userId, workspaceId, "content:analyze");
  await getWriteup(workspaceId, projectId, id);
  const input = z.object({ title: z.string().trim().min(1).max(200), body: z.string().max(200_000) }).parse(raw);
  await db.update(writeups).set({ title: input.title, body: cleanProse(input.body) }).where(eq(writeups.id, id));
}

export async function deleteWriteup(userId: string, workspaceId: string, projectId: string, id: string) {
  await requireWorkspace(userId, workspaceId, "content:analyze");
  await getWriteup(workspaceId, projectId, id);
  await db.delete(writeups).where(eq(writeups.id, id));
}
