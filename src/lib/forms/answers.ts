import type { Question } from "./schema";

/** Sentinel option id used for "Other: ___" answers. */
export const OTHER = "__other__";

export type ChoiceAnswer = { choice: string; other?: string };
export type MultiChoiceAnswer = { choices: string[]; other?: string };
export type MatrixAnswer = Record<string, string | string[]>;
export type FileAnswer = { fileIds: string[] };

/**
 * Answer shapes by question type:
 * - short/long text, date → string
 * - single choice, dropdown → ChoiceAnswer
 * - multiple choice → MultiChoiceAnswer
 * - rating, likert (1-based), nps, slider, number → number
 * - yes/no → boolean
 * - ranking → string[] (option ids, best first)
 * - matrix → MatrixAnswer (rowId → columnId, or columnIds when multiple)
 * - file upload, media → FileAnswer
 */
export type AnswerValue = string | number | boolean | string[] | ChoiceAnswer | MultiChoiceAnswer | MatrixAnswer | FileAnswer;
export type Answers = Record<string, AnswerValue | undefined>;

export type AnswerError =
  | "required"
  | "invalid"
  | "tooLong"
  | "email"
  | "url"
  | "phone"
  | "min"
  | "max"
  | "integer"
  | "minSelected"
  | "maxSelected"
  | "otherMissing"
  | "incomplete";

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isStrArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");

/** Whether a value counts as "answered" for this question. Malformed values count as unanswered. */
export function isAnswered(question: Question, value: unknown): boolean {
  if (value === undefined || value === null) return false;
  switch (question.type) {
    case "short_text":
    case "long_text":
    case "date":
      return typeof value === "string" && value.trim().length > 0;
    case "single_choice":
    case "dropdown":
      return isObj(value) && typeof value.choice === "string" && value.choice.length > 0;
    case "multiple_choice":
      return isObj(value) && isStrArray(value.choices) && value.choices.length > 0;
    case "rating":
    case "likert":
    case "nps":
    case "slider":
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "yes_no":
      return typeof value === "boolean";
    case "ranking":
      return isStrArray(value) && value.length > 0;
    case "matrix":
      return isObj(value) && Object.values(value).some((v) => (Array.isArray(v) ? v.length > 0 : typeof v === "string" && v));
    case "file_upload":
    case "media":
      return isObj(value) && isStrArray(value.fileIds) && value.fileIds.length > 0;
  }
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_RE = /^(https?:\/\/)?[\w.-]+\.[a-z]{2,}(\/\S*)?$/i;
const PHONE = /^\+?[\d\s().-]{6,20}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/;

/**
 * Validate (and lightly normalize) one answer. `required` is passed separately because logic can
 * make a question required dynamically.
 */
export function validateAnswer(
  question: Question,
  value: unknown,
  required = question.required,
): { ok: true; value: AnswerValue | undefined } | { ok: false; error: AnswerError } {
  if (!isAnswered(question, value)) {
    // A started-but-incomplete matrix is still "unanswered" for required checks.
    return required ? { ok: false, error: "required" } : { ok: true, value: undefined };
  }

  switch (question.type) {
    case "short_text":
    case "long_text": {
      const v = (value as string).trim();
      const max = question.config.maxLength ?? (question.type === "short_text" ? 500 : 10000);
      if (v.length > max) return { ok: false, error: "tooLong" };
      if (question.type === "short_text") {
        const format = question.config.format;
        if (format === "email" && !EMAIL.test(v)) return { ok: false, error: "email" };
        if (format === "url" && !URL_RE.test(v)) return { ok: false, error: "url" };
        if (format === "phone" && !PHONE.test(v)) return { ok: false, error: "phone" };
      }
      return { ok: true, value: v };
    }
    case "date": {
      const v = value as string;
      if (!ISO_DATE.test(v) || Number.isNaN(Date.parse(v))) return { ok: false, error: "invalid" };
      return { ok: true, value: v };
    }
    case "single_choice":
    case "dropdown": {
      const v = value as ChoiceAnswer;
      const allowOther = question.type === "single_choice" && question.config.allowOther;
      if (v.choice === OTHER) {
        if (!allowOther) return { ok: false, error: "invalid" };
        const other = (v.other ?? "").trim();
        if (!other) return { ok: false, error: "otherMissing" };
        if (other.length > 500) return { ok: false, error: "tooLong" };
        return { ok: true, value: { choice: OTHER, other } };
      }
      if (!question.config.options.some((o) => o.id === v.choice)) return { ok: false, error: "invalid" };
      return { ok: true, value: { choice: v.choice } };
    }
    case "multiple_choice": {
      const v = value as MultiChoiceAnswer;
      const ids = new Set(question.config.options.map((o) => o.id));
      const choices = [...new Set(v.choices)];
      for (const c of choices) {
        if (c === OTHER ? !question.config.allowOther : !ids.has(c)) return { ok: false, error: "invalid" };
      }
      const { minSelected, maxSelected } = question.config;
      if (minSelected && choices.length < minSelected) return { ok: false, error: "minSelected" };
      if (maxSelected && choices.length > maxSelected) return { ok: false, error: "maxSelected" };
      if (choices.includes(OTHER)) {
        const other = (v.other ?? "").trim();
        if (!other) return { ok: false, error: "otherMissing" };
        if (other.length > 500) return { ok: false, error: "tooLong" };
        return { ok: true, value: { choices, other } };
      }
      return { ok: true, value: { choices } };
    }
    case "rating":
      return inRange(value as number, 1, question.config.max, true);
    case "likert":
      return inRange(value as number, 1, question.config.labels.length, true);
    case "nps":
      return inRange(value as number, 0, 10, true);
    case "slider": {
      const { min, max } = question.config;
      return inRange(value as number, Math.min(min, max), Math.max(min, max), false);
    }
    case "number": {
      const v = value as number;
      if (question.config.integer && !Number.isInteger(v)) return { ok: false, error: "integer" };
      if (question.config.min !== undefined && v < question.config.min) return { ok: false, error: "min" };
      if (question.config.max !== undefined && v > question.config.max) return { ok: false, error: "max" };
      return { ok: true, value: v };
    }
    case "yes_no":
      return { ok: true, value: value as boolean };
    case "ranking": {
      const v = value as string[];
      const ids = question.config.options.map((o) => o.id);
      // A ranking must order every option exactly once.
      if (v.length !== ids.length || new Set(v).size !== v.length || !v.every((x) => ids.includes(x))) {
        return { ok: false, error: "invalid" };
      }
      return { ok: true, value: v };
    }
    case "matrix": {
      const v = value as Record<string, unknown>;
      const rows = new Set(question.config.rows.map((r) => r.id));
      const cols = new Set(question.config.columns.map((c) => c.id));
      const out: MatrixAnswer = {};
      for (const [rowId, cell] of Object.entries(v)) {
        if (!rows.has(rowId)) return { ok: false, error: "invalid" };
        if (question.config.multiple) {
          if (!isStrArray(cell) || !cell.every((c) => cols.has(c))) return { ok: false, error: "invalid" };
          if (cell.length) out[rowId] = [...new Set(cell)];
        } else {
          if (typeof cell !== "string" || !cols.has(cell)) return { ok: false, error: "invalid" };
          out[rowId] = cell;
        }
      }
      if (required && Object.keys(out).length < rows.size) return { ok: false, error: "incomplete" };
      return { ok: true, value: out };
    }
    case "file_upload":
    case "media": {
      const v = value as FileAnswer;
      const max = question.type === "file_upload" ? question.config.maxFiles : 1;
      if (v.fileIds.length > max) return { ok: false, error: "maxSelected" };
      return { ok: true, value: { fileIds: [...new Set(v.fileIds)] } };
    }
  }
}

function inRange(v: number, min: number, max: number, integer: boolean) {
  if (integer && !Number.isInteger(v)) return { ok: false as const, error: "invalid" as const };
  if (v < min) return { ok: false as const, error: "min" as const };
  if (v > max) return { ok: false as const, error: "max" as const };
  return { ok: true as const, value: v };
}

/** Denormalized columns stored next to each answer for fast stats and search. */
export function answerColumns(question: Question, value: AnswerValue | undefined): { numeric: number | null; text: string | null } {
  if (value === undefined) return { numeric: null, text: null };
  switch (question.type) {
    case "rating":
    case "likert":
    case "nps":
    case "slider":
    case "number":
      return { numeric: value as number, text: null };
    case "yes_no":
      return { numeric: value ? 1 : 0, text: null };
    case "short_text":
    case "long_text":
      return { numeric: null, text: value as string };
    case "single_choice":
    case "multiple_choice":
      return { numeric: null, text: (value as ChoiceAnswer | MultiChoiceAnswer).other ?? null };
    default:
      return { numeric: null, text: null };
  }
}

/** Human-readable answer (used for piping and response views). */
export function answerToText(question: Question, value: AnswerValue | undefined, otherLabel = "Other"): string {
  if (value === undefined || !isAnswered(question, value)) return "";
  const label = (options: { id: string; label: string }[], id: string) => options.find((o) => o.id === id)?.label ?? "";
  switch (question.type) {
    case "single_choice":
    case "dropdown": {
      const v = value as ChoiceAnswer;
      return v.choice === OTHER ? v.other || otherLabel : label(question.config.options, v.choice);
    }
    case "multiple_choice": {
      const v = value as MultiChoiceAnswer;
      return v.choices.map((c) => (c === OTHER ? v.other || otherLabel : label(question.config.options, c))).join(", ");
    }
    case "ranking":
      return (value as string[]).map((id, i) => `${i + 1}. ${label(question.config.options, id)}`).join(", ");
    case "likert":
      return question.config.labels[(value as number) - 1] ?? String(value);
    case "rating":
      return `${value}/${question.config.max}`;
    case "yes_no":
      return value ? question.config.yesLabel || "Yes" : question.config.noLabel || "No";
    case "matrix": {
      const v = value as MatrixAnswer;
      return question.config.rows
        .filter((r) => v[r.id] !== undefined)
        .map((r) => {
          const cell = v[r.id]!;
          const cols = (Array.isArray(cell) ? cell : [cell]).map((c) => label(question.config.columns, c));
          return `${r.label}: ${cols.join(", ")}`;
        })
        .join("; ");
    }
    case "number":
      return question.config.unit ? `${value} ${question.config.unit}` : String(value);
    case "file_upload":
    case "media": {
      const n = (value as FileAnswer).fileIds.length;
      return n === 1 ? "1 file" : `${n} files`;
    }
    default:
      return String(value);
  }
}
