import { OTHER, validateAnswer, type AnswerValue, type Answers } from "@/lib/forms/answers";
import type { Question } from "@/lib/forms/schema";
import { parseDelimited } from "@/lib/interviews/participants";

/** Small seeded PRNG (mulberry32) so generated test data is reproducible. */
export function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TEXTS = [
  "It depends on the day, honestly.",
  "Mostly fine, but the mornings are rushed.",
  "I like it more than I expected to.",
  "Hard to say. Some weeks it matters a lot, some weeks not at all.",
  "Price is the main thing for me.",
  "I'd change the timing if I could.",
  "It helps me get started.",
  "Not much to add, it works for me.",
  "Too slow when it's busy.",
  "My partner and I do it together, so it's a habit now.",
  "I've cut back a bit since last year.",
  "Quiet, and nobody needs anything from me for ten minutes.",
];

const pick = <T,>(xs: readonly T[], r: () => number) => xs[Math.floor(r() * xs.length)]!;
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(x)));

/**
 * Plausible answers for test data. Each fake respondent has a "mood" that nudges every scale the
 * same way, so scales correlate a little like real data does. Clearly labelled as generated wherever shown.
 */
export function fakeAnswers(questions: readonly Question[], r: () => number): Answers {
  const mood = r() * 2 - 1;
  const out: Answers = {};
  for (const q of questions) {
    if (!q.required && r() < 0.15) continue;
    const scale = (lo: number, hi: number) => clamp(lo + ((hi - lo) * (0.5 + mood * 0.3)) + (r() - 0.5) * (hi - lo) * 0.6, lo, hi);
    let v: AnswerValue | undefined;
    switch (q.type) {
      case "short_text":
        v = q.config.format === "email" ? `test${Math.floor(r() * 1e5)}@example.com` : pick(["Yes", "Not really", "Sometimes", "Berlin", "Tehran", "Toronto"], r);
        break;
      case "long_text":
        v = pick(TEXTS, r);
        break;
      case "single_choice":
      case "dropdown":
        v = { choice: pick(q.config.options, r).id };
        break;
      case "multiple_choice": {
        const chosen = q.config.options.filter(() => r() < 0.4).map((o) => o.id);
        v = { choices: chosen.length ? chosen : [pick(q.config.options, r).id] };
        break;
      }
      case "rating":
        v = scale(1, q.config.max);
        break;
      case "likert":
        v = scale(1, q.config.labels.length);
        break;
      case "nps":
        v = scale(0, 10);
        break;
      case "slider":
        v = scale(q.config.min, q.config.max);
        break;
      case "number": {
        const lo = q.config.min ?? 0;
        const hi = q.config.max ?? lo + 10;
        v = clamp(lo + r() * (hi - lo) * 0.6, lo, hi);
        break;
      }
      case "yes_no":
        v = r() < 0.5 + mood * 0.2;
        break;
      case "date":
        v = new Date(Date.now() - Math.floor(r() * 365) * 864e5).toISOString().slice(0, 10);
        break;
      case "ranking":
        v = [...q.config.options].sort(() => r() - 0.5).map((o) => o.id);
        break;
      case "matrix":
        v = Object.fromEntries(q.config.rows.map((row) => [row.id, q.config.multiple ? [pick(q.config.columns, r).id] : pick(q.config.columns, r).id]));
        break;
      default:
        v = undefined;
    }
    if (v === undefined) continue;
    const checked = validateAnswer(q, v, false);
    if (checked.ok && checked.value !== undefined) out[q.id] = checked.value;
  }
  return out;
}

const CSV_TYPES = new Set(["short_text", "long_text", "single_choice", "dropdown", "multiple_choice", "rating", "likert", "nps", "slider", "number", "yes_no", "date", "ranking"]);
export const csvQuestions = (qs: readonly Question[]) => qs.filter((q) => CSV_TYPES.has(q.type));

/** How an answer is written in a responses CSV: option labels, "|" between several. */
export function answerToCell(q: Question, v: AnswerValue | undefined): string {
  if (v === undefined) return "";
  const label = (id: string) => ("options" in q.config ? q.config.options.find((o) => o.id === id)?.label : undefined) ?? id;
  if (q.type === "yes_no") return v ? "yes" : "no";
  const o = (typeof v === "object" && v && !Array.isArray(v) ? v : {}) as { choice?: string; other?: string; choices?: string[] };
  if (typeof o.choice === "string") return o.choice === OTHER ? (o.other ?? "") : label(o.choice);
  if (Array.isArray(o.choices)) return o.choices.map(label).join("|");
  if (q.type === "ranking" && Array.isArray(v)) return v.map(label).join("|");
  if (q.type === "likert" && typeof v === "number") return q.config.labels[v - 1] ?? String(v);
  return String(v);
}

/** Example file for uploading responses to this form: its own questions as columns, two made-up rows. */
export function responsesCsvExample(questions: readonly Question[]): string {
  const qs = csvQuestions(questions);
  const r = seeded(7);
  const cell = (s: string) => (/[",\n|]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const rows = [0, 1].map(() => {
    const a = fakeAnswers(qs, r);
    return qs.map((q) => cell(answerToCell(q, a[q.id]))).join(",");
  });
  return [qs.map((q) => cell(q.title)).join(","), ...rows].join("\n") + "\n";
}

function cellToAnswer(q: Question, raw: string): AnswerValue | undefined | "bad" {
  const s = raw.trim();
  if (!s) return undefined;
  const byLabel = (x: string) => ("options" in q.config ? q.config.options.find((o) => o.label.toLowerCase() === x.trim().toLowerCase() || o.id === x.trim())?.id : undefined);
  const n = Number(s.replace(",", "."));
  switch (q.type) {
    case "short_text":
    case "long_text":
    case "date":
      return s;
    case "single_choice":
    case "dropdown": {
      const id = byLabel(s);
      if (id) return { choice: id };
      return q.type === "single_choice" && q.config.allowOther ? { choice: OTHER, other: s } : "bad";
    }
    case "multiple_choice": {
      const ids = s.split(/[|;]/).map(byLabel);
      return ids.every(Boolean) ? { choices: ids as string[] } : "bad";
    }
    case "ranking": {
      const ids = s.split(/[|;]/).map(byLabel);
      return ids.every(Boolean) ? (ids as string[]) : "bad";
    }
    case "likert": {
      const i = q.config.labels.findIndex((l) => l.toLowerCase() === s.toLowerCase());
      return i >= 0 ? i + 1 : Number.isFinite(n) ? n : "bad";
    }
    case "yes_no":
      return /^(y|yes|true|1|بله|آری)$/i.test(s) ? true : /^(n|no|false|0|خیر|نه)$/i.test(s) ? false : "bad";
    default:
      return Number.isFinite(n) ? n : "bad";
  }
}

/**
 * Read responses from a spreadsheet. Columns match questions by title (or id, or Q1, Q2… by
 * position). Every value is checked like a real submission; problems are reported per cell.
 */
export function parseResponsesCsv(input: string, questions: readonly Question[]) {
  const qs = csvQuestions(questions);
  const [head, ...body] = parseDelimited(input);
  const errors: { line: number; column: string; message: string }[] = [];
  if (!head) return { rows: [] as Answers[], matched: [] as string[], unmatched: [] as string[], errors };
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  const cols = head.map((h) => {
    const k = norm(h);
    const qn = /^q(\d+)$/.exec(k);
    return qs.find((q) => norm(q.title) === k || q.id === h.trim()) ?? (qn ? qs[Number(qn[1]) - 1] : undefined);
  });
  const rows: Answers[] = [];
  body.forEach((r, i) => {
    if (r.every((c) => !c.trim())) return;
    const answers: Answers = {};
    cols.forEach((q, c) => {
      if (!q) return;
      const v = cellToAnswer(q, r[c] ?? "");
      if (v === undefined) return;
      const checked = v === "bad" ? null : validateAnswer(q, v, false);
      if (!checked?.ok) errors.push({ line: i + 2, column: head[c]!, message: "invalidValue" });
      else if (checked.value !== undefined) answers[q.id] = checked.value;
    });
    if (Object.keys(answers).length) rows.push(answers);
  });
  return { rows, matched: cols.filter(Boolean).map((q) => q!.title), unmatched: head.filter((_, c) => !cols[c]), errors };
}
