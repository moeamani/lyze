import { isAnswered, OTHER, validateAnswer, type AnswerError, type Answers, type AnswerValue } from "./answers";
import { allQuestions, findQuestion, pageIndexOfQuestion } from "./doc";
import type { Condition, ConditionGroup, FormDoc, LogicRule, Page, Question } from "./schema";

// ── Conditions ───────────────────────────────────────────────────────────────

type Comparable = { kind: "list" | "number" | "text"; list: string[]; num: number | null; str: string };

/** Values a condition can compare against, derived from an answer. */
function comparable(question: Question, value: AnswerValue): Comparable {
  switch (question.type) {
    case "single_choice":
    case "dropdown": {
      const v = value as { choice: string; other?: string };
      return { kind: "list", list: [v.choice], num: null, str: v.choice === OTHER ? (v.other ?? "") : v.choice };
    }
    case "multiple_choice": {
      const v = value as { choices: string[]; other?: string };
      return { kind: "list", list: v.choices, num: null, str: [...v.choices, v.other ?? ""].join(" ") };
    }
    case "ranking": {
      // "equals X" on a ranking means "X was ranked first".
      const v = value as string[];
      return { kind: "list", list: v.slice(0, 1), num: null, str: v.join(" ") };
    }
    case "matrix": {
      const cells = Object.values(value as Record<string, string | string[]>).flat();
      return { kind: "list", list: cells, num: null, str: cells.join(" ") };
    }
    case "yes_no":
      return { kind: "number", list: [], num: value ? 1 : 0, str: String(value) };
    case "rating":
    case "likert":
    case "nps":
    case "slider":
    case "number":
      return { kind: "number", list: [], num: value as number, str: String(value) };
    case "file_upload":
    case "media":
      return { kind: "number", list: [], num: (value as { fileIds: string[] }).fileIds.length, str: "" };
    default:
      return { kind: "text", list: [], num: null, str: String(value) };
  }
}

function toNumber(target: Condition["value"]): number {
  if (typeof target === "number") return target;
  if (typeof target === "boolean" || target === "true" || target === "false") return target === true || target === "true" ? 1 : 0;
  return target === undefined || target === "" ? Number.NaN : Number(target);
}

export function evaluateCondition(condition: Condition, question: Question | undefined, answers: Answers): boolean {
  if (!question) return false;
  const value = answers[question.id];
  const answered = isAnswered(question, value);
  if (condition.operator === "answered") return answered;
  if (condition.operator === "not_answered") return !answered;
  // Unanswered questions satisfy only the negative operators.
  if (!answered) return condition.operator === "not_equals" || condition.operator === "not_contains";

  const c = comparable(question, value!);
  const targetNum = toNumber(condition.value);
  const targetStr = String(condition.value ?? "").trim().toLowerCase();

  switch (condition.operator) {
    case "equals":
      if (c.kind === "number") return c.num === targetNum;
      if (c.kind === "text") return c.str.trim().toLowerCase() === targetStr;
      return c.list.some((x) => x.toLowerCase() === targetStr);
    case "not_equals":
      return !evaluateCondition({ ...condition, operator: "equals" }, question, answers);
    case "contains":
      if (c.kind === "list" && question.type !== "ranking") return c.list.some((x) => x.toLowerCase() === targetStr);
      return c.str.toLowerCase().includes(targetStr);
    case "not_contains":
      return !evaluateCondition({ ...condition, operator: "contains" }, question, answers);
    case "gt":
      return c.num !== null && c.num > targetNum;
    case "gte":
      return c.num !== null && c.num >= targetNum;
    case "lt":
      return c.num !== null && c.num < targetNum;
    case "lte":
      return c.num !== null && c.num <= targetNum;
  }
}

export function evaluateGroup(group: ConditionGroup, doc: Pick<FormDoc, "pages">, answers: Answers): boolean {
  const results = group.conditions.map((c) => evaluateCondition(c, findQuestion(doc, c.questionId), answers));
  return group.match === "any" ? results.some(Boolean) : results.every(Boolean);
}

// ── Visibility & requirement ─────────────────────────────────────────────────

export type LogicState = { visible: Set<string>; required: Set<string> };

/**
 * Work out which questions are visible and required for the current answers.
 * - A question targeted by any "show" rule starts hidden and appears when one of them matches.
 * - "hide" rules win over "show" rules.
 * - Answers to hidden questions are ignored, so chains of rules settle after a few passes.
 */
export function computeState(doc: Pick<FormDoc, "pages" | "logic">, answers: Answers): LogicState {
  const questions = allQuestions(doc);
  const showTargets = new Set(doc.logic.filter((r) => r.action === "show_question" && r.target).map((r) => r.target!));

  let visible = new Set(questions.map((q) => q.id));
  for (let pass = 0; pass < 8; pass++) {
    const effective = pick(answers, visible);
    const next = new Set<string>();
    for (const q of questions) if (!showTargets.has(q.id)) next.add(q.id);
    for (const rule of doc.logic) {
      if (rule.action === "show_question" && rule.target && evaluateGroup(rule.when, doc, effective)) next.add(rule.target);
    }
    for (const rule of doc.logic) {
      if (rule.action === "hide_question" && rule.target && evaluateGroup(rule.when, doc, effective)) next.delete(rule.target);
    }
    const stable = next.size === visible.size && [...next].every((id) => visible.has(id));
    visible = next;
    if (stable) break;
  }

  const effective = pick(answers, visible);
  const required = new Set(questions.filter((q) => q.required).map((q) => q.id));
  for (const rule of doc.logic) {
    if (rule.action === "require_question" && rule.target && evaluateGroup(rule.when, doc, effective)) required.add(rule.target);
  }
  return { visible, required };
}

function pick(answers: Answers, ids: Set<string>): Answers {
  const out: Answers = {};
  for (const id of ids) if (answers[id] !== undefined) out[id] = answers[id];
  return out;
}

/** Drop answers to questions that ended up hidden (they must not be stored). */
export function pruneHidden(answers: Answers, state: LogicState): Answers {
  return pick(answers, state.visible);
}

export function visibleQuestions(page: Page, state: LogicState): Question[] {
  return page.questions.filter((q) => state.visible.has(q.id));
}

// ── Navigation ───────────────────────────────────────────────────────────────

/** The page a rule "belongs" to: the last page among the questions it depends on. */
export function ruleSourcePage(rule: LogicRule, doc: Pick<FormDoc, "pages">): number {
  return Math.max(-1, ...rule.when.conditions.map((c) => pageIndexOfQuestion(doc, c.questionId)));
}

export type NextStep = { type: "page"; index: number } | { type: "end"; screenOut: boolean; message?: string };

/** Where to go after the page at `current`, honoring skip/end rules and skipping empty pages. */
export function nextStep(doc: Pick<FormDoc, "pages" | "logic">, current: number, answers: Answers, state?: LogicState): NextStep {
  const s = state ?? computeState(doc, answers);
  const effective = pruneHidden(answers, s);
  let target = current + 1;

  for (const rule of doc.logic) {
    if (rule.action !== "skip_to_page" && rule.action !== "end_form") continue;
    if (ruleSourcePage(rule, doc) !== current) continue;
    if (!evaluateGroup(rule.when, doc, effective)) continue;
    if (rule.action === "end_form") return { type: "end", screenOut: !!rule.screenOut, message: rule.message };
    const index = doc.pages.findIndex((p) => p.id === rule.target);
    if (index > current) {
      target = index;
      break;
    }
  }

  while (target < doc.pages.length && isSkippable(doc.pages[target]!, s)) target++;
  return target >= doc.pages.length ? { type: "end", screenOut: false } : { type: "page", index: target };
}

/** A page whose questions are all hidden is skipped. Intro pages (no questions at all) are kept. */
function isSkippable(page: Page, state: LogicState) {
  return page.questions.length > 0 && visibleQuestions(page, state).length === 0;
}

/** The first page to show (page 0 unless all of its questions are hidden). */
export function firstPage(doc: Pick<FormDoc, "pages" | "logic">, answers: Answers = {}): number {
  const s = computeState(doc, answers);
  let i = 0;
  while (i < doc.pages.length - 1 && isSkippable(doc.pages[i]!, s)) i++;
  return i;
}

// ── Validation ───────────────────────────────────────────────────────────────

export function validatePage(page: Page, answers: Answers, state: LogicState): Record<string, AnswerError> {
  const errors: Record<string, AnswerError> = {};
  for (const q of visibleQuestions(page, state)) {
    const result = validateAnswer(q, answers[q.id], state.required.has(q.id));
    if (!result.ok) errors[q.id] = result.error;
  }
  return errors;
}

/**
 * Server-side check of a full submission: re-run logic, validate each visible question along the
 * path actually taken, and return the clean answers to store.
 */
export function validateSubmission(
  doc: Pick<FormDoc, "pages" | "logic">,
  raw: Answers,
): { ok: true; answers: Answers; screenOut: boolean } | { ok: false; errors: Record<string, AnswerError> } {
  const state = computeState(doc, raw);
  const clean: Answers = {};
  const errors: Record<string, AnswerError> = {};
  let index = firstPage(doc, raw);
  let screenOut = false;
  const seen = new Set<number>();

  while (index < doc.pages.length && !seen.has(index)) {
    seen.add(index);
    const page = doc.pages[index]!;
    for (const q of visibleQuestions(page, state)) {
      const result = validateAnswer(q, raw[q.id], state.required.has(q.id));
      if (!result.ok) errors[q.id] = result.error;
      else if (result.value !== undefined) clean[q.id] = result.value;
    }
    const step = nextStep(doc, index, raw, state);
    if (step.type === "end") {
      screenOut = step.screenOut;
      break;
    }
    index = step.index;
  }

  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, answers: clean, screenOut };
}

/** Questions a rule may reference as conditions for a target on page `pageIndex` (earlier or same page). */
export function questionsBefore(doc: Pick<FormDoc, "pages">, pageIndex: number): Question[] {
  return doc.pages.slice(0, pageIndex + 1).flatMap((p) => p.questions);
}
