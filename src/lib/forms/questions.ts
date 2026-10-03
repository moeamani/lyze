import { customAlphabet } from "nanoid";
import type { DataKind, FormDoc, Option, Question, QuestionType } from "./schema";

const shortId = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 8);
export const newQuestionId = () => `q_${shortId()}`;
export const newPageId = () => `p_${shortId()}`;
export const newOptionId = () => `o_${shortId()}`;
export const newRuleId = () => `r_${shortId()}`;

export const QUESTION_CATEGORIES: { key: "text" | "choice" | "scale" | "other"; types: QuestionType[] }[] = [
  { key: "text", types: ["short_text", "long_text", "number", "date"] },
  { key: "choice", types: ["single_choice", "multiple_choice", "dropdown", "yes_no", "ranking", "matrix"] },
  { key: "scale", types: ["rating", "likert", "nps", "slider"] },
  { key: "other", types: ["file_upload", "media"] },
];

/** Open-ended types default to qualitative; everything else to quantitative. Authors can override. */
export function defaultDataKind(type: QuestionType): DataKind {
  return type === "short_text" || type === "long_text" || type === "file_upload" || type === "media" ? "qual" : "quant";
}

export const hasOptions = (q: Question): q is Extract<Question, { config: { options: Option[] } }> =>
  "options" in q.config && Array.isArray((q.config as { options?: unknown }).options);

/** Default copy for new questions. The builder passes translated strings. */
export type DefaultCopy = {
  question: string;
  option: (n: number) => string;
  likert: string[];
  row: (n: number) => string;
  column: (n: number) => string;
};

export const ENGLISH_COPY: DefaultCopy = {
  question: "Untitled question",
  option: (n) => `Option ${n}`,
  likert: ["Strongly disagree", "Disagree", "Neutral", "Agree", "Strongly agree"],
  row: (n) => `Statement ${n}`,
  column: (n) => `Column ${n}`,
};

const options = (n: number, label: (i: number) => string): Option[] =>
  Array.from({ length: n }, (_, i) => ({ id: newOptionId(), label: label(i + 1) }));

export function createQuestion(type: QuestionType, copy: DefaultCopy = ENGLISH_COPY): Question {
  const base = { id: newQuestionId(), title: "", required: false, dataKind: defaultDataKind(type) };
  switch (type) {
    case "short_text":
      return { ...base, type, config: { format: "text" } };
    case "long_text":
      return { ...base, type, config: {} };
    case "single_choice":
      return { ...base, type, config: { options: options(3, copy.option), allowOther: false, shuffle: false } };
    case "multiple_choice":
      return { ...base, type, config: { options: options(3, copy.option), allowOther: false, shuffle: false } };
    case "dropdown":
      return { ...base, type, config: { options: options(3, copy.option), shuffle: false } };
    case "rating":
      return { ...base, type, config: { max: 5, icon: "star" } };
    case "likert":
      return { ...base, type, config: { labels: [...copy.likert] } };
    case "nps":
      return { ...base, type, config: {} };
    case "slider":
      return { ...base, type, config: { min: 0, max: 100, step: 1 } };
    case "number":
      return { ...base, type, config: { integer: false } };
    case "date":
      return { ...base, type, config: { includeTime: false } };
    case "ranking":
      return { ...base, type, config: { options: options(3, copy.option), shuffle: false } };
    case "matrix":
      return {
        ...base,
        type,
        config: { rows: options(3, copy.row), columns: copy.likert.map((label) => ({ id: newOptionId(), label })), multiple: false },
      };
    case "yes_no":
      return { ...base, type, config: {} };
    case "file_upload":
      return { ...base, type, config: { accept: "any", maxFiles: 1, maxSizeMb: 10 } };
    case "media":
      return { ...base, type, config: { mediaKind: "audio", maxSeconds: 120 } };
  }
}

/** Deep-copy a question with fresh ids (for "duplicate"). */
export function duplicateQuestion(q: Question): Question {
  const copy = structuredClone(q);
  copy.id = newQuestionId();
  const c = copy.config as Record<string, unknown>;
  for (const key of ["options", "rows", "columns"]) {
    if (Array.isArray(c[key])) c[key] = (c[key] as Option[]).map((o) => ({ ...o, id: newOptionId() }));
  }
  return copy;
}

/**
 * Change a question's type, keeping title, description, required and (where both types have them)
 * the options.
 */
export function changeQuestionType(q: Question, type: QuestionType, copy: DefaultCopy = ENGLISH_COPY): Question {
  const next = createQuestion(type, copy);
  next.id = q.id;
  next.title = q.title;
  next.description = q.description;
  next.required = q.required;
  if (hasOptions(q) && hasOptions(next)) next.config.options = q.config.options;
  return next;
}

export function emptyForm(title: string): FormDoc {
  return {
    version: 1,
    title,
    pages: [{ id: newPageId(), shuffleQuestions: false, questions: [] }],
    logic: [],
    translations: {},
    settings: {
      progressBar: true,
      allowResume: true,
      oneResponse: "none",
      captcha: false,
      showQuestionNumbers: true,
      quotas: [],
      defaultLanguage: "en",
      languages: [],
      theme: { accent: "violet", background: "tinted", corners: "round" },
    },
  };
}

/** Problems that block publishing. Returned as i18n keys with the offending question. */
export type PublishIssue = { code: "noQuestions" | "untitled" | "noOptions" | "noRows" | "badLogic" | "sliderRange"; questionId?: string };

export function publishIssues(doc: FormDoc): PublishIssue[] {
  const issues: PublishIssue[] = [];
  const questions = doc.pages.flatMap((p) => p.questions);
  if (questions.length === 0) issues.push({ code: "noQuestions" });
  const ids = new Set(questions.map((q) => q.id));
  const pageIds = new Set(doc.pages.map((p) => p.id));
  for (const q of questions) {
    if (!q.title.trim()) issues.push({ code: "untitled", questionId: q.id });
    if (hasOptions(q) && q.config.options.filter((o) => o.label.trim()).length < (q.type === "ranking" ? 2 : 1)) {
      issues.push({ code: "noOptions", questionId: q.id });
    }
    if (q.type === "matrix" && (q.config.rows.length === 0 || q.config.columns.length === 0)) {
      issues.push({ code: "noRows", questionId: q.id });
    }
    if (q.type === "slider" && q.config.min >= q.config.max) issues.push({ code: "sliderRange", questionId: q.id });
  }
  for (const rule of doc.logic) {
    const missingSource = rule.when.conditions.some((c) => !ids.has(c.questionId));
    const missingTarget =
      (rule.action === "skip_to_page" && (!rule.target || !pageIds.has(rule.target))) ||
      ((rule.action === "show_question" || rule.action === "hide_question" || rule.action === "require_question") &&
        (!rule.target || !ids.has(rule.target)));
    if (missingSource || missingTarget) issues.push({ code: "badLogic", questionId: rule.target });
  }
  return issues;
}
