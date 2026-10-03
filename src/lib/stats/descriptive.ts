import { tQuantile } from "./distributions";

export type Summary = {
  n: number;
  mean: number | null;
  median: number | null;
  /** All values tied for the highest frequency (empty when every value is unique and n > 1). */
  modes: number[];
  sd: number | null;
  variance: number | null;
  se: number | null;
  min: number | null;
  max: number | null;
  q1: number | null;
  q3: number | null;
  iqr: number | null;
  /** 95% confidence interval of the mean (t-based). */
  ci95: [number, number] | null;
  skewness: number | null;
  sum: number;
};

export function clean(values: readonly (number | null | undefined)[]): number[] {
  return values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
}

export function mean(xs: readonly number[]): number {
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

/** Sample variance (n − 1). */
export function variance(xs: readonly number[]): number {
  if (xs.length < 2) return NaN;
  const m = mean(xs);
  let s = 0;
  for (const x of xs) s += (x - m) ** 2;
  return s / (xs.length - 1);
}

/** Quantile with linear interpolation (R type 7, the default in R and NumPy). */
export function quantile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const h = (sorted.length - 1) * p;
  const lo = Math.floor(h);
  const hi = Math.ceil(h);
  return sorted[lo]! + (h - lo) * (sorted[hi]! - sorted[lo]!);
}

export function summarize(values: readonly (number | null | undefined)[]): Summary {
  const xs = clean(values);
  const n = xs.length;
  const sum = xs.reduce((a, b) => a + b, 0);
  if (n === 0) {
    return { n, mean: null, median: null, modes: [], sd: null, variance: null, se: null, min: null, max: null, q1: null, q3: null, iqr: null, ci95: null, skewness: null, sum };
  }
  const sorted = [...xs].sort((a, b) => a - b);
  const m = sum / n;
  const v = n > 1 ? variance(xs) : null;
  const sd = v === null ? null : Math.sqrt(v);
  const se = sd === null ? null : sd / Math.sqrt(n);
  const tcrit = n > 1 ? tQuantile(0.975, n - 1) : null;

  const counts = new Map<number, number>();
  for (const x of xs) counts.set(x, (counts.get(x) ?? 0) + 1);
  const top = Math.max(...counts.values());
  const modes = top > 1 || n === 1 ? [...counts].filter(([, c]) => c === top).map(([x]) => x).sort((a, b) => a - b) : [];

  // Adjusted Fisher–Pearson skewness (what SPSS and Excel report).
  let skewness: number | null = null;
  if (n > 2 && sd && sd > 0) {
    let m3 = 0;
    for (const x of xs) m3 += ((x - m) / sd) ** 3;
    skewness = (n / ((n - 1) * (n - 2))) * m3;
  }

  const q1 = quantile(sorted, 0.25);
  const q3 = quantile(sorted, 0.75);
  return {
    n,
    mean: m,
    median: quantile(sorted, 0.5),
    modes,
    sd,
    variance: v,
    se,
    min: sorted[0]!,
    max: sorted[n - 1]!,
    q1,
    q3,
    iqr: q3 - q1,
    ci95: se !== null && tcrit !== null ? [m - tcrit * se, m + tcrit * se] : null,
    skewness,
    sum,
  };
}

export type Frequency = { key: string; count: number; percent: number };

/**
 * Frequency table over known categories (in their given order, zeros included), plus any
 * unexpected values at the end. Percent is of valid (non-missing) answers.
 */
export function frequencies(values: readonly (string | null | undefined)[], categories: readonly string[] = []): { rows: Frequency[]; valid: number; missing: number } {
  const counts = new Map<string, number>(categories.map((c) => [c, 0]));
  let missing = 0;
  for (const v of values) {
    if (v === null || v === undefined || v === "") {
      missing++;
      continue;
    }
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  const valid = values.length - missing;
  const rows = [...counts].map(([key, count]) => ({ key, count, percent: valid ? (count / valid) * 100 : 0 }));
  return { rows, valid, missing };
}

export type Bin = { x0: number; x1: number; count: number };

/** Histogram with "nice" equal-width bins (Sturges count, rounded edges). Integers get one bin per value when few. */
export function histogram(values: readonly number[], maxBins = 20): Bin[] {
  const xs = clean(values);
  if (xs.length === 0) return [];
  const min = Math.min(...xs);
  const max = Math.max(...xs);
  const integers = xs.every(Number.isInteger);
  if (integers && max - min <= maxBins) {
    const bins: Bin[] = [];
    for (let v = min; v <= max; v++) bins.push({ x0: v, x1: v + 1, count: 0 });
    for (const x of xs) bins[x - min]!.count++;
    return bins;
  }
  if (min === max) return [{ x0: min, x1: max + 1, count: xs.length }];
  const target = Math.min(maxBins, Math.max(5, Math.ceil(Math.log2(xs.length) + 1)));
  const step = niceStep((max - min) / target);
  const start = Math.floor(min / step) * step;
  const count = Math.max(1, Math.ceil((max - start) / step + 1e-9));
  const bins: Bin[] = Array.from({ length: count }, (_, i) => ({ x0: start + i * step, x1: start + (i + 1) * step, count: 0 }));
  for (const x of xs) {
    const i = Math.min(count - 1, Math.floor((x - start) / step));
    bins[i]!.count++;
  }
  return bins;
}

function niceStep(raw: number): number {
  const exp = Math.floor(Math.log10(raw));
  const f = raw / 10 ** exp;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nice * 10 ** exp;
}

export type BoxStats = { min: number; q1: number; median: number; q3: number; max: number; lowerWhisker: number; upperWhisker: number; outliers: number[]; n: number };

/** Tukey box plot: whiskers reach the furthest points within 1.5 × IQR. */
export function boxStats(values: readonly number[]): BoxStats | null {
  const xs = clean(values).sort((a, b) => a - b);
  if (!xs.length) return null;
  const q1 = quantile(xs, 0.25);
  const q3 = quantile(xs, 0.75);
  const lo = q1 - 1.5 * (q3 - q1);
  const hi = q3 + 1.5 * (q3 - q1);
  const inside = xs.filter((x) => x >= lo && x <= hi);
  return {
    min: xs[0]!,
    q1,
    median: quantile(xs, 0.5),
    q3,
    max: xs.at(-1)!,
    lowerWhisker: inside[0] ?? q1,
    upperWhisker: inside.at(-1) ?? q3,
    outliers: xs.filter((x) => x < lo || x > hi),
    n: xs.length,
  };
}

/** Average ranks (ties share their mean rank), 1-based. */
export function ranks(xs: readonly number[]): number[] {
  const idx = xs.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]);
  const out = new Array<number>(xs.length);
  for (let i = 0; i < idx.length; ) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1]![0] === idx[i]![0]) j++;
    const r = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) out[idx[k]![1]] = r;
    i = j + 1;
  }
  return out;
}

/** Net Promoter Score from 0–10 ratings. */
export function nps(values: readonly number[]) {
  const xs = clean(values);
  const promoters = xs.filter((x) => x >= 9).length;
  const detractors = xs.filter((x) => x <= 6).length;
  const passives = xs.length - promoters - detractors;
  return {
    n: xs.length,
    promoters,
    passives,
    detractors,
    score: xs.length ? Math.round(((promoters - detractors) / xs.length) * 100) : null,
  };
}
