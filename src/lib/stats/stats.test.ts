import { describe, expect, it } from "vitest";
import { chiSquareSurvival, fSurvival, normalQuantile, tQuantile } from "./distributions";
import { boxStats, frequencies, histogram, nps, ranks, summarize } from "./descriptive";
import {
  alphaLabel,
  chiSquareIndependence,
  correlation,
  cronbachAlpha,
  effectLabel,
  fisherExact2x2,
  independentTTest,
  kruskalWallis,
  leveneTest,
  linearRegression,
  mannWhitney,
  oneWayAnova,
  pairedTTest,
} from "./tests";

// Reference values computed with SciPy 1.17 (see PLAN.md → testing). Same data, same conventions.
const A = [5.1, 4.9, 6.2, 5.8, 6.0, 5.5, 5.3, 6.1, 4.7, 5.9];
const B = [6.3, 6.6, 5.9, 7.1, 6.8, 6.4, 7.0, 6.2, 6.9];
const C = [5.0, 5.5, 6.0, 5.2, 5.8, 6.1, 5.4];
const L1 = [1, 2, 2, 3, 3, 3, 4, 4, 5, 2, 3];
const L2 = [3, 4, 4, 5, 5, 5, 4, 3, 5, 4];

const close = (actual: number | undefined | null, expected: number, digits = 8) => expect(actual).toBeCloseTo(expected, digits);

describe("distributions", () => {
  it("matches SciPy quantiles and tails", () => {
    close(tQuantile(0.975, 7.3), 2.345066736547703);
    close(normalQuantile(0.0123), -2.247626755795138);
    close(chiSquareSurvival(40, 3) * 1e8, 1.065509033425585);
    close(fSurvival(3.2, 4, 17.5), 0.03852318605379366);
  });
});

describe("descriptives", () => {
  it("summarizes like SPSS/R", () => {
    const s = summarize([...A, null, undefined, Number.NaN]);
    expect(s.n).toBe(10);
    close(s.mean, 5.55);
    close(s.q1, 5.15);
    close(s.skewness, -0.37852469419107576);
    expect(s.ci95![0]).toBeLessThan(5.55);
    expect(summarize([]).mean).toBeNull();
  });

  it("finds all modes", () => {
    expect(summarize([1, 2, 2, 3, 3]).modes).toEqual([2, 3]);
    expect(summarize([1, 2, 3]).modes).toEqual([]);
  });

  it("counts frequencies over known categories", () => {
    const f = frequencies(["a", "b", "a", null, "", "z"], ["a", "b", "c"]);
    expect(f.valid).toBe(4);
    expect(f.missing).toBe(2);
    expect(f.rows.map((r) => [r.key, r.count, r.percent])).toEqual([
      ["a", 2, 50],
      ["b", 1, 25],
      ["c", 0, 0],
      ["z", 1, 25],
    ]);
  });

  it("bins integers one per value and decimals into nice ranges", () => {
    expect(histogram([1, 2, 2, 5]).map((b) => b.count)).toEqual([1, 2, 0, 0, 1]);
    const bins = histogram(A);
    expect(bins.reduce((a, b) => a + b.count, 0)).toBe(10);
    expect(bins[0]!.x0).toBeLessThanOrEqual(4.7);
  });

  it("computes box plot whiskers and outliers", () => {
    const b = boxStats([1, 2, 3, 4, 5, 6, 7, 8, 100])!;
    expect(b.outliers).toEqual([100]);
    expect(b.upperWhisker).toBe(8);
  });

  it("averages tied ranks", () => {
    expect(ranks([10, 20, 20, 30])).toEqual([1, 2.5, 2.5, 4]);
  });

  it("scores NPS", () => {
    expect(nps([10, 9, 8, 7, 6, 0])).toMatchObject({ promoters: 2, passives: 2, detractors: 2, score: 0 });
  });
});

describe("t-tests", () => {
  it("Welch independent t-test", () => {
    const r = independentTTest(A, B)!;
    close(r.t, -4.775088029506923);
    close(r.df, 16.612968875583437);
    close(r.p, 0.000186917883538682);
    expect(effectLabel.d(r.cohensD)).toBe("large");
  });

  it("Student t-test", () => {
    const r = independentTTest(A, B, { welch: false })!;
    close(r.t, -4.706207941380295);
    close(r.p, 0.00020350803497514456);
  });

  it("paired t-test", () => {
    const r = pairedTTest(A.slice(0, 9), B)!;
    close(r.t, -4.023645526156364);
    close(r.p, 0.0038217072440462083);
    expect(r.n).toBe(9);
  });
});

describe("ANOVA family", () => {
  it("Levene (median)", () => {
    const l = leveneTest([A, B, C])!;
    close(l.f, 0.8226923076923093);
    close(l.p, 0.4517630560856514);
  });

  it("one-way ANOVA and Welch ANOVA", () => {
    const r = oneWayAnova([A, B, C])!;
    close(r.f, 14.477201992397099);
    close(r.p, 8.515553731557366e-5);
    close(r.welch!.f, 15.816362891018171);
    close(r.welch!.df2, 14.794267446539457);
    close(r.welch!.p, 0.00021184251712730477);
    expect(r.etaSquared).toBeGreaterThan(0.5);
  });
});

describe("nonparametric", () => {
  it("Mann–Whitney U", () => {
    const r = mannWhitney(L1, L2)!;
    expect(r.u).toBe(20);
    close(r.p, 0.012171316307694071);
  });

  it("Kruskal–Wallis", () => {
    const r = kruskalWallis([L1, L2, [2, 2, 3, 1, 1, 2]])!;
    close(r.h, 13.480603540200468);
    close(r.p, 0.0011822903229081597);
  });
});

describe("association", () => {
  const x = [...A, 5.6];
  const y = [2.1, 1.8, 3.0, 2.9, 3.2, 2.4, 2.2, 3.1, 1.7, 2.6, 2.5];

  it("Pearson with Fisher-z CI", () => {
    const r = correlation(x, y)!;
    close(r.r, 0.9642133383904231);
    close(r.p, 1.7248704159806087e-6);
    close(r.ci![0], 0.8641954391994922, 6);
    close(r.ci![1], 0.9909281110323905, 6);
  });

  it("Spearman", () => {
    const r = correlation(L1, [2, 2, 3, 3, 4, 3, 4, 5, 5, 1, 3], "spearman")!;
    close(r.r, 0.893214407810232);
    close(r.p, 0.000212794808299587);
  });

  it("drops incomplete pairs", () => {
    expect(correlation([1, 2, null, 4], [2, 4, 6, null])).toBeNull();
  });

  it("simple regression", () => {
    const r = linearRegression(x, y)!;
    close(r.slope, 0.9892086330935254);
    close(r.intercept, -2.9946043165467633);
    close(r.r2, 0.9297073619300055);
    close(r.seSlope, 0.09066682954933263);
  });

  it("chi-square test of independence", () => {
    const r = chiSquareIndependence([
      [20, 15, 5],
      [10, 25, 15],
    ])!;
    close(r.chi2, 9.843750000000002);
    expect(r.df).toBe(2);
    close(r.p, 0.007285457798938984);
    expect(r.assumptions.find((a) => a.key === "expectedCounts")!.status).toBe("ok");
  });

  it("ignores empty rows/columns and adds Fisher for 2×2", () => {
    const r = chiSquareIndependence([
      [3, 7, 0],
      [9, 2, 0],
      [0, 0, 0],
    ])!;
    expect(r.df).toBe(1);
    close(r.fisherP!, 0.02997312285237981);
    close(fisherExact2x2(3, 7, 9, 2), 0.02997312285237981);
    // Small cells: the chi-square approximation is flagged, which is when Fisher's test matters.
    expect(r.assumptions.find((a) => a.key === "expectedCounts")!.status).toBe("warn");
  });
});

describe("reliability", () => {
  const items = [
    [4, 5, 4, 3],
    [3, 3, 4, 2],
    [5, 5, 5, 4],
    [2, 3, 2, 2],
    [4, 4, 3, 3],
    [3, 2, 3, 3],
    [5, 4, 5, 5],
    [1, 2, 2, 1],
  ];
  const columns = [0, 1, 2, 3].map((j) => items.map((row) => row[j]!));

  it("Cronbach's alpha with item statistics", () => {
    const r = cronbachAlpha(columns)!;
    close(r.alpha, 0.9394939493949395);
    close(r.items[0]!.alphaIfDeleted!, 0.8814691151919867);
    close(r.items[0]!.itemTotal, 0.9734167630663951);
    expect(alphaLabel(r.alpha)).toBe("excellent");
  });

  it("deletes cases listwise", () => {
    const withGap = columns.map((c, j) => (j === 0 ? [...c, null] : [...c, 5]));
    expect(cronbachAlpha(withGap)!.n).toBe(8);
  });
});
