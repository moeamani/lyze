import { z } from "zod";
import { createQuestion, emptyForm } from "@/lib/forms/questions";
import { newOptionId, newPageId } from "@/lib/forms/questions";
import { formDocSchema, type FormDoc, type Question } from "@/lib/forms/schema";
import { parseDelimited } from "@/lib/interviews/participants";

/**
 * One questionnaire question as a flat row. CSV uploads and generated questionnaires (built-in or
 * Claude) both produce rows, and `buildForm` turns rows into a form document the builder can edit.
 */
export const ROW_TYPES = ["short_text", "long_text", "single_choice", "multiple_choice", "dropdown", "rating", "likert", "nps", "number", "yes_no", "date"] as const;
export type RowType = (typeof ROW_TYPES)[number];

export const questionRowSchema = z.object({
  page: z.string().max(200).default(""),
  type: z.enum(ROW_TYPES),
  question: z.string().trim().min(1).max(1000),
  description: z.string().max(2000).default(""),
  required: z.boolean().default(false),
  options: z.array(z.string().trim().min(1).max(300)).max(50).default([]),
  min: z.number().nullable().default(null),
  max: z.number().nullable().default(null),
  lowLabel: z.string().max(100).default(""),
  highLabel: z.string().max(100).default(""),
});
export type QuestionRow = z.infer<typeof questionRowSchema>;

export const FORM_CSV_HEADERS = ["page", "type", "question", "description", "required", "options", "min", "max", "low_label", "high_label"] as const;

/** The example file offered next to every questionnaire upload. */
export const FORM_CSV_EXAMPLE = `page,type,question,description,required,options,min,max,low_label,high_label
About you,single_choice,How old are you?,,yes,Under 25|25-34|35-44|45-54|55 or older,,,,
About you,short_text,What city do you live in?,,no,,,,,
Your mornings,number,How many cups of coffee do you drink on a typical day?,,yes,,0,15,,
Your mornings,multiple_choice,When do you usually drink coffee?,Choose all that apply.,no,Before work|Mid-morning|After lunch|Evening,,,,
Your mornings,likert,Coffee helps me focus.,,yes,Strongly disagree|Disagree|Neutral|Agree|Strongly agree,,,,
Your mornings,rating,How much do you enjoy your first cup?,,no,,,5,,
Your mornings,nps,How likely are you to recommend your usual café?,,no,,,,Not at all likely,Extremely likely
Your mornings,yes_no,Have you tried to cut down in the last year?,,no,,,,,
In your words,long_text,Tell us about your perfect cup.,,no,,,,,
`;

const truthy = (v: string) => /^(y|yes|true|1|required|x)$/i.test(v.trim());
const num = (v: string) => (v.trim() === "" || Number.isNaN(Number(v)) ? null : Number(v));
const ALIASES: Record<string, RowType> = {
  text: "short_text", short: "short_text", long: "long_text", paragraph: "long_text", open: "long_text",
  single: "single_choice", radio: "single_choice", choice: "single_choice", multiple: "multiple_choice", checkbox: "multiple_choice", checkboxes: "multiple_choice",
  select: "dropdown", scale: "rating", stars: "rating", agree: "likert", numeric: "number", boolean: "yes_no", yesno: "yes_no",
};

/** Read a questionnaire CSV. Bad rows are reported by line number and skipped. */
export function parseFormCsv(input: string): { rows: QuestionRow[]; errors: { line: number; message: string }[] } {
  const [head, ...body] = parseDelimited(input);
  const errors: { line: number; message: string }[] = [];
  if (!head) return { rows: [], errors: [{ line: 1, message: "empty" }] };
  const cols = head.map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  const at = (r: string[], name: string) => (cols.indexOf(name) >= 0 ? (r[cols.indexOf(name)] ?? "").trim() : "");
  if (!cols.includes("question")) return { rows: [], errors: [{ line: 1, message: "missingQuestionColumn" }] };
  const rows: QuestionRow[] = [];
  body.forEach((r, i) => {
    if (r.every((c) => !c.trim())) return;
    const rawType = at(r, "type").toLowerCase().replace(/[\s-]+/g, "_") || "short_text";
    const type = (ROW_TYPES as readonly string[]).includes(rawType) ? (rawType as RowType) : ALIASES[rawType];
    const parsed = questionRowSchema.safeParse({
      page: at(r, "page"),
      type,
      question: at(r, "question"),
      description: at(r, "description"),
      required: truthy(at(r, "required")),
      options: at(r, "options").split("|").map((o) => o.trim()).filter(Boolean),
      min: num(at(r, "min")),
      max: num(at(r, "max")),
      lowLabel: at(r, "low_label"),
      highLabel: at(r, "high_label"),
    });
    if (!parsed.success) errors.push({ line: i + 2, message: type ? "invalidRow" : "unknownType" });
    else if (["single_choice", "multiple_choice", "dropdown"].includes(parsed.data.type) && parsed.data.options.length < 2) errors.push({ line: i + 2, message: "needsOptions" });
    else rows.push(parsed.data);
  });
  return { rows, errors };
}

function toQuestion(row: QuestionRow): Question {
  const q = createQuestion(row.type);
  q.title = row.question;
  if (row.description) q.description = row.description;
  q.required = row.required;
  const c = q.config as Record<string, unknown>;
  const opts = row.options.map((label) => ({ id: newOptionId(), label }));
  if (["single_choice", "multiple_choice", "dropdown"].includes(row.type) && opts.length) c.options = opts;
  if (row.type === "likert" && row.options.length >= 3 && row.options.length <= 11) c.labels = row.options;
  if (row.type === "rating" && row.max) c.max = Math.min(10, Math.max(3, Math.round(row.max)));
  if (row.type === "number") {
    if (row.min !== null) c.min = row.min;
    if (row.max !== null) c.max = row.max;
  }
  if (row.type === "nps") {
    if (row.lowLabel) c.lowLabel = row.lowLabel;
    if (row.highLabel) c.highLabel = row.highLabel;
  }
  return q;
}

/** Rows to a validated form document: one page per distinct `page` value, in order of appearance. */
export function buildForm(title: string, rows: readonly QuestionRow[], description?: string): FormDoc {
  const doc = emptyForm(title);
  if (description) doc.description = description;
  const pages = new Map<string, Question[]>();
  for (const row of rows) pages.set(row.page, [...(pages.get(row.page) ?? []), toQuestion(row)]);
  doc.pages = [...pages].map(([name, questions]) => ({ id: newPageId(), shuffleQuestions: false, ...(name ? { title: name } : {}), questions }));
  if (!doc.pages.length) doc.pages = [{ id: newPageId(), shuffleQuestions: false, questions: [] }];
  return formDocSchema.parse(doc);
}

/** Turn a researcher's question ("Why do people cut down?") into one a respondent can answer. */
export function toRespondent(text: string): string {
  return text
    .trim()
    .replace(/\bpeople's\b/gi, "your")
    .replace(/\b(do|does|did|would|will|can) people\b/gi, (_, v: string) => `${v.toLowerCase() === "does" ? "do" : v} you`)
    .replace(/\bpeople\b/gi, "you")
    .replace(/\bthey\b/gi, "you")
    .replace(/\btheir\b/gi, "your")
    .replace(/\bthem\b/gi, "you")
    .replace(/^./, (c) => c.toUpperCase());
}

/**
 * The built-in questionnaire draft from a research brief: each statement becomes an agreement item,
 * each research question an open question in the respondent's voice, plus a short "about you" page.
 * A starting point to edit, never a finished instrument.
 */
export function draftFormRows(brief: { questions: { text: string }[]; statements: { text: string }[] }): QuestionRow[] {
  const agree = ["Strongly disagree", "Disagree", "Neither agree nor disagree", "Agree", "Strongly agree"];
  const base = { description: "", required: false, options: [] as string[], min: null, max: null, lowLabel: "", highLabel: "" };
  const rows: QuestionRow[] = [];
  for (const s of brief.statements) rows.push({ ...base, page: "Your views", type: "likert", question: toRespondent(s.text).replace(/\.$/, "") + ".", required: true, options: agree });
  for (const q of brief.questions) rows.push({ ...base, page: "In your own words", type: "long_text", question: toRespondent(q.text) });
  rows.push({ ...base, page: "About you", type: "single_choice", question: "How old are you?", options: ["Under 25", "25-34", "35-44", "45-54", "55 or older", "Prefer not to say"] });
  return rows;
}
