"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth";
import { createCode, deleteCode, importCodebook, mergeCodes, reorderCode, splitCode, updateCode, type CodeInput } from "@/server/services/codebook";
import { applyCode, removeCoding, reviewSuggestions, setStarred } from "@/server/services/coding";
import { createTheme, deleteTheme, placeCode, reorderThemes, updateTheme, type ThemeInput } from "@/server/services/themes";
import { createMemo, deleteMemo, updateMemo, type MemoInput } from "@/server/services/memos";
import { clusterQuestion, createCodeFromCluster, draftTheme, suggestForDocument, summarizeSession } from "@/server/services/assist";
import { parseDocKey } from "@/server/services/qual-docs";
import { AppError } from "@/server/services/errors";
import { attempt } from "./result";
import { providerFor, type AiMode } from "@/server/ai";

type Scope = { workspaceId: string; slug: string; projectId: string };

async function run<T>(scope: Scope, fn: (userId: string) => Promise<T>, revalidate = true) {
  const user = await requireUser();
  const result = await attempt(() => fn(user.id));
  if (result.ok && revalidate) revalidatePath(`/w/${scope.slug}/p/${scope.projectId}`, "layout");
  return result;
}

const W = (s: Scope) => [s.workspaceId, s.projectId] as const;

// ── Codebook ───────────────────────────────────────────────────────────────

export async function createCodeAction(scope: Scope, input: CodeInput) {
  return run(scope, async (u) => {
    const c = await createCode(u, ...W(scope), input);
    return { id: c.id, name: c.name, color: c.color };
  });
}
export async function updateCodeAction(scope: Scope, codeId: string, input: CodeInput) {
  return run(scope, (u) => updateCode(u, ...W(scope), codeId, input));
}
export async function reorderCodeAction(scope: Scope, codeId: string, direction: "up" | "down") {
  return run(scope, (u) => reorderCode(u, ...W(scope), codeId, direction));
}
export async function deleteCodeAction(scope: Scope, codeId: string) {
  return run(scope, (u) => deleteCode(u, ...W(scope), codeId));
}
export async function mergeCodesAction(scope: Scope, sourceIds: string[], targetId: string) {
  return run(scope, (u) => mergeCodes(u, ...W(scope), sourceIds, targetId));
}
export async function splitCodeAction(scope: Scope, codeId: string, applicationIds: string[], input: CodeInput) {
  return run(scope, async (u) => (await splitCode(u, ...W(scope), codeId, applicationIds, input)).id);
}
export async function importCodebookAction(scope: Scope, xml: string) {
  return run(scope, (u) => importCodebook(u, ...W(scope), xml));
}

// ── Coding ─────────────────────────────────────────────────────────────────

type ApplyInput = { codeId: string; unitKind: "segment" | "answer"; unitId: string; start: number; end: number };

export async function applyCodeAction(scope: Scope, input: ApplyInput) {
  return run(scope, async (u) => (await applyCode(u, ...W(scope), input)).id);
}

/** Create a code and apply it in one step (the "new code" path in the coding popover). */
export async function applyNewCodeAction(scope: Scope, code: CodeInput, target: Omit<ApplyInput, "codeId">) {
  return run(scope, async (u) => {
    const c = await createCode(u, ...W(scope), code);
    await applyCode(u, ...W(scope), { ...target, codeId: c.id });
    return c.id;
  });
}
export async function removeCodingAction(scope: Scope, id: string) {
  return run(scope, (u) => removeCoding(u, ...W(scope), id));
}
export async function starCodingAction(scope: Scope, id: string, starred: boolean) {
  return run(scope, (u) => setStarred(u, ...W(scope), id, starred));
}
export async function reviewSuggestionsAction(scope: Scope, ids: string[], accept: boolean) {
  return run(scope, (u) => reviewSuggestions(u, ...W(scope), ids, accept));
}

// ── Themes ─────────────────────────────────────────────────────────────────

export async function createThemeAction(scope: Scope, input: ThemeInput) {
  return run(scope, async (u) => (await createTheme(u, ...W(scope), input)).id);
}
export async function updateThemeAction(scope: Scope, themeId: string, input: ThemeInput) {
  return run(scope, (u) => updateTheme(u, ...W(scope), themeId, input));
}
export async function deleteThemeAction(scope: Scope, themeId: string) {
  return run(scope, (u) => deleteTheme(u, ...W(scope), themeId));
}
export async function reorderThemesAction(scope: Scope, ids: string[]) {
  return run(scope, (u) => reorderThemes(u, ...W(scope), ids));
}
export async function placeCodeAction(scope: Scope, codeId: string, themeId: string | null, index: number) {
  return run(scope, (u) => placeCode(u, ...W(scope), codeId, themeId, index));
}

// ── Memos ──────────────────────────────────────────────────────────────────

export async function createMemoAction(scope: Scope, input: MemoInput) {
  return run(scope, async (u) => (await createMemo(u, ...W(scope), input)).id);
}
export async function updateMemoAction(scope: Scope, memoId: string, input: { title?: string | null; body: string }) {
  return run(scope, (u) => updateMemo(u, ...W(scope), memoId, input));
}
export async function deleteMemoAction(scope: Scope, memoId: string) {
  return run(scope, (u) => deleteMemo(u, ...W(scope), memoId));
}

// ── Assistant (all output is a suggestion) ─────────────────────────────────

export async function suggestCodingsAction(scope: Scope, docKey: string, mode: AiMode = "lyze") {
  return run(scope, async (u) => {
    const ref = parseDocKey(docKey);
    if (!ref) throw new AppError("invalid");
    return suggestForDocument(u, ...W(scope), ref, await providerFor(u, scope.workspaceId, mode));
  });
}
export async function summarizeSessionAction(scope: Scope, sessionId: string, mode: AiMode = "lyze") {
  return run(scope, async (u) => summarizeSession(u, ...W(scope), sessionId, await providerFor(u, scope.workspaceId, mode)), false);
}
export async function clusterQuestionAction(scope: Scope, studyId: string, questionId: string, mode: AiMode = "lyze") {
  return run(scope, async (u) => clusterQuestion(u, ...W(scope), studyId, questionId, await providerFor(u, scope.workspaceId, mode)), false);
}
export async function createCodeFromClusterAction(scope: Scope, code: CodeInput, answerIds: string[]) {
  return run(scope, (u) => createCodeFromCluster(u, ...W(scope), { code, answerIds }));
}
export async function draftThemeAction(scope: Scope, themeId: string, mode: AiMode = "lyze") {
  return run(scope, async (u) => draftTheme(u, ...W(scope), themeId, await providerFor(u, scope.workspaceId, mode)), false);
}
