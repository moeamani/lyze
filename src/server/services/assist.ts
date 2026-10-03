import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { codeApplications, codes, themes } from "@/server/db/schema";
import { assistProvider, type AssistProvider } from "@/server/ai";
import { recordAudit } from "./audit";
import { AppError } from "./errors";
import { createCode, listCodes, type CodeInput } from "./codebook";
import { listQuotes } from "./coding";
import { loadDocument, loadUnit, requireProject, type DocRef } from "./qual-docs";

const MAX_SUGGESTIONS = 300;

/** Ask the assistant to propose codings for a document. They're saved as pending suggestions. */
export async function suggestForDocument(userId: string, workspaceId: string, projectId: string, ref: DocRef, provider: AssistProvider = assistProvider()) {
  await requireProject(userId, workspaceId, projectId, "content:analyze");
  const doc = await loadDocument(workspaceId, projectId, ref);
  const codebook = await listCodes(workspaceId, projectId);
  if (!codebook.length) throw new AppError("invalid", "noCodes");
  const unitIds = doc.units.map((u) => u.id);
  const col = doc.units[0]?.kind === "segment" ? codeApplications.segmentId : codeApplications.answerId;
  const current = unitIds.length ? await db.select({ codeId: codeApplications.codeId, unit: col }).from(codeApplications).where(inArray(col, unitIds)) : [];
  const existing = new Set(current.map((c) => `${c.unit}:${c.codeId}`));
  const suggestions = await provider.suggestCodings({
    // Interviewer questions are context, not data to code.
    units: doc.units.filter((u) => u.role !== "interviewer").map((u) => ({ id: u.id, text: u.text })),
    codes: codebook.map((c) => ({ id: c.id, name: c.name, definition: c.definition })),
    existing,
  });
  const byId = new Map(doc.units.map((u) => [u.id, u]));
  const rows = suggestions.slice(0, MAX_SUGGESTIONS).flatMap((s) => {
    const unit = byId.get(s.unitId);
    if (!unit) return [];
    return [
      {
        workspaceId,
        projectId,
        codeId: s.codeId,
        ...(unit.kind === "segment" ? { segmentId: unit.id } : { answerId: unit.id }),
        start: s.start,
        end: s.end,
        quote: unit.text.slice(s.start, s.end),
        source: "ai" as const,
        approvedAt: null,
        reason: s.reason,
        createdById: userId,
      },
    ];
  });
  if (rows.length) await db.insert(codeApplications).values(rows);
  await recordAudit(db, { workspaceId, actorId: userId, action: "ai.suggested", entityType: "project", entityId: projectId, metadata: { count: rows.length, provider: provider.name, title: doc.title } });
  return { created: rows.length, provider: provider.name };
}

export async function summarizeSession(userId: string, workspaceId: string, projectId: string, sessionId: string, provider: AssistProvider = assistProvider()) {
  await requireProject(userId, workspaceId, projectId, "content:analyze");
  const doc = await loadDocument(workspaceId, projectId, { kind: "session", sessionId });
  const points = await provider.summarize({ title: doc.title, paragraphs: doc.units.map((u) => ({ who: u.role === "interviewer" ? "interviewer" : u.label || "participant", text: u.text })) });
  return { points, provider: provider.name };
}

export async function clusterQuestion(userId: string, workspaceId: string, projectId: string, studyId: string, questionId: string, provider: AssistProvider = assistProvider()) {
  await requireProject(userId, workspaceId, projectId, "content:analyze");
  const doc = await loadDocument(workspaceId, projectId, { kind: "question", studyId, questionId });
  const clusters = await provider.cluster({ question: doc.title, texts: doc.units.map((u) => u.text) });
  return {
    provider: provider.name,
    clusters: clusters.map((c) => ({
      label: c.label,
      description: c.description,
      answerIds: c.members.map((i) => doc.units[i]!.id),
      example: doc.units[c.representative]?.text ?? "",
    })),
  };
}

/** Turn an accepted cluster into a code applied to each of its answers. */
export async function createCodeFromCluster(userId: string, workspaceId: string, projectId: string, raw: { code: CodeInput; answerIds: string[] }) {
  await requireProject(userId, workspaceId, projectId, "content:analyze");
  const answerIds = z.array(z.string().max(64)).min(1).max(5000).parse(raw.answerIds);
  const units = await Promise.all(answerIds.map((id) => loadUnit(workspaceId, projectId, "answer", id)));
  const code = await createCode(userId, workspaceId, projectId, raw.code);
  await db.insert(codeApplications).values(
    units.map((u) => ({ workspaceId, projectId, codeId: code.id, answerId: u.id, start: 0, end: u.text.length, quote: u.text, source: "ai" as const, approvedAt: new Date(), reason: "Grouped by the assistant", createdById: userId })),
  );
  return { codeId: code.id, applied: units.length };
}

export async function draftTheme(userId: string, workspaceId: string, projectId: string, themeId: string, provider: AssistProvider = assistProvider()) {
  await requireProject(userId, workspaceId, projectId, "content:analyze");
  const [theme] = await db.select({ name: themes.name }).from(themes).where(and(eq(themes.id, themeId), eq(themes.projectId, projectId))).limit(1);
  if (!theme) throw new AppError("notFound");
  const name = theme.name;
  const inTheme = await db.select({ id: codes.id, name: codes.name, definition: codes.definition }).from(codes).where(and(eq(codes.projectId, projectId), eq(codes.themeId, themeId)));
  if (!inTheme.length) throw new AppError("invalid", "emptyTheme");
  const counts = await listCodes(workspaceId, projectId);
  const quotes = await listQuotes(workspaceId, projectId, { themeId, limit: 20 });
  const text = await provider.draftTheme({
    name,
    codes: inTheme.map((c) => ({ name: c.name, definition: c.definition, count: counts.find((x) => x.id === c.id)?.count ?? 0 })),
    quotes: quotes.map((q) => q.quote),
  });
  return { text, provider: provider.name };
}
