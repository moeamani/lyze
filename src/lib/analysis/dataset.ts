import type { Answers } from "@/lib/forms/answers";
import { evaluateGroup } from "@/lib/forms/logic";
import type { ConditionGroup, FormDoc, Question } from "@/lib/forms/schema";
import type { AnalysisSettings, Computed, Recode } from "./settings";
import { META_VARIABLES, buildQuestionVariables, metaValues, rowValues, type ResponseMeta, type Value, type ValueRow, type Variable } from "./variables";

export type SourceResponse = ResponseMeta & { answers: Answers };

export type DatasetRow = { id: string; meta: ResponseMeta; answers: Answers; values: ValueRow };

export type Dataset = {
  variables: Variable[];
  byId: Map<string, Variable>;
  rows: DatasetRow[];
  questions: Map<string, { question: Question; number: number }>;
  /** Newest published version (for logic-aware filtering). */
  doc: FormDoc | null;
  /** What the cleaning rules removed, for transparency. */
  excluded: { status: number; speeders: number; manual: number };
};

/** Turn stored responses into an analysis-ready dataset, applying the study's cleaning rules. */
export function buildDataset(docs: readonly FormDoc[], responses: readonly SourceResponse[], settings: AnalysisSettings): Dataset {
  const { variables: questionVars, questions } = buildQuestionVariables(docs);
  const excluded = { status: 0, speeders: 0, manual: 0 };
  const manual = new Set(settings.excludedIds);

  const kept = responses.filter((r) => {
    if (manual.has(r.id)) return void excluded.manual++, false;
    const statusOk =
      r.status === "complete" || (r.status === "partial" && settings.includePartial) || ((r.status === "screened_out" || r.status === "over_quota") && settings.includeScreenedOut);
    if (!statusOk) return void excluded.status++, false;
    if (settings.minDurationSec !== null && r.status === "complete" && r.durationMs !== null && r.durationMs / 1000 < settings.minDurationSec) {
      return void excluded.speeders++, false;
    }
    return true;
  });

  const rows: DatasetRow[] = kept.map((r) => ({
    id: r.id,
    meta: r,
    answers: r.answers,
    values: { ...metaValues(r), ...rowValues(questions, r.answers) },
  }));

  const variables: Variable[] = [...META_VARIABLES, ...questionVars];
  const byId = new Map(variables.map((v) => [v.id, v]));
  const usedNames = new Set(variables.map((v) => v.name.toLowerCase()));

  for (const recode of settings.recodes) {
    const source = byId.get(recode.source);
    if (!source || source.type !== "numeric" || usedNames.has(recode.name.toLowerCase())) continue;
    const v = recodeVariable(recode, source);
    usedNames.add(v.name.toLowerCase());
    variables.push(v);
    byId.set(v.id, v);
    for (const row of rows) row.values[v.id] = applyRecode(recode, source, row.values[source.id] ?? null, rows);
  }

  for (const c of settings.computed) {
    const sources = c.sources.map((id) => byId.get(id)).filter((v): v is Variable => !!v && v.type === "numeric");
    if (sources.length < 2 || usedNames.has(c.name.toLowerCase())) continue;
    const v: Variable = { id: `computed:${c.id}`, name: c.name, label: c.label || c.name, type: "numeric", measure: "scale", role: "computed" };
    usedNames.add(c.name.toLowerCase());
    variables.push(v);
    byId.set(v.id, v);
    const ranges = new Map(sources.map((s) => [s.id, rangeOf(s, rows)]));
    for (const row of rows) row.values[v.id] = computeScore(c, sources, ranges, row.values);
  }

  return { variables, byId, rows, questions, doc: docs[0] ?? null, excluded };
}

function rangeOf(v: Variable, rows: readonly DatasetRow[]): [number, number] | null {
  if (v.range) return v.range;
  if (v.categories?.length) {
    const vals = v.categories.map((c) => c.value).filter((x) => x !== 99);
    return [Math.min(...vals), Math.max(...vals)];
  }
  const nums = rows.map((r) => r.values[v.id]).filter((x): x is number => typeof x === "number");
  return nums.length ? [Math.min(...nums), Math.max(...nums)] : null;
}

function recodeVariable(recode: Recode, source: Variable): Variable {
  const base = { id: `recode:${recode.id}`, name: recode.name, label: recode.label || recode.name, type: "numeric" as const, role: "recode" as const };
  switch (recode.mode) {
    case "group":
      return { ...base, measure: "ordinal", categories: recode.groups.map((g, i) => ({ value: i + 1, label: g.label })) };
    case "reverse":
      return {
        ...base,
        measure: source.measure,
        range: source.range,
        // A reversed answer keeps its label: "Strongly agree" (5) becomes 1 on a 1–5 scale.
        categories: source.categories && source.range
          ? source.categories
              .filter((c) => c.value !== 99)
              .map((c) => ({ value: source.range![0] + source.range![1] - c.value, label: c.label }))
              .sort((a, b) => a.value - b.value)
          : undefined,
      };
    case "bins": {
      const edges = [...recode.edges].sort((a, b) => a - b);
      return {
        ...base,
        measure: "ordinal",
        categories: edges.map((e, i) => ({ value: i + 1, label: i < edges.length - 1 ? `${fmt(e)}–${fmt(edges[i + 1]! - (Number.isInteger(e) && Number.isInteger(edges[i + 1]!) ? 1 : 0))}` : `${fmt(e)}+` })),
      };
    }
  }
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, ""));

function applyRecode(recode: Recode, source: Variable, value: Value, rows: readonly DatasetRow[]): Value {
  if (typeof value !== "number") return null;
  switch (recode.mode) {
    case "group": {
      const i = recode.groups.findIndex((g) => g.values.includes(value));
      return i >= 0 ? i + 1 : null;
    }
    case "reverse": {
      if (value === 99) return null;
      const range = rangeOf(source, rows);
      return range ? range[0] + range[1] - value : null;
    }
    case "bins": {
      const edges = [...recode.edges].sort((a, b) => a - b);
      let bin = -1;
      for (let i = 0; i < edges.length; i++) if (value >= edges[i]!) bin = i;
      return bin >= 0 ? bin + 1 : null;
    }
  }
}

function computeScore(c: Computed, sources: Variable[], ranges: Map<string, [number, number] | null>, values: ValueRow): number | null {
  const reverse = new Set(c.reverse);
  const items: number[] = [];
  for (const s of sources) {
    const v = values[s.id];
    if (typeof v !== "number" || v === 99) continue;
    const r = ranges.get(s.id);
    items.push(reverse.has(s.id) && r ? r[0] + r[1] - v : v);
  }
  const needed = c.op === "sum" ? sources.length : (c.minValid ?? sources.length);
  if (items.length < needed || items.length === 0) return null;
  const sum = items.reduce((a, b) => a + b, 0);
  return c.op === "sum" ? sum : sum / items.length;
}

// ── Slicing ─────────────────────────────────────────────────────────────────

/** Keep rows matching a segment filter (same condition language as form logic). */
export function filterRows(dataset: Dataset, filter: ConditionGroup | null): DatasetRow[] {
  if (!filter || !dataset.doc || filter.conditions.length === 0) return dataset.rows;
  // Conditions may reference questions from older versions; evaluate against every known question.
  const pages = [{ id: "all", shuffleQuestions: false, questions: [...dataset.questions.values()].map((q) => q.question) }];
  return dataset.rows.filter((r) => evaluateGroup(filter, { pages }, r.answers));
}

export function column(rows: readonly DatasetRow[], variableId: string): Value[] {
  return rows.map((r) => r.values[variableId] ?? null);
}

export function numericColumn(rows: readonly DatasetRow[], variableId: string): (number | null)[] {
  return rows.map((r) => {
    const v = r.values[variableId];
    return typeof v === "number" && v !== 99 ? v : null;
  });
}

/** Split rows by the categories of a grouping variable (in category order). */
export function groupRows(rows: readonly DatasetRow[], groupBy: Variable): { category: { value: number; label: string }; rows: DatasetRow[] }[] {
  const cats = groupBy.categories ?? [];
  return cats.map((category) => ({ category, rows: rows.filter((r) => r.values[groupBy.id] === category.value) }));
}

/** Variables that can split data into groups or act as crosstab dimensions. */
export function isCategorical(v: Variable): boolean {
  return v.type === "numeric" && !!v.categories?.length && v.measure !== "scale";
}

/** Variables usable as numeric outcomes (scales, ordinal scales, computed scores). */
export function isNumeric(v: Variable): boolean {
  if (v.type !== "numeric") return false;
  if (v.role === "meta") return v.id === "meta:duration";
  return v.measure === "scale" || v.measure === "ordinal";
}
