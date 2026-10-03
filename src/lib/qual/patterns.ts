import { chiSquareIndependence, fisherExact2x2, kruskalWallis, mannWhitney, oneWayAnova } from "@/lib/stats/tests";

/**
 * Patterns across interviews: how often codes come up for different kinds of participants, which
 * codes travel together, and how far two coders agree. Interviews rarely have many people, so the
 * defaults are tests that hold up with small groups.
 */

export type Person = { id: string; code: string; attributes: Record<string, string> };
/** One approved coding on a participant's turn. */
export type Coding = { codeId: string; participantId: string | null; unitId: string; coderId: string | null };
export type CodeInfo = { id: string; name: string; color: string; parentId: string | null };

export type Measure = "presence" | "count";
export type CountTest = "nonparametric" | "anova";

export type GroupTest = {
  name: "chi-square" | "fisher" | "kruskal-wallis" | "mann-whitney" | "anova";
  statistic: number | null;
  df: number | null;
  p: number;
  /** Holm-adjusted across all codes compared, to account for running many tests. */
  pAdjusted: number;
  /** Expected counts under 5 (chi-square) or tiny groups (ANOVA): read with care. */
  caution: boolean;
};

export type GroupRow = {
  code: CodeInfo;
  cells: { people: number; passages: number; share: number; mean: number }[];
  test: GroupTest | null;
};

export type GroupComparison = {
  attribute: string;
  groups: { value: string; n: number }[];
  /** People without a value for the attribute, left out. */
  missing: number;
  measure: Measure;
  rows: GroupRow[];
};

/** Attribute names present on at least two people with at least two different values. */
export function comparableAttributes(people: Person[]): string[] {
  const values = new Map<string, Set<string>>();
  for (const p of people) for (const [k, v] of Object.entries(p.attributes)) if (v.trim()) (values.get(k) ?? values.set(k, new Set()).get(k)!).add(v.trim());
  return [...values].filter(([, vs]) => vs.size >= 2).map(([k]) => k).sort((a, b) => a.localeCompare(b));
}

/** Holm–Bonferroni adjusted p-values (same order as given). */
export function holm(ps: number[]): number[] {
  const order = ps.map((p, i) => [p, i] as const).sort((a, b) => a[0] - b[0]);
  const out = Array<number>(ps.length).fill(1);
  let running = 0;
  order.forEach(([p, i], rank) => {
    running = Math.max(running, Math.min(1, (ps.length - rank) * p));
    out[i] = running;
  });
  return out;
}

/** Codes × groups of one attribute, with a test per code. */
export function compareGroups(people: Person[], codings: Coding[], codes: CodeInfo[], attribute: string, measure: Measure = "presence", countTest: CountTest = "nonparametric"): GroupComparison {
  const withValue = people.filter((p) => p.attributes[attribute]?.trim());
  const values = [...new Set(withValue.map((p) => p.attributes[attribute]!.trim()))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const members = values.map((v) => withValue.filter((p) => p.attributes[attribute]!.trim() === v));
  // Passages per person per code.
  const tally = new Map<string, Map<string, number>>();
  for (const c of codings) {
    if (!c.participantId) continue;
    const m = tally.get(c.codeId) ?? tally.set(c.codeId, new Map()).get(c.codeId)!;
    m.set(c.participantId, (m.get(c.participantId) ?? 0) + 1);
  }
  const used = codes.filter((c) => tally.has(c.id));
  const rows: GroupRow[] = used.map((code) => {
    const per = tally.get(code.id)!;
    const counts = members.map((g) => g.map((p) => per.get(p.id) ?? 0));
    const cells = counts.map((xs) => {
      const people = xs.filter((x) => x > 0).length;
      const passages = xs.reduce((a, b) => a + b, 0);
      return { people, passages, share: xs.length ? people / xs.length : 0, mean: xs.length ? passages / xs.length : 0 };
    });
    return { code, cells, test: values.length >= 2 ? testFor(measure, countTest, counts) : null };
  });
  const adjusted = holm(rows.map((r) => r.test?.p ?? 1));
  rows.forEach((r, i) => {
    if (r.test) r.test.pAdjusted = adjusted[i]!;
  });
  return { attribute, groups: values.map((value, i) => ({ value, n: members[i]!.length })), missing: people.length - withValue.length, measure, rows };
}

function testFor(measure: Measure, countTest: CountTest, counts: number[][]): GroupTest | null {
  if (measure === "presence") {
    const table = counts.map((xs) => [xs.filter((x) => x > 0).length, xs.filter((x) => x === 0).length]);
    const result = chiSquareIndependence(table);
    if (table.length === 2) {
      const [[a, b], [c, d]] = table as [[number, number], [number, number]];
      // Small samples: Fisher's exact test instead of the chi-square approximation.
      if (!result || result.expected.flat().some((e) => e < 5)) return { name: "fisher", statistic: null, df: null, p: fisherExact2x2(a, b, c, d), pAdjusted: 1, caution: false };
    }
    if (!result) return null;
    return { name: "chi-square", statistic: result.chi2, df: result.df, p: result.p, pAdjusted: 1, caution: result.expected.flat().some((e) => e < 5) };
  }
  if (countTest === "anova") {
    const r = oneWayAnova(counts);
    if (!r) return null;
    return { name: "anova", statistic: r.f, df: r.df1, p: r.p, pAdjusted: 1, caution: counts.some((g) => g.length < 10) };
  }
  if (counts.length === 2) {
    const r = mannWhitney(counts[0]!, counts[1]!);
    return r ? { name: "mann-whitney", statistic: r.u, df: null, p: r.p, pAdjusted: 1, caution: false } : null;
  }
  const r = kruskalWallis(counts);
  return r ? { name: "kruskal-wallis", statistic: r.h, df: r.df, p: r.p, pAdjusted: 1, caution: counts.some((g) => g.length < 5) } : null;
}

export type CoPair = { a: CodeInfo; b: CodeInfo; together: number; jaccard: number };

/** Codes applied to the same passage (turn), most frequent pairs first. */
export function cooccurrence(codings: Coding[], codes: CodeInfo[], limit = 30): { pairs: CoPair[]; units: Map<string, number> } {
  const byUnit = new Map<string, Set<string>>();
  for (const c of codings) (byUnit.get(c.unitId) ?? byUnit.set(c.unitId, new Set()).get(c.unitId)!).add(c.codeId);
  const unitsPerCode = new Map<string, number>();
  const pairCount = new Map<string, number>();
  for (const set of byUnit.values()) {
    const ids = [...set].sort();
    for (const id of ids) unitsPerCode.set(id, (unitsPerCode.get(id) ?? 0) + 1);
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) pairCount.set(`${ids[i]}|${ids[j]}`, (pairCount.get(`${ids[i]}|${ids[j]}`) ?? 0) + 1);
  }
  const byId = new Map(codes.map((c) => [c.id, c]));
  const pairs = [...pairCount]
    .map(([key, together]) => {
      const [x, y] = key.split("|") as [string, string];
      const union = unitsPerCode.get(x)! + unitsPerCode.get(y)! - together;
      return { a: byId.get(x)!, b: byId.get(y)!, together, jaccard: union ? together / union : 0 };
    })
    .filter((p) => p.a && p.b)
    .sort((p, q) => q.together - p.together || q.jaccard - p.jaccard)
    .slice(0, limit);
  return { pairs, units: unitsPerCode };
}

export type KappaRow = { code: CodeInfo; both: number; onlyA: number; onlyB: number; neither: number; agreement: number; kappa: number | null };

/** Cohen's kappa for one 2×2 table (both / only A / only B / neither). Null when undefined (no variation). */
export function cohenKappa(both: number, onlyA: number, onlyB: number, neither: number): number | null {
  const n = both + onlyA + onlyB + neither;
  if (!n) return null;
  const po = (both + neither) / n;
  const pe = ((both + onlyA) / n) * ((both + onlyB) / n) + ((onlyB + neither) / n) * ((onlyA + neither) / n);
  return pe === 1 ? null : (po - pe) / (1 - pe);
}

/** Landis & Koch's labels for kappa. */
export function kappaLabel(k: number): "poor" | "slight" | "fair" | "moderate" | "substantial" | "almostPerfect" {
  return k < 0 ? "poor" : k <= 0.2 ? "slight" : k <= 0.4 ? "fair" : k <= 0.6 ? "moderate" : k <= 0.8 ? "substantial" : "almostPerfect";
}

/**
 * Agreement between two coders over the passages both looked at (`units`: every turn in the
 * transcripts both coded), per code and pooled across codes.
 */
export function coderAgreement(codings: Coding[], codes: CodeInfo[], coderA: string, coderB: string, units: string[]): { rows: KappaRow[]; pooled: KappaRow | null; units: number } {
  const unitSet = new Set(units);
  const has = (coder: string) => {
    const m = new Map<string, Set<string>>();
    for (const c of codings) if (c.coderId === coder && unitSet.has(c.unitId)) (m.get(c.codeId) ?? m.set(c.codeId, new Set()).get(c.codeId)!).add(c.unitId);
    return m;
  };
  const a = has(coderA);
  const b = has(coderB);
  const rows: KappaRow[] = codes
    .filter((c) => a.has(c.id) || b.has(c.id))
    .map((code) => {
      const sa = a.get(code.id) ?? new Set<string>();
      const sb = b.get(code.id) ?? new Set<string>();
      let both = 0;
      let onlyA = 0;
      let onlyB = 0;
      for (const u of unitSet) {
        const x = sa.has(u);
        const y = sb.has(u);
        if (x && y) both++;
        else if (x) onlyA++;
        else if (y) onlyB++;
      }
      const neither = unitSet.size - both - onlyA - onlyB;
      return { code, both, onlyA, onlyB, neither, agreement: unitSet.size ? (both + neither) / unitSet.size : 0, kappa: cohenKappa(both, onlyA, onlyB, neither) };
    });
  if (!rows.length) return { rows, pooled: null, units: unitSet.size };
  const sum = (k: "both" | "onlyA" | "onlyB" | "neither") => rows.reduce((s, r) => s + r[k], 0);
  const [bo, oa, ob, ne] = [sum("both"), sum("onlyA"), sum("onlyB"), sum("neither")];
  const pooled: KappaRow = { code: { id: "*", name: "", color: "1", parentId: null }, both: bo, onlyA: oa, onlyB: ob, neither: ne, agreement: (bo + ne) / (bo + oa + ob + ne), kappa: cohenKappa(bo, oa, ob, ne) };
  return { rows, pooled, units: unitSet.size };
}

/** Participant × code counts as CSV (one row per person, attributes then one column per code). */
export function caseCodeCsv(people: Person[], codings: Coding[], codes: CodeInfo[]): string {
  const attrs = [...new Set(people.flatMap((p) => Object.keys(p.attributes)))].sort();
  const used = codes.filter((c) => codings.some((x) => x.codeId === c.id && x.participantId));
  const q = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const count = new Map<string, number>();
  for (const c of codings) if (c.participantId) count.set(`${c.participantId}|${c.codeId}`, (count.get(`${c.participantId}|${c.codeId}`) ?? 0) + 1);
  const head = ["participant", ...attrs, ...used.map((c) => c.name)].map(q).join(",");
  const lines = people.map((p) => [p.code, ...attrs.map((a) => p.attributes[a] ?? ""), ...used.map((c) => String(count.get(`${p.id}|${c.id}`) ?? 0))].map(q).join(","));
  return [head, ...lines].join("\n");
}
