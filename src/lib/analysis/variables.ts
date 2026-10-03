import { OTHER, type Answers, type AnswerValue, type ChoiceAnswer, type FileAnswer, type MatrixAnswer, type MultiChoiceAnswer } from "@/lib/forms/answers";
import type { DataKind, FormDoc, Question, QuestionType } from "@/lib/forms/schema";

/**
 * Analysis variables, modeled on SPSS/R conventions: each form question becomes one or more
 * variables with a short name (Q1, Q3_2…), a label, a measurement level and value labels.
 * Codes are what exports and statistics use; labels are what people read.
 */

export type Measure = "nominal" | "ordinal" | "scale";
export type Category = { value: number; label: string };

export type Variable = {
  id: string;
  name: string;
  label: string;
  type: "numeric" | "string";
  measure: Measure;
  categories?: Category[];
  role: "meta" | "question" | "recode" | "computed";
  questionId?: string;
  questionType?: QuestionType;
  dataKind?: DataKind;
  /** Sub-variables of one question (multi-select options, matrix rows…) share a group label. */
  group?: string;
  /** Numeric range used for reverse scoring (Likert 1–5, rating 1–max…). */
  range?: [number, number];
};

export type Value = number | string | null;
export type ValueRow = Record<string, Value>;

export const OTHER_CODE = 99;

const STATUS_CODES = { complete: 1, partial: 2, screened_out: 3, over_quota: 4 } as const;

export const META_VARIABLES: Variable[] = [
  { id: "meta:id", name: "response_id", label: "Response ID", type: "string", measure: "nominal", role: "meta" },
  {
    id: "meta:status",
    name: "status",
    label: "Response status",
    type: "numeric",
    measure: "nominal",
    role: "meta",
    categories: [
      { value: 1, label: "Complete" },
      { value: 2, label: "In progress" },
      { value: 3, label: "Screened out" },
      { value: 4, label: "Over quota" },
    ],
  },
  { id: "meta:started", name: "started_at", label: "Started at (UTC)", type: "string", measure: "nominal", role: "meta" },
  { id: "meta:submitted", name: "submitted_at", label: "Submitted at (UTC)", type: "string", measure: "nominal", role: "meta" },
  { id: "meta:duration", name: "duration_sec", label: "Time taken (seconds)", type: "numeric", measure: "scale", role: "meta" },
  { id: "meta:language", name: "language", label: "Language", type: "string", measure: "nominal", role: "meta" },
];

export type ResponseMeta = {
  id: string;
  status: keyof typeof STATUS_CODES;
  startedAt: Date;
  submittedAt: Date | null;
  durationMs: number | null;
  locale: string | null;
};

export function metaValues(r: ResponseMeta): ValueRow {
  return {
    "meta:id": r.id,
    "meta:status": STATUS_CODES[r.status],
    "meta:started": r.startedAt.toISOString(),
    "meta:submitted": r.submittedAt?.toISOString() ?? null,
    "meta:duration": r.durationMs === null ? null : Math.round(r.durationMs / 100) / 10,
    "meta:language": r.locale,
  };
}

const optionCats = (options: { id: string; label: string }[]) => options.map((o, i) => ({ value: i + 1, label: o.label }));

/** Variables for one question. `n` is its number in the form (Q1, Q2…). */
export function questionVariables(q: Question, n: number): Variable[] {
  const name = `Q${n}`;
  const label = q.title || name;
  const base = { role: "question" as const, questionId: q.id, questionType: q.type, dataKind: q.dataKind };
  switch (q.type) {
    case "short_text":
    case "long_text":
      return [{ ...base, id: q.id, name, label, type: "string", measure: "nominal" }];
    case "date":
      return [{ ...base, id: q.id, name, label, type: "string", measure: "nominal" }];
    case "single_choice":
    case "dropdown": {
      const allowOther = q.type === "single_choice" && q.config.allowOther;
      const cats = optionCats(q.config.options);
      if (allowOther) cats.push({ value: OTHER_CODE, label: "Other" });
      const vars: Variable[] = [{ ...base, id: q.id, name, label, type: "numeric", measure: "nominal", categories: cats }];
      if (allowOther) vars.push({ ...base, id: `${q.id}:other`, name: `${name}_other`, label: `${label} — Other (text)`, type: "string", measure: "nominal", group: label });
      return vars;
    }
    case "yes_no":
      return [
        {
          ...base,
          id: q.id,
          name,
          label,
          type: "numeric",
          measure: "nominal",
          categories: [
            { value: 1, label: q.config.yesLabel || "Yes" },
            { value: 0, label: q.config.noLabel || "No" },
          ],
        },
      ];
    case "multiple_choice": {
      const dummy = (id: string, suffix: string, optionLabel: string): Variable => ({
        ...base,
        id,
        name: `${name}_${suffix}`,
        label: `${label} — ${optionLabel}`,
        type: "numeric",
        measure: "nominal",
        group: label,
        categories: [
          { value: 1, label: "Selected" },
          { value: 0, label: "Not selected" },
        ],
      });
      const vars = q.config.options.map((o, i) => dummy(`${q.id}:${o.id}`, String(i + 1), o.label));
      if (q.config.allowOther) {
        vars.push(dummy(`${q.id}:${OTHER}`, "other", "Other"));
        vars.push({ ...base, id: `${q.id}:other`, name: `${name}_other_text`, label: `${label} — Other (text)`, type: "string", measure: "nominal", group: label });
      }
      return vars;
    }
    case "rating":
      return [
        {
          ...base,
          id: q.id,
          name,
          label,
          type: "numeric",
          measure: "ordinal",
          range: [1, q.config.max],
          categories: Array.from({ length: q.config.max }, (_, i) => ({ value: i + 1, label: String(i + 1) })),
        },
      ];
    case "likert":
      return [
        {
          ...base,
          id: q.id,
          name,
          label,
          type: "numeric",
          measure: "ordinal",
          range: [1, q.config.labels.length],
          categories: q.config.labels.map((l, i) => ({ value: i + 1, label: l })),
        },
      ];
    case "nps":
      return [{ ...base, id: q.id, name, label, type: "numeric", measure: "scale", range: [0, 10] }];
    case "slider":
      return [{ ...base, id: q.id, name, label, type: "numeric", measure: "scale", range: [Math.min(q.config.min, q.config.max), Math.max(q.config.min, q.config.max)] }];
    case "number":
      return [{ ...base, id: q.id, name, label, type: "numeric", measure: "scale" }];
    case "ranking":
      return q.config.options.map((o, i) => ({
        ...base,
        id: `${q.id}:${o.id}`,
        name: `${name}_${i + 1}`,
        label: `${label} — rank of ${o.label}`,
        type: "numeric" as const,
        measure: "ordinal" as const,
        group: label,
        range: [1, q.config.options.length] as [number, number],
      }));
    case "matrix": {
      const cols = optionCats(q.config.columns);
      if (!q.config.multiple) {
        return q.config.rows.map((r, i) => ({
          ...base,
          id: `${q.id}:${r.id}`,
          name: `${name}_${i + 1}`,
          label: `${label} — ${r.label}`,
          type: "numeric" as const,
          measure: "ordinal" as const,
          group: label,
          categories: cols,
          range: [1, cols.length] as [number, number],
        }));
      }
      return q.config.rows.flatMap((r, i) =>
        q.config.columns.map((c, j) => ({
          ...base,
          id: `${q.id}:${r.id}:${c.id}`,
          name: `${name}_${i + 1}_${j + 1}`,
          label: `${label} — ${r.label}: ${c.label}`,
          type: "numeric" as const,
          measure: "nominal" as const,
          group: label,
          categories: [
            { value: 1, label: "Selected" },
            { value: 0, label: "Not selected" },
          ],
        })),
      );
    }
    case "file_upload":
    case "media":
      return [{ ...base, id: q.id, name: `${name}_files`, label: `${label} (number of files)`, type: "numeric", measure: "scale" }];
  }
}

/** Code an answer into its variables. Unanswered → null (system missing). */
export function questionValues(q: Question, value: AnswerValue | undefined, answered: boolean): ValueRow {
  const out: ValueRow = {};
  const optionCode = (options: { id: string }[], id: string) => {
    const i = options.findIndex((o) => o.id === id);
    return i >= 0 ? i + 1 : null;
  };
  switch (q.type) {
    case "short_text":
    case "long_text":
    case "date":
      out[q.id] = typeof value === "string" ? value : null;
      break;
    case "single_choice":
    case "dropdown": {
      const v = value as ChoiceAnswer | undefined;
      out[q.id] = !v ? null : v.choice === OTHER ? OTHER_CODE : optionCode(q.config.options, v.choice);
      if (q.type === "single_choice" && q.config.allowOther) out[`${q.id}:other`] = v?.choice === OTHER ? (v.other ?? null) : null;
      break;
    }
    case "yes_no":
      out[q.id] = typeof value === "boolean" ? (value ? 1 : 0) : null;
      break;
    case "multiple_choice": {
      const v = value as MultiChoiceAnswer | undefined;
      // Respondents who answered but didn't tick an option get 0; people who never saw/answered get missing.
      for (const o of q.config.options) out[`${q.id}:${o.id}`] = answered ? (v?.choices.includes(o.id) ? 1 : 0) : null;
      if (q.config.allowOther) {
        out[`${q.id}:${OTHER}`] = answered ? (v?.choices.includes(OTHER) ? 1 : 0) : null;
        out[`${q.id}:other`] = v?.other ?? null;
      }
      break;
    }
    case "rating":
    case "likert":
    case "nps":
    case "slider":
    case "number":
      out[q.id] = typeof value === "number" ? value : null;
      break;
    case "ranking": {
      const v = Array.isArray(value) ? (value as string[]) : null;
      for (const o of q.config.options) {
        const i = v ? v.indexOf(o.id) : -1;
        out[`${q.id}:${o.id}`] = i >= 0 ? i + 1 : null;
      }
      break;
    }
    case "matrix": {
      const v = (value as MatrixAnswer | undefined) ?? {};
      for (const r of q.config.rows) {
        const cell = v[r.id];
        if (!q.config.multiple) {
          out[`${q.id}:${r.id}`] = typeof cell === "string" ? optionCode(q.config.columns, cell) : null;
        } else {
          for (const c of q.config.columns) {
            out[`${q.id}:${r.id}:${c.id}`] = answered ? (Array.isArray(cell) && cell.includes(c.id) ? 1 : 0) : null;
          }
        }
      }
      break;
    }
    case "file_upload":
    case "media":
      out[q.id] = value ? (value as FileAnswer).fileIds.length : answered ? 0 : null;
      break;
  }
  return out;
}

/**
 * All variables for a study. `docs` is newest-first: variables follow the latest published form,
 * and questions that only exist in older versions are appended so their data isn't lost.
 */
export function buildQuestionVariables(docs: readonly FormDoc[]): { variables: Variable[]; questions: Map<string, { question: Question; number: number }> } {
  const questions = new Map<string, { question: Question; number: number }>();
  let n = 0;
  for (const doc of docs) {
    for (const page of doc.pages) {
      for (const q of page.questions) {
        if (questions.has(q.id)) continue;
        questions.set(q.id, { question: q, number: ++n });
      }
    }
  }
  const variables = [...questions.values()].flatMap(({ question, number }) => questionVariables(question, number));
  return { variables, questions };
}

export function rowValues(questions: Map<string, { question: Question }>, answers: Answers): ValueRow {
  const out: ValueRow = {};
  for (const { question } of questions.values()) Object.assign(out, questionValues(question, answers[question.id], answers[question.id] !== undefined));
  return out;
}

/** Human label for a coded value. */
export function valueLabel(variable: Variable, value: Value): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number" && variable.categories) {
    return variable.categories.find((c) => c.value === value)?.label ?? String(value);
  }
  return String(value);
}
