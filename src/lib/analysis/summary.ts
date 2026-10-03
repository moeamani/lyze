import { boxStats, frequencies, histogram, nps as npsScore, summarize, type Bin, type BoxStats, type Summary } from "@/lib/stats/descriptive";
import type { Question } from "@/lib/forms/schema";
import { column, numericColumn, type DatasetRow } from "./dataset";
import { wordFrequencies, type WordCount } from "./text";
import { OTHER_CODE, questionVariables, type Variable } from "./variables";

/**
 * One summary per question, shaped for the chart that suits it: frequencies for choices,
 * distributions + descriptives for scales, rank averages for rankings, per-row distributions
 * for grids and word counts for open text.
 */

export type CategoryCount = { value: number; label: string; count: number; percent: number };

export type QuestionSummary =
  | { kind: "choice"; answered: number; total: number; categories: CategoryCount[]; otherTexts: string[] }
  | { kind: "multi"; answered: number; total: number; categories: CategoryCount[]; otherTexts: string[] }
  | {
      kind: "scale";
      answered: number;
      total: number;
      stats: Summary;
      /** Distribution over each possible point (Likert/rating) or histogram bins (numbers). */
      categories: CategoryCount[] | null;
      bins: Bin[] | null;
      box: BoxStats | null;
      nps: ReturnType<typeof npsScore> | null;
    }
  | { kind: "ranking"; answered: number; total: number; items: { label: string; meanRank: number; firstPercent: number }[] }
  | { kind: "matrix"; answered: number; total: number; columns: string[]; rows: { label: string; counts: number[]; percents: number[]; mean: number | null; n: number }[]; multiple: boolean }
  | { kind: "text"; answered: number; total: number; recent: string[]; words: WordCount[]; avgWords: number }
  | { kind: "date"; answered: number; total: number; earliest: string | null; latest: string | null; byMonth: { month: string; count: number }[] }
  | { kind: "files"; answered: number; total: number; files: number };

const pct = (n: number, d: number) => (d ? (n / d) * 100 : 0);

export function summarizeQuestion(question: Question, number: number, rows: readonly DatasetRow[]): QuestionSummary {
  const vars = questionVariables(question, number);
  const main = vars[0]!;
  const total = rows.length;
  const answeredRows = rows.filter((r) => r.answers[question.id] !== undefined);
  const answered = answeredRows.length;

  switch (question.type) {
    case "single_choice":
    case "dropdown":
    case "yes_no": {
      const cats = main.categories ?? [];
      const values = column(rows, main.id).map((v) => (v === null ? null : String(v)));
      const f = frequencies(values, cats.map((c) => String(c.value)));
      const categories = f.rows.map((r) => {
        const c = cats.find((x) => String(x.value) === r.key);
        return { value: Number(r.key), label: c?.label ?? r.key, count: r.count, percent: r.percent };
      });
      return { kind: "choice", answered: f.valid, total, categories, otherTexts: otherTexts(rows, vars) };
    }
    case "multiple_choice": {
      const dummies = vars.filter((v) => v.type === "numeric");
      const categories = dummies.map((v, i) => {
        const count = rows.filter((r) => r.values[v.id] === 1).length;
        return { value: v.id.endsWith(":__other__") ? OTHER_CODE : i + 1, label: v.label.split(" — ").at(-1)!, count, percent: pct(count, answered) };
      });
      return { kind: "multi", answered, total, categories, otherTexts: otherTexts(rows, vars) };
    }
    case "rating":
    case "likert":
    case "nps":
    case "slider":
    case "number": {
      const xs = numericColumn(rows, main.id).filter((x): x is number => x !== null);
      const stats = summarize(xs);
      let categories: CategoryCount[] | null = null;
      let bins: Bin[] | null = null;
      if (main.categories) {
        categories = main.categories.map((c) => {
          const count = xs.filter((x) => x === c.value).length;
          return { value: c.value, label: c.label, count, percent: pct(count, xs.length) };
        });
      } else if (question.type === "nps") {
        categories = Array.from({ length: 11 }, (_, i) => {
          const count = xs.filter((x) => x === i).length;
          return { value: i, label: String(i), count, percent: pct(count, xs.length) };
        });
      } else {
        bins = histogram(xs);
      }
      return { kind: "scale", answered: xs.length, total, stats, categories, bins, box: boxStats(xs), nps: question.type === "nps" ? npsScore(xs) : null };
    }
    case "ranking": {
      const items = vars.map((v) => {
        const ranks = numericColumn(rows, v.id).filter((x): x is number => x !== null);
        const label = v.label.replace(/^.* — rank of /, "");
        return { label, meanRank: ranks.length ? ranks.reduce((a, b) => a + b, 0) / ranks.length : 0, firstPercent: pct(ranks.filter((x) => x === 1).length, ranks.length) };
      });
      return { kind: "ranking", answered, total, items: items.sort((a, b) => a.meanRank - b.meanRank) };
    }
    case "matrix": {
      const columns = question.config.columns.map((c) => c.label);
      const matrixRows = question.config.rows.map((row, i) => {
        if (!question.config.multiple) {
          const v = vars[i]!;
          const xs = numericColumn(rows, v.id).filter((x): x is number => x !== null);
          const counts = question.config.columns.map((_, j) => xs.filter((x) => x === j + 1).length);
          return { label: row.label, counts, percents: counts.map((c) => pct(c, xs.length)), mean: xs.length ? summarize(xs).mean : null, n: xs.length };
        }
        const counts = question.config.columns.map((c) => rows.filter((r) => r.values[`${question.id}:${row.id}:${c.id}`] === 1).length);
        return { label: row.label, counts, percents: counts.map((c) => pct(c, answered)), mean: null, n: answered };
      });
      return { kind: "matrix", answered, total, columns, rows: matrixRows, multiple: question.config.multiple };
    }
    case "short_text":
    case "long_text": {
      const texts = answeredRows
        .map((r) => ({ text: r.answers[question.id] as string, at: r.meta.submittedAt ?? r.meta.startedAt }))
        .sort((a, b) => b.at.getTime() - a.at.getTime())
        .map((x) => x.text);
      const totalWords = texts.reduce((a, t) => a + t.split(/\s+/).filter(Boolean).length, 0);
      return { kind: "text", answered, total, recent: texts.slice(0, 50), words: wordFrequencies(texts), avgWords: texts.length ? totalWords / texts.length : 0 };
    }
    case "date": {
      const dates = answeredRows.map((r) => r.answers[question.id] as string).sort();
      const byMonth = new Map<string, number>();
      for (const d of dates) byMonth.set(d.slice(0, 7), (byMonth.get(d.slice(0, 7)) ?? 0) + 1);
      return { kind: "date", answered, total, earliest: dates[0] ?? null, latest: dates.at(-1) ?? null, byMonth: [...byMonth].map(([month, count]) => ({ month, count })) };
    }
    case "file_upload":
    case "media": {
      const files = numericColumn(rows, main.id).reduce<number>((a, b) => a + (b ?? 0), 0);
      return { kind: "files", answered, total, files };
    }
  }
}

function otherTexts(rows: readonly DatasetRow[], vars: Variable[]): string[] {
  const textVar = vars.find((v) => v.type === "string");
  if (!textVar) return [];
  return column(rows, textVar.id).filter((v): v is string => typeof v === "string" && v.trim().length > 0);
}

/** Responses per day (for the "responses over time" chart). */
export function responsesOverTime(rows: readonly DatasetRow[]): { day: string; count: number }[] {
  const map = new Map<string, number>();
  for (const r of rows) {
    const d = (r.meta.submittedAt ?? r.meta.startedAt).toISOString().slice(0, 10);
    map.set(d, (map.get(d) ?? 0) + 1);
  }
  const days = [...map.keys()].sort();
  if (!days.length) return [];
  // Fill gaps so the line doesn't skip empty days.
  const out: { day: string; count: number }[] = [];
  for (let d = new Date(days[0]!); d.toISOString().slice(0, 10) <= days.at(-1)!; d.setUTCDate(d.getUTCDate() + 1)) {
    const key = d.toISOString().slice(0, 10);
    out.push({ day: key, count: map.get(key) ?? 0 });
    if (out.length > 3660) break;
  }
  return out;
}
