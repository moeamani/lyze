import "server-only";
import { getTranslations } from "next-intl/server";
import { groupRows, isCategorical, isNumeric, numericColumn, type Dataset, type DatasetRow } from "@/lib/analysis/dataset";
import { crosstab } from "@/lib/analysis/crosstab";
import { syntax, type Syntax } from "@/lib/analysis/syntax";
import type { Variable } from "@/lib/analysis/variables";
import { boxStats, summarize } from "@/lib/stats/descriptive";
import { corr, formatP, num, pct, SIGNIFICANCE } from "@/lib/stats/format";
import {
  alphaLabel,
  correlation,
  cronbachAlpha,
  effectLabel,
  independentTTest,
  kruskalWallis,
  linearRegression,
  mannWhitney,
  oneWayAnova,
  pairedTTest,
  type Assumption,
} from "@/lib/stats/tests";
import type { BoxRow, TableData } from "@/components/charts/charts";

export const TOOLS = ["crosstab", "compare", "correlate", "paired", "reliability", "matrix", "prepare"] as const;
export type Tool = (typeof TOOLS)[number];

export type Visual =
  | { kind: "heatmap"; rowLabels: string[]; colLabels: string[]; cells: string[][]; intensity: number[][]; caption: string }
  | { kind: "box"; rows: BoxRow[] }
  | { kind: "scatter"; points: { x: number; y: number }[]; xLabel: string; yLabel: string; line: { slope: number; intercept: number } | null }
  | { kind: "none" };

export type ToolResult = {
  headline: string;
  significant: boolean | null;
  report: string | null;
  details: { label: string; value: string }[];
  assumptions: { status: Assumption["status"]; text: string }[];
  n: number;
  notes: string[];
  syntax: Syntax;
  visual: Visual;
  table: TableData | null;
};

type Params = Record<string, string | undefined>;

export function variableOptions(dataset: Dataset) {
  const label = (v: Variable) => `${v.name} · ${v.label}`;
  return {
    categorical: dataset.variables.filter((v) => isCategorical(v) && v.role !== "meta").map((v) => ({ id: v.id, label: label(v) })),
    numeric: dataset.variables.filter(isNumeric).map((v) => ({ id: v.id, label: label(v) })),
  };
}

async function assumptionTexts(list: Assumption[]) {
  const t = await getTranslations("stats.assumption");
  return list.map((a) => ({ status: a.status, text: t(a.key as "normality", (a.params ?? {}) as Record<string, string>) }));
}

const nf = (x: number | null | undefined, d = 2) => num(x ?? null, d);

export async function runTool(tool: Tool, dataset: Dataset, rows: DatasetRow[], p: Params): Promise<ToolResult | null> {
  const t = await getTranslations("stats");
  const ta = await getTranslations("analyze");
  const tr = await getTranslations("results");
  const v = (id: string | undefined) => (id ? dataset.byId.get(id) : undefined);

  switch (tool) {
    case "crosstab": {
      const row = v(p.row);
      const col = v(p.col);
      if (!row || !col || !isCategorical(row) || !isCategorical(col) || row.id === col.id) return null;
      const ct = crosstab(rows, row, col);
      const mode = (p.pct as "col" | "row" | "total" | "count") ?? "col";
      const share = (i: number, j: number) => {
        const c = ct.counts[i]![j]!;
        if (mode === "row") return ct.rowTotals[i] ? c / ct.rowTotals[i]! : 0;
        if (mode === "total") return ct.n ? c / ct.n : 0;
        return ct.colTotals[j] ? c / ct.colTotals[j]! : 0;
      };
      const cells = ct.counts.map((r, i) => r.map((c, j) => (mode === "count" ? String(c) : `${pct(share(i, j) * 100)}`)));
      const maxCount = Math.max(1, ...ct.counts.flat());
      const intensity = ct.counts.map((r, i) => r.map((c, j) => (mode === "count" ? c / maxCount : share(i, j))));
      const test = ct.test;
      const sig = test ? test.p < SIGNIFICANCE : null;
      const effect = test ? t(`effects.${effectLabel.cramersV(test.cramersV, Math.min(test.rowsUsed.length, test.colsUsed.length) - 1)}`) : "";
      const notes: string[] = [];
      if (ct.missing) notes.push(ta("missing", { count: ct.missing }));
      if (test?.fisherP !== null && test?.fisherP !== undefined) notes.push(t("crosstab.fisher", { p: formatP(test.fisherP) }));
      return {
        headline: test ? t(sig ? "crosstab.sig" : "crosstab.ns", { row: row.label, col: col.label, effect, v: corr(test.cramersV) }) : ta("notEnough"),
        significant: sig,
        report: test ? `χ²(${test.df}, N = ${test.n}) = ${nf(test.chi2)}, p ${formatP(test.p)}, V = ${corr(test.cramersV)}` : null,
        details: test
          ? [
              { label: "χ²", value: nf(test.chi2) },
              { label: "df", value: String(test.df) },
              { label: "p", value: formatP(test.p) },
              { label: "Cramér's V", value: corr(test.cramersV) },
              { label: ta("effect"), value: effect },
            ]
          : [],
        assumptions: test ? await assumptionTexts(test.assumptions) : [],
        n: ct.n,
        notes,
        syntax: syntax.crosstab(row, col),
        visual: { kind: "heatmap", rowLabels: ct.rowLabels, colLabels: ct.colLabels, cells, intensity, caption: `${row.name} × ${col.name}` },
        table: {
          headers: [row.name, ...ct.colLabels, ta("total")],
          rows: [...ct.rowLabels.map((l, i) => [l, ...ct.counts[i]!.map(String), String(ct.rowTotals[i])]), [ta("total"), ...ct.colTotals.map(String), String(ct.n)]],
        },
      };
    }

    case "compare": {
      const y = v(p.y);
      const g = v(p.group);
      if (!y || !g || !isNumeric(y) || !isCategorical(g)) return null;
      const groups = groupRows(rows, g)
        .map((x) => ({ ...x, values: numericColumn(x.rows, y.id).filter((n): n is number => n !== null) }))
        .filter((x) => x.values.length > 0);
      if (groups.length < 2 || groups.some((x) => x.values.length < 2)) {
        return emptyResult(ta("notEnough"), syntax.anova(y, g));
      }
      const box: BoxRow[] = groups.flatMap((x) => {
        const b = boxStats(x.values);
        return b ? [{ ...b, label: x.category.label, mean: summarize(x.values).mean }] : [];
      });
      const statsTable: TableData = {
        headers: [ta("groups"), tr("n"), tr("mean"), tr("sd"), tr("median")],
        rows: groups.map((x) => {
          const s = summarize(x.values);
          return [x.category.label, s.n, nf(s.mean), nf(s.sd), nf(s.median, 1)];
        }),
      };
      const method = p.method ?? "auto";
      const n = groups.reduce((a, x) => a + x.values.length, 0);

      if (groups.length === 2) {
        const [a, b] = groups as [(typeof groups)[0], (typeof groups)[0]];
        const tt = independentTTest(a.values, b.values)!;
        const mw = mannWhitney(a.values, b.values)!;
        const useRanks = method === "nonparametric" || (method === "auto" && tt.assumptions.some((x) => x.key === "normality" && x.status === "warn"));
        if (useRanks) {
          const sig = mw.p < SIGNIFICANCE;
          return {
            headline: t(sig ? "mw.sig" : "mw.ns", { a: a.category.label, b: b.category.label, y: y.label, ma: nf(mw.medianA, 1), mb: nf(mw.medianB, 1), r: corr(mw.r), effect: t(`effects.${effectLabel.r(mw.r)}`) }),
            significant: sig,
            report: `U = ${nf(mw.u, 1)}, z = ${nf(mw.z)}, p ${formatP(mw.p)}, r = ${corr(mw.r)}`,
            details: [
              { label: ta("method"), value: "Mann–Whitney U" },
              { label: "U", value: nf(mw.u, 1) },
              { label: "z", value: nf(mw.z) },
              { label: "p", value: formatP(mw.p) },
              { label: "r", value: corr(mw.r) },
              { label: `Welch t(${nf(tt.df, 1)})`, value: `${nf(tt.t)}, p ${formatP(tt.p)}` },
            ],
            assumptions: await assumptionTexts([...mw.assumptions, ...tt.assumptions.filter((x) => x.key === "normality")]),
            n,
            notes: [],
            syntax: syntax.mannWhitney(y, g, a.category.value, b.category.value),
            visual: { kind: "box", rows: box },
            table: statsTable,
          };
        }
        const sig = tt.p < SIGNIFICANCE;
        return {
          headline: t(sig ? "ttest.sig" : "ttest.ns", { a: a.category.label, b: b.category.label, y: y.label, ma: nf(tt.meanA), mb: nf(tt.meanB), diff: nf(tt.diff), d: nf(tt.cohensD), effect: t(`effects.${effectLabel.d(tt.cohensD)}`) }),
          significant: sig,
          report: `t(${nf(tt.df, 2)}) = ${nf(tt.t)}, p ${formatP(tt.p)}, d = ${nf(tt.cohensD)}, 95% CI [${nf(tt.ci[0])}, ${nf(tt.ci[1])}]`,
          details: [
            { label: ta("method"), value: "Welch's t-test" },
            { label: "t", value: nf(tt.t) },
            { label: "df", value: nf(tt.df, 1) },
            { label: "p", value: formatP(tt.p) },
            { label: "Δ (95% CI)", value: `${nf(tt.diff)} [${nf(tt.ci[0])}, ${nf(tt.ci[1])}]` },
            { label: "Cohen's d", value: nf(tt.cohensD) },
            { label: "Mann–Whitney", value: `U = ${nf(mw.u, 1)}, p ${formatP(mw.p)}` },
          ],
          assumptions: await assumptionTexts(tt.assumptions),
          n,
          notes: [],
          syntax: syntax.tTest(y, g, a.category.value, b.category.value, true),
          visual: { kind: "box", rows: box },
          table: statsTable,
        };
      }

      const anova = oneWayAnova(groups.map((x) => x.values))!;
      const kw = kruskalWallis(groups.map((x) => x.values))!;
      const useRanks = method === "nonparametric" || (method === "auto" && anova.assumptions.some((x) => x.key === "normality" && x.status === "warn"));
      if (useRanks) {
        const sig = kw.p < SIGNIFICANCE;
        const top = groups[kw.groups.reduce((bi, gr, i, all) => (gr.meanRank > all[bi]!.meanRank ? i : bi), 0)]!;
        return {
          headline: t(sig ? "kw.sig" : "kw.ns", { y: y.label, k: groups.length, eps: nf(kw.epsilonSquared), effect: t(`effects.${effectLabel.eta2(kw.epsilonSquared)}`), top: top.category.label }),
          significant: sig,
          report: `H(${kw.df}) = ${nf(kw.h)}, p ${formatP(kw.p)}, ε² = ${nf(kw.epsilonSquared)}`,
          details: [
            { label: ta("method"), value: "Kruskal–Wallis H" },
            { label: "H", value: nf(kw.h) },
            { label: "df", value: String(kw.df) },
            { label: "p", value: formatP(kw.p) },
            { label: "ε²", value: nf(kw.epsilonSquared) },
            { label: `ANOVA F(${anova.df1}, ${anova.df2})`, value: `${nf(anova.f)}, p ${formatP(anova.p)}` },
          ],
          assumptions: await assumptionTexts([...kw.assumptions, ...anova.assumptions.filter((x) => x.key === "normality")]),
          n,
          notes: [],
          syntax: syntax.kruskal(y, g, groups.map((x) => x.category.value)),
          visual: { kind: "box", rows: box },
          table: statsTable,
        };
      }
      const sig = anova.p < SIGNIFICANCE;
      const ranked = groups.map((x, i) => ({ label: x.category.label, mean: anova.groups[i]!.mean })).sort((a, b) => b.mean - a.mean);
      const notes: string[] = [];
      if (anova.levene && anova.levene.p < SIGNIFICANCE && anova.welch) {
        notes.push(t("anova.welchNote", { p: formatP(anova.levene.p), df1: anova.welch.df1, df2: nf(anova.welch.df2, 1), f: nf(anova.welch.f), wp: formatP(anova.welch.p) }));
      }
      return {
        headline: t(sig ? "anova.sig" : "anova.ns", {
          y: y.label,
          k: groups.length,
          eta: nf(anova.etaSquared),
          effect: t(`effects.${effectLabel.eta2(anova.etaSquared)}`),
          top: ranked[0]!.label,
          topMean: nf(ranked[0]!.mean),
          bottom: ranked.at(-1)!.label,
          bottomMean: nf(ranked.at(-1)!.mean),
        }),
        significant: sig,
        report: `F(${anova.df1}, ${anova.df2}) = ${nf(anova.f)}, p ${formatP(anova.p)}, η² = ${nf(anova.etaSquared)}`,
        details: [
          { label: ta("method"), value: "One-way ANOVA" },
          { label: "F", value: nf(anova.f) },
          { label: "df", value: `${anova.df1}, ${anova.df2}` },
          { label: "p", value: formatP(anova.p) },
          { label: "η² / ω²", value: `${nf(anova.etaSquared)} / ${nf(anova.omegaSquared)}` },
          ...(anova.welch ? [{ label: `Welch F(${anova.welch.df1}, ${nf(anova.welch.df2, 1)})`, value: `${nf(anova.welch.f)}, p ${formatP(anova.welch.p)}` }] : []),
          { label: "Kruskal–Wallis", value: `H = ${nf(kw.h)}, p ${formatP(kw.p)}` },
        ],
        assumptions: await assumptionTexts(anova.assumptions),
        n,
        notes,
        syntax: syntax.anova(y, g),
        visual: { kind: "box", rows: box },
        table: statsTable,
      };
    }

    case "correlate": {
      const x = v(p.x);
      const y = v(p.y);
      if (!x || !y || !isNumeric(x) || !isNumeric(y) || x.id === y.id) return null;
      const method = p.method === "spearman" ? "spearman" : "pearson";
      const xs = numericColumn(rows, x.id);
      const ys = numericColumn(rows, y.id);
      const r = correlation(xs, ys, method);
      if (!r) return emptyResult(ta("notEnough"), syntax.correlation(x, y, method));
      const reg = method === "pearson" ? linearRegression(xs, ys) : null;
      const sig = r.p < SIGNIFICANCE;
      const symbol = method === "pearson" ? "r" : "ρ";
      const points = xs.flatMap((xv, i) => (xv !== null && ys[i] !== null ? [{ x: xv, y: ys[i]! }] : []));
      const notes = reg ? [t("corr.regression", { x: x.label, y: y.label, slope: nf(reg.slope), r2: num(reg.r2 * 100, 0) })] : [];
      return {
        headline: t(sig ? "corr.sig" : "corr.ns", {
          x: x.label,
          y: y.label,
          r: corr(r.r),
          symbol,
          effect: t(`effects.${effectLabel.r(r.r)}`),
          direction: t(r.r >= 0 ? "corr.positive" : "corr.negative"),
        }),
        significant: sig,
        report: `${symbol}(${r.df}) = ${corr(r.r)}, p ${formatP(r.p)}${r.ci ? `, 95% CI [${corr(r.ci[0])}, ${corr(r.ci[1])}]` : ""}`,
        details: [
          { label: ta("method"), value: method === "pearson" ? "Pearson r" : "Spearman ρ" },
          { label: symbol, value: corr(r.r) },
          { label: "p", value: formatP(r.p) },
          { label: "n", value: String(r.n) },
          ...(r.ci ? [{ label: "95% CI", value: `[${corr(r.ci[0])}, ${corr(r.ci[1])}]` }] : []),
          ...(reg ? [{ label: "R²", value: nf(reg.r2) }, { label: "b (slope)", value: `${nf(reg.slope)} [${nf(reg.ciSlope[0])}, ${nf(reg.ciSlope[1])}]` }] : []),
        ],
        assumptions: await assumptionTexts(r.assumptions),
        n: r.n,
        notes,
        syntax: syntax.correlation(x, y, method),
        visual: { kind: "scatter", points, xLabel: x.name, yLabel: y.name, line: reg ? { slope: reg.slope, intercept: reg.intercept } : null },
        table: null,
      };
    }

    case "paired": {
      const a = v(p.a);
      const b = v(p.b);
      if (!a || !b || !isNumeric(a) || !isNumeric(b) || a.id === b.id) return null;
      const r = pairedTTest(numericColumn(rows, a.id), numericColumn(rows, b.id));
      if (!r) return emptyResult(ta("notEnough"), syntax.paired(a, b));
      const sig = r.p < SIGNIFICANCE;
      const box = [a, b].flatMap((vv) => {
        const values = numericColumn(rows, vv.id).filter((n): n is number => n !== null);
        const s = boxStats(values);
        return s ? [{ ...s, label: vv.name, mean: summarize(values).mean }] : [];
      });
      return {
        headline: t(sig ? "paired.sig" : "paired.ns", { a: a.label, b: b.label, ma: nf(r.meanA), mb: nf(r.meanB), diff: nf(r.meanDiff), d: nf(r.cohensDz), effect: t(`effects.${effectLabel.d(r.cohensDz)}`) }),
        significant: sig,
        report: `t(${r.df}) = ${nf(r.t)}, p ${formatP(r.p)}, dz = ${nf(r.cohensDz)}, 95% CI [${nf(r.ci[0])}, ${nf(r.ci[1])}]`,
        details: [
          { label: ta("method"), value: "Paired t-test" },
          { label: "t", value: nf(r.t) },
          { label: "df", value: String(r.df) },
          { label: "p", value: formatP(r.p) },
          { label: "Δ (95% CI)", value: `${nf(r.meanDiff)} [${nf(r.ci[0])}, ${nf(r.ci[1])}]` },
          { label: "dz", value: nf(r.cohensDz) },
        ],
        assumptions: await assumptionTexts(r.assumptions),
        n: r.n,
        notes: [],
        syntax: syntax.paired(a, b),
        visual: { kind: "box", rows: box },
        table: null,
      };
    }

    case "reliability": {
      const items = (p.items ?? "").split(",").map((id) => v(id)).filter((x): x is Variable => !!x && isNumeric(x));
      if (items.length < 2) return null;
      const r = cronbachAlpha(items.map((it) => numericColumn(rows, it.id)));
      if (!r) return emptyResult(ta("notEnough"), syntax.reliability(items));
      const notes: string[] = [];
      const best = r.items.map((it, i) => ({ i, to: it.alphaIfDeleted ?? -1 })).sort((a, b) => b.to - a.to)[0];
      if (best && best.to > r.alpha + 0.02) notes.push(t("alpha.drop", { item: items[best.i]!.name, to: corr(best.to) }));
      r.items.forEach((it, i) => it.itemTotal < 0 && notes.push(t("alpha.reverse", { item: items[i]!.name })));
      return {
        headline: t("alpha.summary", { k: r.k, band: t(`alphaBands.${alphaLabel(r.alpha)}`), alpha: corr(r.alpha), n: r.n }),
        significant: null,
        report: `α = ${corr(r.alpha)} (${r.k} items, n = ${r.n})`,
        details: [
          { label: "Cronbach's α", value: corr(r.alpha) },
          { label: "Standardized α", value: corr(r.standardizedAlpha) },
          { label: ta("items"), value: String(r.k) },
        ],
        assumptions: await assumptionTexts(r.assumptions),
        n: r.n,
        notes,
        syntax: syntax.reliability(items),
        visual: { kind: "none" },
        table: {
          headers: [ta("items"), tr("mean"), tr("sd"), "Item–total r", "α if deleted"],
          rows: r.items.map((it, i) => [`${items[i]!.name} · ${items[i]!.label}`, nf(it.mean), nf(it.sd), corr(it.itemTotal), it.alphaIfDeleted === null ? "—" : corr(it.alphaIfDeleted)]),
        },
      };
    }

    case "matrix": {
      const vars = (p.vars ?? "").split(",").map((id) => v(id)).filter((x): x is Variable => !!x && isNumeric(x)).slice(0, 12);
      if (vars.length < 2) return null;
      const method = p.method === "spearman" ? "spearman" : "pearson";
      const cols = vars.map((vv) => numericColumn(rows, vv.id));
      const cells: string[][] = [];
      const intensity: number[][] = [];
      for (let i = 0; i < vars.length; i++) {
        cells.push([]);
        intensity.push([]);
        for (let j = 0; j < vars.length; j++) {
          if (i === j) {
            cells[i]!.push("—");
            intensity[i]!.push(0);
            continue;
          }
          const r = correlation(cols[i]!, cols[j]!, method);
          const stars = r ? (r.p < 0.001 ? "***" : r.p < 0.01 ? "**" : r.p < 0.05 ? "*" : "") : "";
          cells[i]!.push(r ? `${corr(r.r)}${stars}` : "—");
          intensity[i]!.push(r ? Math.abs(r.r) : 0);
        }
      }
      return {
        headline: ta("toolHint.matrix"),
        significant: null,
        report: "* p < .05, ** p < .01, *** p < .001 (two-tailed, pairwise deletion)",
        details: [],
        assumptions: [],
        n: rows.length,
        notes: [],
        syntax: syntax.correlationMatrix(vars, method),
        visual: { kind: "heatmap", rowLabels: vars.map((x) => x.name), colLabels: vars.map((x) => x.name), cells, intensity, caption: "Correlation matrix" },
        table: { headers: [ta("variables"), ""], rows: vars.map((x) => [x.name, x.label]) },
      };
    }

    case "prepare":
      return null;
  }
}

function emptyResult(headline: string, syn: Syntax): ToolResult {
  return { headline, significant: null, report: null, details: [], assumptions: [], n: 0, notes: [], syntax: syn, visual: { kind: "none" }, table: null };
}

