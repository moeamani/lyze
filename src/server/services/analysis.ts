import { and, asc, eq, inArray } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/server/db";
import { answers, forms, formVersions, responses, studyAnalysis } from "@/server/db/schema";
import { analysisSettingsSchema, DEFAULT_SETTINGS, type AnalysisSettings } from "@/lib/analysis/settings";
import { buildDataset, type Dataset, type SourceResponse } from "@/lib/analysis/dataset";
import type { Answers } from "@/lib/forms/answers";
import type { FormDoc } from "@/lib/forms/schema";
import { recordAudit } from "./audit";
import { requireWorkspace } from "./access";

export async function getAnalysisSettings(studyId: string): Promise<AnalysisSettings> {
  const [row] = await db.select({ settings: studyAnalysis.settings }).from(studyAnalysis).where(eq(studyAnalysis.studyId, studyId)).limit(1);
  // Re-parse so older saved settings pick up new defaults.
  return row ? analysisSettingsSchema.parse(row.settings) : DEFAULT_SETTINGS;
}

export async function saveAnalysisSettings(userId: string, workspaceId: string, studyId: string, raw: unknown) {
  await requireWorkspace(userId, workspaceId, "content:analyze");
  const settings = analysisSettingsSchema.parse(raw);
  await db
    .insert(studyAnalysis)
    .values({ studyId, workspaceId, settings })
    .onConflictDoUpdate({ target: studyAnalysis.studyId, set: { settings, updatedAt: new Date() } });
  await recordAudit(db, { workspaceId, actorId: userId, action: "analysis.updated", entityType: "study", entityId: studyId });
  return settings;
}

/**
 * Everything needed to analyze a study: every published form version that has responses (newest
 * first), all responses with their answers, and the cleaning rules — merged into a dataset.
 * Cached per request so the summary, tests and exports on one page share one load.
 */
export const loadStudyDataset = cache(async (workspaceId: string, studyId: string, opts: { raw?: boolean } = {}): Promise<Dataset & { settings: AnalysisSettings; formTitle: string | null }> => {
  const saved = await getAnalysisSettings(studyId);
  // "raw" keeps every response (for the response browser) but still computes recodes/scores.
  const settings: AnalysisSettings = opts.raw ? { ...saved, includePartial: true, includeScreenedOut: true, minDurationSec: null, excludedIds: [] } : saved;
  const [form] = await db
    .select()
    .from(forms)
    .where(and(eq(forms.workspaceId, workspaceId), eq(forms.studyId, studyId)))
    .limit(1);
  if (!form?.publishedVersion) return { ...buildDataset([], [], settings), settings: saved, formTitle: form?.draft.title ?? null };

  const rows = await db
    .select({
      id: responses.id,
      status: responses.status,
      formVersion: responses.formVersion,
      startedAt: responses.startedAt,
      submittedAt: responses.submittedAt,
      durationMs: responses.durationMs,
      locale: responses.locale,
    })
    .from(responses)
    .where(and(eq(responses.workspaceId, workspaceId), eq(responses.studyId, studyId)))
    .orderBy(asc(responses.startedAt));

  const versions = [...new Set([form.publishedVersion, ...rows.map((r) => r.formVersion)])].sort((a, b) => b - a);
  const versionRows = await db
    .select({ version: formVersions.version, doc: formVersions.doc })
    .from(formVersions)
    .where(and(eq(formVersions.formId, form.id), inArray(formVersions.version, versions)));
  const docs: FormDoc[] = versions.map((v) => versionRows.find((r) => r.version === v)?.doc).filter((d): d is FormDoc => !!d);

  const answerRows = rows.length
    ? await db
        .select({ responseId: answers.responseId, questionId: answers.questionId, value: answers.value })
        .from(answers)
        .innerJoin(responses, eq(responses.id, answers.responseId))
        .where(and(eq(responses.workspaceId, workspaceId), eq(responses.studyId, studyId)))
    : [];
  const byResponse = new Map<string, Answers>();
  for (const a of answerRows) {
    const map = byResponse.get(a.responseId) ?? {};
    map[a.questionId] = a.value;
    byResponse.set(a.responseId, map);
  }

  const source: SourceResponse[] = rows.map((r) => ({
    id: r.id,
    status: r.status,
    startedAt: r.startedAt,
    submittedAt: r.submittedAt,
    durationMs: r.durationMs,
    locale: r.locale,
    answers: byResponse.get(r.id) ?? {},
  }));
  return { ...buildDataset(docs, source, settings), settings: saved, formTitle: docs[0]?.title ?? form.draft.title };
});

/** Status counts before cleaning, for the "what's included" summary. */
export async function rawStatusCounts(workspaceId: string, studyId: string) {
  const rows = await db
    .select({ status: responses.status, durationMs: responses.durationMs })
    .from(responses)
    .where(and(eq(responses.workspaceId, workspaceId), eq(responses.studyId, studyId)));
  return rows;
}
