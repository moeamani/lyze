import { chiSquareSurvival, fSurvival, logGamma, normalCdf, normalQuantile, tQuantile, tTwoSided } from "./distributions";
import { clean, mean, ranks, variance } from "./descriptive";

/**
 * Classical tests with the extra context researchers need to report them: effect sizes,
 * confidence intervals and assumption checks. Conventions follow SPSS/R defaults; each test's
 * comment says which. Every function is pure and verified against SciPy in the unit tests.
 */

export type AssumptionStatus = "ok" | "warn" | "info";
export type Assumption = { key: string; status: AssumptionStatus; params?: Record<string, number | string> };

export type EffectMagnitude = "negligible" | "small" | "medium" | "large";

function magnitude(value: number, [s, m, l]: [number, number, number]): EffectMagnitude {
  const v = Math.abs(value);
  return v < s ? "negligible" : v < m ? "small" : v < l ? "medium" : "large";
}

export const effectLabel = {
  d: (d: number) => magnitude(d, [0.2, 0.5, 0.8]),
  r: (r: number) => magnitude(r, [0.1, 0.3, 0.5]),
  eta2: (e: number) => magnitude(e, [0.01, 0.06, 0.14]),
  /** Cohen's thresholds for Cramér's V scale with the smaller table dimension. */
  cramersV: (v: number, dfMin: number) => {
    const k = Math.max(1, dfMin);
    return magnitude(v, [0.1 / Math.sqrt(k), 0.3 / Math.sqrt(k), 0.5 / Math.sqrt(k)]);
  },
};

// ── Chi-square & Fisher ─────────────────────────────────────────────────────

export type ChiSquareResult = {
  chi2: number;
  df: number;
  p: number;
  n: number;
  expected: number[][];
  cramersV: number;
  /** Share of cells with expected count below 5. */
  lowExpectedShare: number;
  minExpected: number;
  fisherP: number | null;
  rowsUsed: number[];
  colsUsed: number[];
  assumptions: Assumption[];
};

/** Pearson chi-square test of independence (no continuity correction, like SPSS's "Pearson Chi-Square"). */
export function chiSquareIndependence(table: readonly (readonly number[])[]): ChiSquareResult | null {
  const rowTotals = table.map((r) => r.reduce((a, b) => a + b, 0));
  const colCount = Math.max(0, ...table.map((r) => r.length));
  const colTotals = Array.from({ length: colCount }, (_, j) => table.reduce((a, r) => a + (r[j] ?? 0), 0));
  const rowsUsed = rowTotals.map((t, i) => (t > 0 ? i : -1)).filter((i) => i >= 0);
  const colsUsed = colTotals.map((t, j) => (t > 0 ? j : -1)).filter((j) => j >= 0);
  if (rowsUsed.length < 2 || colsUsed.length < 2) return null;

  const n = rowsUsed.reduce((a, i) => a + rowTotals[i]!, 0);
  let chi2 = 0;
  let low = 0;
  let minExpected = Infinity;
  const expected = rowsUsed.map((i) =>
    colsUsed.map((j) => {
      const e = (rowTotals[i]! * colTotals[j]!) / n;
      const o = table[i]![j] ?? 0;
      chi2 += (o - e) ** 2 / e;
      if (e < 5) low++;
      minExpected = Math.min(minExpected, e);
      return e;
    }),
  );
  const df = (rowsUsed.length - 1) * (colsUsed.length - 1);
  const k = Math.min(rowsUsed.length, colsUsed.length) - 1;
  const cells = rowsUsed.length * colsUsed.length;
  const lowExpectedShare = low / cells;
  const fisherP =
    rowsUsed.length === 2 && colsUsed.length === 2
      ? fisherExact2x2(table[rowsUsed[0]!]![colsUsed[0]!]!, table[rowsUsed[0]!]![colsUsed[1]!]!, table[rowsUsed[1]!]![colsUsed[0]!]!, table[rowsUsed[1]!]![colsUsed[1]!]!)
      : null;

  return {
    chi2,
    df,
    p: chiSquareSurvival(chi2, df),
    n,
    expected,
    cramersV: Math.sqrt(chi2 / (n * k)),
    lowExpectedShare,
    minExpected,
    fisherP,
    rowsUsed,
    colsUsed,
    assumptions: [
      { key: "independentObservations", status: "info" },
      // Cochran's rule: no expected count < 1 and at most 20% below 5.
      { key: "expectedCounts", status: lowExpectedShare <= 0.2 && minExpected >= 1 ? "ok" : "warn", params: { percent: Math.round(lowExpectedShare * 100), min: round(minExpected, 2) } },
    ],
  };
}

function logFactorial(n: number) {
  return logGamma(n + 1);
}

/** Fisher's exact test, two-sided (sum of tables no more likely than the observed one), as in R. */
export function fisherExact2x2(a: number, b: number, c: number, d: number): number {
  const r1 = a + b;
  const r2 = c + d;
  const c1 = a + c;
  const n = r1 + r2;
  const logP = (x: number) =>
    logFactorial(r1) + logFactorial(r2) + logFactorial(c1) + logFactorial(n - c1) - logFactorial(n) - logFactorial(x) - logFactorial(r1 - x) - logFactorial(c1 - x) - logFactorial(r2 - c1 + x);
  const observed = logP(a);
  let p = 0;
  for (let x = Math.max(0, c1 - r2); x <= Math.min(r1, c1); x++) {
    const lp = logP(x);
    if (lp <= observed + 1e-7) p += Math.exp(lp);
  }
  return Math.min(1, p);
}

// ── t-tests ─────────────────────────────────────────────────────────────────

export type TTestResult = {
  t: number;
  df: number;
  p: number;
  meanA: number;
  meanB: number;
  diff: number;
  ci: [number, number];
  cohensD: number;
  nA: number;
  nB: number;
  sdA: number;
  sdB: number;
  welch: boolean;
  levene: LeveneResult | null;
  assumptions: Assumption[];
};

/** Independent-samples t-test. Welch's version by default (R's default; robust to unequal variances). */
export function independentTTest(groupA: readonly number[], groupB: readonly number[], { welch = true } = {}): TTestResult | null {
  const a = clean(groupA);
  const b = clean(groupB);
  if (a.length < 2 || b.length < 2) return null;
  const ma = mean(a);
  const mb = mean(b);
  const va = variance(a);
  const vb = variance(b);
  const na = a.length;
  const nb = b.length;
  let se: number;
  let df: number;
  if (welch) {
    se = Math.sqrt(va / na + vb / nb);
    df = (va / na + vb / nb) ** 2 / ((va / na) ** 2 / (na - 1) + (vb / nb) ** 2 / (nb - 1));
  } else {
    const sp2 = ((na - 1) * va + (nb - 1) * vb) / (na + nb - 2);
    se = Math.sqrt(sp2 * (1 / na + 1 / nb));
    df = na + nb - 2;
  }
  const diff = ma - mb;
  const t = se === 0 ? 0 : diff / se;
  const crit = tQuantile(0.975, df);
  const pooledSd = Math.sqrt(((na - 1) * va + (nb - 1) * vb) / (na + nb - 2));
  const levene = leveneTest([a, b]);
  return {
    t,
    df,
    p: se === 0 ? 1 : tTwoSided(t, df),
    meanA: ma,
    meanB: mb,
    diff,
    ci: [diff - crit * se, diff + crit * se],
    cohensD: pooledSd === 0 ? 0 : diff / pooledSd,
    nA: na,
    nB: nb,
    sdA: Math.sqrt(va),
    sdB: Math.sqrt(vb),
    welch,
    levene,
    assumptions: [
      { key: "independentGroups", status: "info" },
      normalityAssumption([a, b]),
      levene
        ? { key: "equalVariances", status: levene.p < 0.05 ? (welch ? "info" : "warn") : "ok", params: { p: round(levene.p, 3), welch: welch ? "yes" : "no" } }
        : { key: "equalVariances", status: "info" },
    ],
  };
}

export type PairedTTestResult = { t: number; df: number; p: number; meanDiff: number; sdDiff: number; ci: [number, number]; cohensDz: number; n: number; meanA: number; meanB: number; assumptions: Assumption[] };

/** Paired-samples t-test over cases that have both values. */
export function pairedTTest(xs: readonly (number | null)[], ys: readonly (number | null)[]): PairedTTestResult | null {
  const pairs: [number, number][] = [];
  for (let i = 0; i < Math.min(xs.length, ys.length); i++) {
    const x = xs[i];
    const y = ys[i];
    if (typeof x === "number" && typeof y === "number" && Number.isFinite(x) && Number.isFinite(y)) pairs.push([x, y]);
  }
  const n = pairs.length;
  if (n < 2) return null;
  const d = pairs.map(([x, y]) => x - y);
  const md = mean(d);
  const sd = Math.sqrt(variance(d));
  const se = sd / Math.sqrt(n);
  const df = n - 1;
  const t = se === 0 ? 0 : md / se;
  const crit = tQuantile(0.975, df);
  return {
    t,
    df,
    p: se === 0 ? 1 : tTwoSided(t, df),
    meanDiff: md,
    sdDiff: sd,
    ci: [md - crit * se, md + crit * se],
    cohensDz: sd === 0 ? 0 : md / sd,
    n,
    meanA: mean(pairs.map((p) => p[0])),
    meanB: mean(pairs.map((p) => p[1])),
    assumptions: [{ key: "pairedCases", status: "info", params: { n } }, normalityAssumption([d], "normalityDifferences")],
  };
}

// ── Variance checks & ANOVA ─────────────────────────────────────────────────

export type LeveneResult = { f: number; df1: number; df2: number; p: number };

/** Levene's test centered on the median (Brown–Forsythe; R car::leveneTest and SciPy default). */
export function leveneTest(groups: readonly (readonly number[])[]): LeveneResult | null {
  const gs = groups.map((g) => clean(g)).filter((g) => g.length > 0);
  if (gs.length < 2) return null;
  const devs = gs.map((g) => {
    const sorted = [...g].sort((a, b) => a - b);
    const mid = sorted.length % 2 ? sorted[(sorted.length - 1) / 2]! : (sorted[sorted.length / 2 - 1]! + sorted[sorted.length / 2]!) / 2;
    return g.map((x) => Math.abs(x - mid));
  });
  const a = anovaCore(devs);
  return a ? { f: a.f, df1: a.df1, df2: a.df2, p: a.p } : null;
}

function anovaCore(groups: readonly number[][]) {
  const k = groups.length;
  const n = groups.reduce((a, g) => a + g.length, 0);
  if (k < 2 || n - k < 1) return null;
  const grand = mean(groups.flat());
  let ssb = 0;
  let ssw = 0;
  for (const g of groups) {
    const m = mean(g);
    ssb += g.length * (m - grand) ** 2;
    for (const x of g) ssw += (x - m) ** 2;
  }
  const df1 = k - 1;
  const df2 = n - k;
  const f = ssw === 0 ? (ssb === 0 ? 0 : Infinity) : ssb / df1 / (ssw / df2);
  return { f, df1, df2, p: Number.isFinite(f) ? fSurvival(f, df1, df2) : 0, ssb, ssw, n };
}

export type GroupStat = { n: number; mean: number; sd: number };

export type AnovaResult = {
  f: number;
  df1: number;
  df2: number;
  p: number;
  etaSquared: number;
  omegaSquared: number;
  groups: GroupStat[];
  welch: { f: number; df1: number; df2: number; p: number } | null;
  levene: LeveneResult | null;
  n: number;
  assumptions: Assumption[];
};

/** One-way ANOVA with eta²/ω², Levene's test, and Welch's ANOVA for unequal variances. */
export function oneWayAnova(groupsIn: readonly (readonly number[])[]): AnovaResult | null {
  const groups = groupsIn.map((g) => clean(g)).filter((g) => g.length > 0);
  const core = anovaCore(groups);
  if (!core || groups.some((g) => g.length < 2)) return null;
  const sst = core.ssb + core.ssw;
  const msw = core.ssw / core.df2;
  const levene = leveneTest(groups);
  const welch = welchAnova(groups);
  return {
    f: core.f,
    df1: core.df1,
    df2: core.df2,
    p: core.p,
    etaSquared: sst === 0 ? 0 : core.ssb / sst,
    omegaSquared: sst === 0 ? 0 : Math.max(0, (core.ssb - core.df1 * msw) / (sst + msw)),
    groups: groups.map((g) => ({ n: g.length, mean: mean(g), sd: Math.sqrt(variance(g)) })),
    welch,
    levene,
    n: core.n,
    assumptions: [
      { key: "independentGroups", status: "info" },
      normalityAssumption(groups),
      levene ? { key: "equalVariances", status: levene.p < 0.05 ? "warn" : "ok", params: { p: round(levene.p, 3), welch: "anova" } } : { key: "equalVariances", status: "info" },
    ],
  };
}

/** Welch's heteroscedastic one-way ANOVA (R oneway.test with var.equal = FALSE). */
export function welchAnova(groups: readonly number[][]) {
  const k = groups.length;
  if (k < 2 || groups.some((g) => g.length < 2)) return null;
  const w = groups.map((g) => g.length / variance(g));
  if (w.some((x) => !Number.isFinite(x))) return null;
  const sw = w.reduce((a, b) => a + b, 0);
  const means = groups.map((g) => mean(g));
  const mw = means.reduce((a, m, i) => a + w[i]! * m, 0) / sw;
  const a = means.reduce((acc, m, i) => acc + w[i]! * (m - mw) ** 2, 0) / (k - 1);
  const lambda = groups.reduce((acc, g, i) => acc + (1 - w[i]! / sw) ** 2 / (g.length - 1), 0);
  const b = 1 + ((2 * (k - 2)) / (k * k - 1)) * lambda;
  const f = a / b;
  const df1 = k - 1;
  const df2 = (k * k - 1) / (3 * lambda);
  return { f, df1, df2, p: fSurvival(f, df1, df2) };
}

// ── Nonparametric ───────────────────────────────────────────────────────────

export type MannWhitneyResult = { u: number; z: number; p: number; r: number; nA: number; nB: number; medianA: number; medianB: number; meanRankA: number; meanRankB: number; assumptions: Assumption[] };

/** Mann–Whitney U (Wilcoxon rank-sum), normal approximation with tie and continuity correction (R's default when ties exist). */
export function mannWhitney(groupA: readonly number[], groupB: readonly number[]): MannWhitneyResult | null {
  const a = clean(groupA);
  const b = clean(groupB);
  const na = a.length;
  const nb = b.length;
  if (na < 1 || nb < 1 || na + nb < 3) return null;
  const all = [...a, ...b];
  const r = ranks(all);
  const ra = r.slice(0, na).reduce((x, y) => x + y, 0);
  const u = ra - (na * (na + 1)) / 2;
  const n = na + nb;
  const tieTerm = tieCorrection(all);
  const sigma = Math.sqrt(((na * nb) / 12) * (n + 1 - tieTerm / (n * (n - 1))));
  const mu = (na * nb) / 2;
  const diff = u - mu;
  const z = sigma === 0 ? 0 : (diff - Math.sign(diff) * 0.5) / sigma;
  const median = (xs: number[]) => {
    const s = [...xs].sort((p, q) => p - q);
    return s.length % 2 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2;
  };
  return {
    u,
    z,
    p: sigma === 0 ? 1 : Math.min(1, 2 * (1 - normalCdf(Math.abs(z)))),
    r: Math.abs(z) / Math.sqrt(n),
    nA: na,
    nB: nb,
    medianA: median(a),
    medianB: median(b),
    meanRankA: ra / na,
    meanRankB: r.slice(na).reduce((x, y) => x + y, 0) / nb,
    assumptions: [{ key: "independentGroups", status: "info" }, { key: "ordinalOutcome", status: "info" }],
  };
}

/** Σ(t³ − t) over tie groups. */
function tieCorrection(xs: readonly number[]) {
  const counts = new Map<number, number>();
  for (const x of xs) counts.set(x, (counts.get(x) ?? 0) + 1);
  let s = 0;
  for (const t of counts.values()) s += t ** 3 - t;
  return s;
}

export type KruskalResult = { h: number; df: number; p: number; epsilonSquared: number; n: number; groups: { n: number; meanRank: number; median: number }[]; assumptions: Assumption[] };

/** Kruskal–Wallis H with tie correction (R kruskal.test, SPSS K-W). */
export function kruskalWallis(groupsIn: readonly (readonly number[])[]): KruskalResult | null {
  const groups = groupsIn.map((g) => clean(g)).filter((g) => g.length > 0);
  if (groups.length < 2) return null;
  const all = groups.flat();
  const n = all.length;
  const r = ranks(all);
  let offset = 0;
  let h = 0;
  const stats = groups.map((g) => {
    const rs = r.slice(offset, offset + g.length);
    offset += g.length;
    const sum = rs.reduce((a, b) => a + b, 0);
    h += (sum * sum) / g.length;
    const s = [...g].sort((p, q) => p - q);
    return { n: g.length, meanRank: sum / g.length, median: s.length % 2 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2 };
  });
  h = (12 / (n * (n + 1))) * h - 3 * (n + 1);
  const c = 1 - tieCorrection(all) / (n ** 3 - n);
  if (c > 0) h /= c;
  const df = groups.length - 1;
  return {
    h,
    df,
    p: chiSquareSurvival(h, df),
    epsilonSquared: n > 1 ? (h * (n + 1)) / (n * n - 1) : 0,
    n,
    groups: stats,
    assumptions: [{ key: "independentGroups", status: "info" }, { key: "ordinalOutcome", status: "info" }],
  };
}

// ── Correlation & regression ────────────────────────────────────────────────

export type CorrelationResult = { r: number; n: number; t: number; df: number; p: number; ci: [number, number] | null; method: "pearson" | "spearman"; assumptions: Assumption[] };

function pairs(xs: readonly (number | null)[], ys: readonly (number | null)[]) {
  const x: number[] = [];
  const y: number[] = [];
  for (let i = 0; i < Math.min(xs.length, ys.length); i++) {
    const a = xs[i];
    const b = ys[i];
    if (typeof a === "number" && typeof b === "number" && Number.isFinite(a) && Number.isFinite(b)) {
      x.push(a);
      y.push(b);
    }
  }
  return { x, y };
}

function pearsonR(x: readonly number[], y: readonly number[]) {
  const mx = mean(x);
  const my = mean(y);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < x.length; i++) {
    sxy += (x[i]! - mx) * (y[i]! - my);
    sxx += (x[i]! - mx) ** 2;
    syy += (y[i]! - my) ** 2;
  }
  return sxx === 0 || syy === 0 ? NaN : sxy / Math.sqrt(sxx * syy);
}

/** Pearson or Spearman correlation with a t-based p-value (both as in R cor.test / SciPy). */
export function correlation(xs: readonly (number | null)[], ys: readonly (number | null)[], method: "pearson" | "spearman" = "pearson"): CorrelationResult | null {
  const { x, y } = pairs(xs, ys);
  const n = x.length;
  if (n < 3) return null;
  const r = method === "spearman" ? pearsonR(ranks(x), ranks(y)) : pearsonR(x, y);
  if (!Number.isFinite(r)) return null;
  const df = n - 2;
  const rr = Math.min(1, Math.max(-1, r));
  const t = Math.abs(rr) === 1 ? Infinity * Math.sign(rr) : rr * Math.sqrt(df / (1 - rr * rr));
  const p = Number.isFinite(t) ? tTwoSided(t, df) : 0;
  let ci: [number, number] | null = null;
  if (method === "pearson" && n > 3 && Math.abs(rr) < 1) {
    const z = Math.atanh(rr);
    const se = 1 / Math.sqrt(n - 3);
    const q = normalQuantile(0.975);
    ci = [Math.tanh(z - q * se), Math.tanh(z + q * se)];
  }
  const outliers = method === "pearson" ? countOutliers(x) + countOutliers(y) : 0;
  return {
    r: rr,
    n,
    t,
    df,
    p,
    ci,
    method,
    assumptions:
      method === "pearson"
        ? [
            { key: "linearRelationship", status: "info" },
            { key: "outliers", status: outliers > 0 ? "warn" : "ok", params: { count: outliers } },
            normalityAssumption([x, y], "normalityVariables"),
          ]
        : [{ key: "monotonicRelationship", status: "info" }],
  };
}

function countOutliers(xs: readonly number[]) {
  const m = mean(xs);
  const sd = Math.sqrt(variance(xs));
  if (!sd) return 0;
  return xs.filter((x) => Math.abs((x - m) / sd) > 3).length;
}

export type RegressionResult = { slope: number; intercept: number; r2: number; seSlope: number; t: number; df: number; p: number; n: number; ciSlope: [number, number] };

/** Simple linear regression y = a + b·x (ordinary least squares). */
export function linearRegression(xs: readonly (number | null)[], ys: readonly (number | null)[]): RegressionResult | null {
  const { x, y } = pairs(xs, ys);
  const n = x.length;
  if (n < 3) return null;
  const mx = mean(x);
  const my = mean(y);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (x[i]! - mx) * (y[i]! - my);
    sxx += (x[i]! - mx) ** 2;
    syy += (y[i]! - my) ** 2;
  }
  if (sxx === 0) return null;
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  const sse = Math.max(0, syy - slope * sxy);
  const df = n - 2;
  const seSlope = Math.sqrt(sse / df / sxx);
  const t = seSlope === 0 ? Infinity : slope / seSlope;
  const crit = tQuantile(0.975, df);
  return {
    slope,
    intercept,
    r2: syy === 0 ? 0 : 1 - sse / syy,
    seSlope,
    t,
    df,
    p: Number.isFinite(t) ? tTwoSided(t, df) : 0,
    n,
    ciSlope: [slope - crit * seSlope, slope + crit * seSlope],
  };
}

// ── Reliability ─────────────────────────────────────────────────────────────

export type ReliabilityResult = {
  alpha: number;
  standardizedAlpha: number;
  n: number;
  k: number;
  items: { mean: number; sd: number; itemTotal: number; alphaIfDeleted: number | null }[];
  assumptions: Assumption[];
};

function alphaOf(columns: readonly number[][]) {
  const k = columns.length;
  if (k < 2) return NaN;
  const n = columns[0]!.length;
  const totals = Array.from({ length: n }, (_, i) => columns.reduce((a, c) => a + c[i]!, 0));
  const sumVar = columns.reduce((a, c) => a + variance(c), 0);
  const totVar = variance(totals);
  return totVar === 0 ? NaN : (k / (k - 1)) * (1 - sumVar / totVar);
}

/** Cronbach's alpha with listwise deletion, plus item-total statistics (SPSS RELIABILITY /SUMMARY=TOTAL). */
export function cronbachAlpha(itemColumns: readonly (readonly (number | null)[])[]): ReliabilityResult | null {
  const k = itemColumns.length;
  if (k < 2) return null;
  const rows = Math.min(...itemColumns.map((c) => c.length));
  const keep: number[] = [];
  for (let i = 0; i < rows; i++) if (itemColumns.every((c) => typeof c[i] === "number" && Number.isFinite(c[i]))) keep.push(i);
  const cols = itemColumns.map((c) => keep.map((i) => c[i] as number));
  const n = keep.length;
  if (n < 2) return null;
  const alpha = alphaOf(cols);
  if (!Number.isFinite(alpha)) return null;

  // Standardized alpha from the mean inter-item correlation.
  let rSum = 0;
  let pairsCount = 0;
  for (let i = 0; i < k; i++)
    for (let j = i + 1; j < k; j++) {
      const r = pearsonR(cols[i]!, cols[j]!);
      if (Number.isFinite(r)) {
        rSum += r;
        pairsCount++;
      }
    }
  const rBar = pairsCount ? rSum / pairsCount : 0;

  const totals = Array.from({ length: n }, (_, i) => cols.reduce((a, c) => a + c[i]!, 0));
  const items = cols.map((c, j) => {
    const rest = totals.map((t, i) => t - c[i]!);
    const others = cols.filter((_, x) => x !== j);
    const aid = others.length >= 2 ? alphaOf(others) : NaN;
    return {
      mean: mean(c),
      sd: Math.sqrt(variance(c)),
      itemTotal: pearsonR(c, rest),
      alphaIfDeleted: Number.isFinite(aid) ? aid : null,
    };
  });
  return {
    alpha,
    standardizedAlpha: (k * rBar) / (1 + (k - 1) * rBar),
    n,
    k,
    items,
    assumptions: [
      { key: "sameConstruct", status: "info" },
      { key: "reverseScored", status: items.some((it) => it.itemTotal < 0) ? "warn" : "ok" },
      { key: "listwise", status: "info", params: { n, dropped: rows - n } },
    ],
  };
}

/** Plain-language reading of Cronbach's alpha (George & Mallery's widely used bands). */
export function alphaLabel(alpha: number): "excellent" | "good" | "acceptable" | "questionable" | "poor" | "unacceptable" {
  if (alpha >= 0.9) return "excellent";
  if (alpha >= 0.8) return "good";
  if (alpha >= 0.7) return "acceptable";
  if (alpha >= 0.6) return "questionable";
  if (alpha >= 0.5) return "poor";
  return "unacceptable";
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Rough normality screen: fine with n ≥ 30 per group (CLT) or |skewness| < 1. */
function normalityAssumption(groups: readonly number[][], key = "normality"): Assumption {
  const small = groups.filter((g) => g.length < 30);
  const skewed = small.filter((g) => Math.abs(skew(g)) >= 1);
  const minN = Math.min(...groups.map((g) => g.length));
  if (small.length === 0) return { key, status: "ok", params: { reason: "largeSample", minN } };
  return { key, status: skewed.length ? "warn" : "ok", params: { reason: skewed.length ? "skewed" : "symmetric", minN } };
}

function skew(xs: readonly number[]) {
  const n = xs.length;
  if (n < 3) return 0;
  const m = mean(xs);
  const sd = Math.sqrt(variance(xs));
  if (!sd) return 0;
  let m3 = 0;
  for (const x of xs) m3 += ((x - m) / sd) ** 3;
  return (n / ((n - 1) * (n - 2))) * m3;
}

export function round(x: number, digits = 3) {
  const f = 10 ** digits;
  return Math.round(x * f) / f;
}
