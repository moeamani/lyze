import { z } from "zod";

/**
 * A form is one validated JSON document (pages → questions, logic, settings, translations).
 * The builder edits a draft; publishing freezes an immutable snapshot that respondents answer.
 */

export const QUESTION_TYPES = [
  "short_text",
  "long_text",
  "single_choice",
  "multiple_choice",
  "dropdown",
  "rating",
  "likert",
  "nps",
  "slider",
  "number",
  "date",
  "ranking",
  "matrix",
  "yes_no",
  "file_upload",
  "media",
] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const DATA_KINDS = ["quant", "qual"] as const;
export type DataKind = (typeof DATA_KINDS)[number];

const id = z.string().min(1).max(64);
const text = (max = 500) => z.string().max(max);
const optional = (max = 500) => z.string().max(max).optional();

export const optionSchema = z.object({ id, label: text(300) });
export type Option = z.infer<typeof optionSchema>;

const base = {
  id,
  title: text(1000),
  description: optional(2000),
  required: z.boolean().default(false),
  dataKind: z.enum(DATA_KINDS),
};

const choiceConfig = {
  options: z.array(optionSchema).max(200),
  allowOther: z.boolean().default(false),
  shuffle: z.boolean().default(false),
};

export const questionSchema = z.discriminatedUnion("type", [
  z.object({
    ...base,
    type: z.literal("short_text"),
    config: z.object({
      placeholder: optional(200),
      format: z.enum(["text", "email", "url", "phone"]).default("text"),
      maxLength: z.number().int().min(1).max(5000).optional(),
    }),
  }),
  z.object({
    ...base,
    type: z.literal("long_text"),
    config: z.object({ placeholder: optional(200), maxLength: z.number().int().min(1).max(20000).optional() }),
  }),
  z.object({ ...base, type: z.literal("single_choice"), config: z.object(choiceConfig) }),
  z.object({
    ...base,
    type: z.literal("multiple_choice"),
    config: z.object({
      ...choiceConfig,
      minSelected: z.number().int().min(0).optional(),
      maxSelected: z.number().int().min(1).optional(),
    }),
  }),
  z.object({ ...base, type: z.literal("dropdown"), config: z.object({ options: choiceConfig.options, shuffle: choiceConfig.shuffle }) }),
  z.object({
    ...base,
    type: z.literal("rating"),
    config: z.object({ max: z.number().int().min(3).max(10).default(5), icon: z.enum(["star", "heart", "number"]).default("star") }),
  }),
  z.object({
    ...base,
    type: z.literal("likert"),
    config: z.object({ labels: z.array(text(100)).min(3).max(11) }),
  }),
  z.object({
    ...base,
    type: z.literal("nps"),
    config: z.object({ lowLabel: optional(100), highLabel: optional(100) }),
  }),
  z.object({
    ...base,
    type: z.literal("slider"),
    config: z.object({
      min: z.number().default(0),
      max: z.number().default(100),
      step: z.number().positive().default(1),
      minLabel: optional(100),
      maxLabel: optional(100),
    }),
  }),
  z.object({
    ...base,
    type: z.literal("number"),
    config: z.object({
      min: z.number().optional(),
      max: z.number().optional(),
      integer: z.boolean().default(false),
      unit: optional(20),
    }),
  }),
  z.object({ ...base, type: z.literal("date"), config: z.object({ includeTime: z.boolean().default(false) }) }),
  z.object({ ...base, type: z.literal("ranking"), config: z.object({ options: choiceConfig.options, shuffle: choiceConfig.shuffle }) }),
  z.object({
    ...base,
    type: z.literal("matrix"),
    config: z.object({
      rows: z.array(optionSchema).max(50),
      columns: z.array(optionSchema).max(20),
      multiple: z.boolean().default(false),
    }),
  }),
  z.object({
    ...base,
    type: z.literal("yes_no"),
    config: z.object({ yesLabel: optional(50), noLabel: optional(50) }),
  }),
  z.object({
    ...base,
    type: z.literal("file_upload"),
    config: z.object({
      accept: z.enum(["any", "image", "document"]).default("any"),
      maxFiles: z.number().int().min(1).max(10).default(1),
      maxSizeMb: z.number().int().min(1).max(50).default(10),
    }),
  }),
  z.object({
    ...base,
    type: z.literal("media"),
    config: z.object({ mediaKind: z.enum(["audio", "video"]).default("audio"), maxSeconds: z.number().int().min(10).max(600).default(120) }),
  }),
]);
export type Question = z.infer<typeof questionSchema>;
export type QuestionOf<T extends QuestionType> = Extract<Question, { type: T }>;

export const pageSchema = z.object({
  id,
  title: optional(300),
  description: optional(2000),
  shuffleQuestions: z.boolean().default(false),
  questions: z.array(questionSchema).max(200),
});
export type Page = z.infer<typeof pageSchema>;

// ── Logic ────────────────────────────────────────────────────────────────────

export const OPERATORS = [
  "equals",
  "not_equals",
  "contains",
  "not_contains",
  "gt",
  "gte",
  "lt",
  "lte",
  "answered",
  "not_answered",
] as const;
export type Operator = (typeof OPERATORS)[number];

export const conditionSchema = z.object({
  questionId: id,
  operator: z.enum(OPERATORS),
  /** Option id, number, boolean or text, depending on the question. Unused for (not_)answered. */
  value: z.union([z.string().max(500), z.number(), z.boolean()]).optional(),
});
export type Condition = z.infer<typeof conditionSchema>;

export const conditionGroupSchema = z.object({
  match: z.enum(["all", "any"]).default("all"),
  conditions: z.array(conditionSchema).min(1).max(20),
});
export type ConditionGroup = z.infer<typeof conditionGroupSchema>;

export const LOGIC_ACTIONS = ["show_question", "hide_question", "require_question", "skip_to_page", "end_form"] as const;
export type LogicActionType = (typeof LOGIC_ACTIONS)[number];

export const logicRuleSchema = z.object({
  id,
  when: conditionGroupSchema,
  action: z.enum(LOGIC_ACTIONS),
  /** Question id for show/hide/require, page id for skip_to_page. */
  target: id.optional(),
  /** end_form: mark the response as screened out (e.g. a screener disqualifies someone). */
  screenOut: z.boolean().optional(),
  message: optional(1000),
});
export type LogicRule = z.infer<typeof logicRuleSchema>;

export const quotaSchema = z.object({
  id,
  name: text(100),
  limit: z.number().int().min(1).max(1_000_000),
  when: conditionGroupSchema,
  message: optional(1000),
});
export type Quota = z.infer<typeof quotaSchema>;

// ── Settings, theme, translations ────────────────────────────────────────────

export const FORM_ACCENTS = ["violet", "sky", "emerald", "amber", "rose", "slate"] as const;
export type FormAccent = (typeof FORM_ACCENTS)[number];

export const ONE_RESPONSE_MODES = ["none", "device", "invite"] as const;
export type OneResponseMode = (typeof ONE_RESPONSE_MODES)[number];

export const settingsSchema = z.object({
  progressBar: z.boolean().default(true),
  allowResume: z.boolean().default(true),
  oneResponse: z.enum(ONE_RESPONSE_MODES).default("none"),
  captcha: z.boolean().default(false),
  showQuestionNumbers: z.boolean().default(true),
  thankYouTitle: optional(200),
  thankYouMessage: optional(2000),
  closedMessage: optional(1000),
  quotas: z.array(quotaSchema).max(50).default([]),
  defaultLanguage: z.string().min(2).max(10).default("en"),
  languages: z.array(z.string().min(2).max(10)).max(20).default([]),
  theme: z
    .object({
      accent: z.enum(FORM_ACCENTS).default("violet"),
      background: z.enum(["plain", "tinted"]).default("tinted"),
      corners: z.enum(["soft", "round", "square"]).default("round"),
    })
    .default({ accent: "violet", background: "tinted", corners: "round" }),
});
export type FormSettings = z.infer<typeof settingsSchema>;

export const UI_LABEL_KEYS = ["start", "next", "back", "submit", "required", "other", "saveLater", "chooseFile", "record", "stop"] as const;
export type UiLabelKey = (typeof UI_LABEL_KEYS)[number];

const questionTranslationSchema = z.object({
  title: optional(1000),
  description: optional(2000),
  placeholder: optional(200),
  options: z.record(z.string(), z.string().max(300)).optional(),
  rows: z.record(z.string(), z.string().max(300)).optional(),
  columns: z.record(z.string(), z.string().max(300)).optional(),
  labels: z.array(z.string().max(100)).optional(),
  lowLabel: optional(100),
  highLabel: optional(100),
});
export type QuestionTranslation = z.infer<typeof questionTranslationSchema>;

export const translationSchema = z.object({
  title: optional(300),
  description: optional(2000),
  thankYouTitle: optional(200),
  thankYouMessage: optional(2000),
  pages: z.record(z.string(), z.object({ title: optional(300), description: optional(2000) })).default({}),
  questions: z.record(z.string(), questionTranslationSchema).default({}),
  ui: z.partialRecord(z.enum(UI_LABEL_KEYS), z.string().max(60)).default({}),
});
export type Translation = z.infer<typeof translationSchema>;

export const formDocSchema = z.object({
  version: z.literal(1),
  title: text(300),
  description: optional(4000),
  pages: z.array(pageSchema).min(1).max(50),
  logic: z.array(logicRuleSchema).max(300).default([]),
  settings: settingsSchema,
  translations: z.record(z.string(), translationSchema).default({}),
});
export type FormDoc = z.infer<typeof formDocSchema>;
export type FormDocInput = z.input<typeof formDocSchema>;

export { allQuestions, findQuestion, pageIndexOfQuestion } from "./doc";
