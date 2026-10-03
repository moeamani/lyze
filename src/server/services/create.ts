import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { answers, forms, responses, studies } from "@/server/db/schema";
import { newId, newToken } from "@/lib/ids";
import { allQuestions } from "@/lib/forms/doc";
import { answerColumns, type Answers } from "@/lib/forms/answers";
import { buildForm, parseFormCsv } from "@/lib/create/form";
import { fakeAnswers, parseResponsesCsv, responsesCsvExample, seeded } from "@/lib/create/responses";
import { fakePeople, parseCodebookCsv, parseGuideCsv } from "@/lib/create/misc";
import { assistProvider } from "@/server/ai";
import { requireWorkspace } from "./access";
import { recordAudit } from "./audit";
import { AppError } from "./errors";
import { createForm, getPublishedDoc } from "./forms";
import { getBrief } from "./writeup";
import { saveGuide } from "./guides";
import { importParticipants } from "./participants";
import { createCode, listCodes } from "./codebook";
import { loadDocument, listDocuments, parseDocKey } from "./qual-docs";

const LANGUAGES: Record<string, string> = { en: "English", fa: "Persian (Farsi)", ar: "Arabic" };
const language = (locale: string) => LANGUAGES[locale] ?? "English";

async function studyRow(workspaceId: string, studyId: string) {
  const [s] = await db.select().from(studies).where(and(eq(studies.id, studyId), eq(studies.workspaceId, workspaceId))).limit(1);
  if (!s) throw new AppError("notFound");
  return s;
}

async function briefFor(workspaceId: string, projectId: string) {
  const b = await getBrief(workspaceId, projectId);
  return { brief: { aim: b.aim, questions: b.questions, statements: b.statements }, proposal: b.proposalText };
}

// ── Questionnaire ───────────────────────────────────────────────────────────

/** Draft a questionnaire from the project brief (built-in rules or Claude). Needs research questions or statements. */
export async function generateQuestionnaire(userId: string, workspaceId: string, studyId: string, locale = "en") {
  await requireWorkspace(userId, workspaceId, "content:edit");
  const study = await studyRow(workspaceId, studyId);
  const { brief, proposal } = await briefFor(workspaceId, study.projectId);
  if (!brief.questions.length && !brief.statements.length) throw new AppError("invalid");
  const rows = await assistProvider().draftQuestionnaire({ brief, proposal, language: language(locale) });
  const doc = buildForm(study.name, rows, study.description ?? undefined);
  const form = await createForm(userId, workspaceId, study.projectId, studyId, { doc, how: "generated" });
  return { formId: form.id, questions: rows.length };
}

export async function importQuestionnaire(userId: string, workspaceId: string, studyId: string, csv: string) {
  await requireWorkspace(userId, workspaceId, "content:edit");
  const study = await studyRow(workspaceId, studyId);
  const { rows, errors } = parseFormCsv(String(csv).slice(0, 2_000_000));
  if (!rows.length) return { formId: null, questions: 0, errors };
  const form = await createForm(userId, workspaceId, study.projectId, studyId, { doc: buildForm(study.name, rows, study.description ?? undefined), how: "import" });
  return { formId: form.id, questions: rows.length, errors };
}

// ── Interview guide ────────────────────────────────────────────────────────

export async function generateGuide(userId: string, workspaceId: string, studyId: string, locale = "en") {
  await requireWorkspace(userId, workspaceId, "content:edit");
  const study = await studyRow(workspaceId, studyId);
  const { brief, proposal } = await briefFor(workspaceId, study.projectId);
  if (!brief.questions.length && !brief.statements.length) throw new AppError("invalid");
  const guide = await assistProvider().draftGuide({ brief, proposal, language: language(locale) });
  await saveGuide(userId, workspaceId, studyId, guide);
  return { sections: guide.sections.length };
}

export async function importGuide(userId: string, workspaceId: string, studyId: string, csv: string) {
  const { guide, errors } = parseGuideCsv(String(csv).slice(0, 2_000_000));
  if (!guide.sections.length) return { sections: 0, errors };
  await saveGuide(userId, workspaceId, studyId, guide);
  return { sections: guide.sections.length, errors };
}

// ── Responses ──────────────────────────────────────────────────────────────

async function publishedForm(workspaceId: string, studyId: string) {
  const [form] = await db.select().from(forms).where(and(eq(forms.workspaceId, workspaceId), eq(forms.studyId, studyId))).limit(1);
  if (!form?.publishedVersion) throw new AppError("invalid");
  const doc = await getPublishedDoc(form.id, form.publishedVersion);
  if (!doc) throw new AppError("invalid");
  return { form, doc, questions: allQuestions(doc) };
}

async function insertResponses(workspaceId: string, studyId: string, formId: string, version: number, rows: Answers[], source: "generated" | "import", spreadDays: number) {
  const { questions } = await publishedForm(workspaceId, studyId);
  const byId = new Map(questions.map((q) => [q.id, q]));
  const now = Date.now();
  const responseRows = rows.map((_, i) => {
    const started = new Date(now - ((rows.length - i) / rows.length) * spreadDays * 864e5);
    const duration = 60_000 + ((i * 7919) % 240) * 1000;
    return {
      id: newId("rsp"),
      workspaceId,
      studyId,
      formId,
      formVersion: version,
      status: "complete" as const,
      source,
      resumeToken: newToken(),
      locale: "en",
      startedAt: started,
      submittedAt: new Date(started.getTime() + duration),
      durationMs: duration,
      meta: { userAgent: source === "generated" ? "Lyze test data" : "Lyze CSV import" },
    };
  });
  const answerRows = responseRows.flatMap((r, i) =>
    Object.entries(rows[i]!).flatMap(([questionId, value]) => {
      const q = byId.get(questionId);
      return q && value !== undefined ? [{ responseId: r.id, questionId, value, ...answerColumns(q, value) }] : [];
    }),
  );
  await db.transaction(async (tx) => {
    for (let i = 0; i < responseRows.length; i += 500) await tx.insert(responses).values(responseRows.slice(i, i + 500));
    for (let i = 0; i < answerRows.length; i += 1000) await tx.insert(answers).values(answerRows.slice(i, i + 1000));
  });
}

/** Made-up responses for testing the analysis. Marked as "generated" everywhere and removable in one go. */
export async function generateResponses(userId: string, workspaceId: string, studyId: string, count: number) {
  await requireWorkspace(userId, workspaceId, "content:edit");
  const n = Math.max(1, Math.min(500, Math.round(count)));
  const { form, questions } = await publishedForm(workspaceId, studyId);
  const r = seeded(Date.now() % 1e9);
  const rows = Array.from({ length: n }, () => fakeAnswers(questions, r));
  await insertResponses(workspaceId, studyId, form.id, form.publishedVersion!, rows, "generated", 14);
  await recordAudit(db, { workspaceId, actorId: userId, action: "response.generated", entityType: "response", entityId: studyId, metadata: { count: n } });
  return { count: n };
}

export async function importResponses(userId: string, workspaceId: string, studyId: string, csv: string) {
  await requireWorkspace(userId, workspaceId, "content:edit");
  const { form, questions } = await publishedForm(workspaceId, studyId);
  const parsed = parseResponsesCsv(String(csv).slice(0, 10_000_000), questions);
  if (parsed.rows.length) await insertResponses(workspaceId, studyId, form.id, form.publishedVersion!, parsed.rows.slice(0, 20_000), "import", 0);
  if (parsed.rows.length) await recordAudit(db, { workspaceId, actorId: userId, action: "response.imported", entityType: "response", entityId: studyId, metadata: { count: parsed.rows.length } });
  return { count: parsed.rows.length, matched: parsed.matched.length, unmatched: parsed.unmatched, errors: parsed.errors.slice(0, 50), errorCount: parsed.errors.length };
}

export async function responsesTemplate(workspaceId: string, studyId: string) {
  const { questions } = await publishedForm(workspaceId, studyId);
  return responsesCsvExample(questions);
}

export async function deleteGeneratedResponses(userId: string, workspaceId: string, studyId: string) {
  await requireWorkspace(userId, workspaceId, "content:edit");
  const rows = await db.delete(responses).where(and(eq(responses.workspaceId, workspaceId), eq(responses.studyId, studyId), eq(responses.source, "generated"))).returning({ id: responses.id });
  return { count: rows.length };
}

export async function sourceCounts(workspaceId: string, studyId: string) {
  const rows = await db.select({ source: responses.source }).from(responses).where(and(eq(responses.workspaceId, workspaceId), eq(responses.studyId, studyId)));
  const out = { respondent: 0, manual: 0, import: 0, generated: 0 };
  for (const r of rows) out[r.source]++;
  return out;
}

// ── Participants ───────────────────────────────────────────────────────────

export async function generateParticipants(userId: string, workspaceId: string, studyId: string, count: number) {
  const n = Math.max(1, Math.min(100, Math.round(count)));
  const people = fakePeople(n, seeded(Date.now() % 1e9));
  const cols = ["name", "email", ...Object.keys(people[0]!.attributes)];
  const csv = [cols.join(","), ...people.map((p) => [p.name, p.email, ...Object.values(p.attributes)].join(","))].join("\n");
  return importParticipants(userId, workspaceId, studyId, csv);
}

// ── Codebook ───────────────────────────────────────────────────────────────

async function addCodes(userId: string, workspaceId: string, projectId: string, rows: { name: string; parent: string | null; definition: string | null; color?: string | null }[]) {
  const existing = await listCodes(workspaceId, projectId);
  const ids = new Map(existing.filter((c) => !c.parentId).map((c) => [c.name.toLowerCase(), c.id]));
  let created = 0;
  let skipped = 0;
  // Parents first, so children can find them.
  const ordered = [...rows.filter((r) => !r.parent), ...rows.filter((r) => r.parent)];
  for (const [i, r] of ordered.entries()) {
    const parentId = r.parent ? (ids.get(r.parent.toLowerCase()) ?? null) : null;
    try {
      const c = await createCode(userId, workspaceId, projectId, { name: r.name, color: (r.color ?? String((existing.length + i) % 8 + 1)) as "1", parentId, definition: r.definition ?? "" });
      if (!parentId) ids.set(r.name.toLowerCase(), c.id);
      created++;
    } catch (e) {
      if (e instanceof AppError && (e.code === "conflict" || e.code === "invalid")) skipped++;
      else throw e;
    }
  }
  return { created, skipped };
}

/** A starting codebook from the brief and the project's own text. Codes that already exist are kept as they are. */
export async function generateCodebook(userId: string, workspaceId: string, projectId: string, locale = "en") {
  await requireWorkspace(userId, workspaceId, "content:analyze");
  const { brief } = await briefFor(workspaceId, projectId);
  const docs = await listDocuments(workspaceId, projectId);
  const samples: string[] = [];
  for (const d of docs.slice(0, 12)) {
    const doc = await loadDocument(workspaceId, projectId, parseDocKey(d.key)!);
    for (const u of doc?.units ?? []) if (u.role !== "interviewer" && u.text.length > 25) samples.push(u.text);
  }
  if (samples.length < 4 && !brief.questions.length) throw new AppError("invalid");
  const codes = await assistProvider().draftCodebook({ brief, samples: samples.slice(0, 300), language: language(locale) });
  return addCodes(userId, workspaceId, projectId, codes);
}

export async function importCodebookCsv(userId: string, workspaceId: string, projectId: string, csv: string) {
  await requireWorkspace(userId, workspaceId, "content:analyze");
  const { rows, errors } = parseCodebookCsv(String(csv).slice(0, 1_000_000));
  return { ...(await addCodes(userId, workspaceId, projectId, rows)), errors };
}


