import type { Variable } from "./variables";

/**
 * Equivalent R and SPSS syntax for each analysis, using the variable names of Lyze's exports
 * (R: the `lyze` data frame from lyze_import.R; SPSS: the exported data.sav). Lets researchers
 * reproduce, extend or report any result in the tool their field expects.
 */

export type Syntax = { r: string; spss: string };

const q = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

/** In R, nominal variables are factors with labels; everything else stays numeric (codes). */
function rLevels(v: Variable, values: number[]) {
  const labelled = v.measure === "nominal" && v.categories?.length && !(v.categories.length === 2 && v.categories.some((c) => c.label === "Selected"));
  if (!labelled) return `c(${values.join(", ")})`;
  return `c(${values.map((x) => q(v.categories!.find((c) => c.value === x)?.label ?? String(x))).join(", ")})`;
}

export const syntax = {
  frequencies: (v: Variable): Syntax => ({
    r: `table(lyze$${v.name}, useNA = "ifany")\nprop.table(table(lyze$${v.name})) * 100`,
    spss: `FREQUENCIES VARIABLES=${v.name}\n  /BARCHART PERCENT.`,
  }),
  descriptives: (v: Variable): Syntax => ({
    r: `summary(lyze$${v.name})\nsd(lyze$${v.name}, na.rm = TRUE)`,
    spss: `DESCRIPTIVES VARIABLES=${v.name}\n  /STATISTICS=MEAN STDDEV MIN MAX SEMEAN.\nEXAMINE VARIABLES=${v.name} /PLOT=BOXPLOT HISTOGRAM.`,
  }),
  crosstab: (row: Variable, col: Variable): Syntax => ({
    r: `tab <- table(lyze$${row.name}, lyze$${col.name})\ntab\nprop.table(tab, 2) * 100   # column %\nchisq.test(tab, correct = FALSE)\n# Small cells? fisher.test(tab)`,
    spss: `CROSSTABS\n  /TABLES=${row.name} BY ${col.name}\n  /STATISTICS=CHISQ PHI\n  /CELLS=COUNT ROW COLUMN EXPECTED.`,
  }),
  tTest: (y: Variable, g: Variable, a: number, b: number, welch: boolean): Syntax => ({
    r: `d <- droplevels(subset(lyze, ${g.name} %in% ${rLevels(g, [a, b])}))\nt.test(${y.name} ~ factor(${g.name}), data = d, var.equal = ${welch ? "FALSE" : "TRUE"})\n# effect size: effectsize::cohens_d(${y.name} ~ factor(${g.name}), data = d)`,
    spss: `T-TEST GROUPS=${g.name}(${a} ${b})\n  /VARIABLES=${y.name}\n  /ES DISPLAY(TRUE).`,
  }),
  anova: (y: Variable, g: Variable): Syntax => ({
    r: `summary(aov(${y.name} ~ factor(${g.name}), data = lyze))\noneway.test(${y.name} ~ factor(${g.name}), data = lyze)   # Welch\ncar::leveneTest(${y.name} ~ factor(${g.name}), data = lyze)\nTukeyHSD(aov(${y.name} ~ factor(${g.name}), data = lyze))`,
    spss: `ONEWAY ${y.name} BY ${g.name}\n  /STATISTICS DESCRIPTIVES HOMOGENEITY WELCH\n  /POSTHOC=TUKEY ALPHA(0.05).`,
  }),
  mannWhitney: (y: Variable, g: Variable, a: number, b: number): Syntax => ({
    r: `d <- droplevels(subset(lyze, ${g.name} %in% ${rLevels(g, [a, b])}))\nwilcox.test(${y.name} ~ factor(${g.name}), data = d, exact = FALSE, correct = TRUE)`,
    spss: `NPAR TESTS\n  /M-W=${y.name} BY ${g.name}(${a} ${b}).`,
  }),
  kruskal: (y: Variable, g: Variable, codes: number[]): Syntax => ({
    r: `kruskal.test(${y.name} ~ factor(${g.name}), data = lyze)`,
    spss: `NPAR TESTS\n  /K-W=${y.name} BY ${g.name}(${Math.min(...codes)} ${Math.max(...codes)}).`,
  }),
  correlation: (x: Variable, y: Variable, method: "pearson" | "spearman"): Syntax => ({
    r: `cor.test(lyze$${x.name}, lyze$${y.name}, method = ${q(method)})${method === "pearson" ? `\nsummary(lm(${y.name} ~ ${x.name}, data = lyze))` : ""}`,
    spss:
      method === "pearson"
        ? `CORRELATIONS\n  /VARIABLES=${x.name} ${y.name}\n  /PRINT=TWOTAIL NOSIG.\nREGRESSION\n  /DEPENDENT ${y.name}\n  /METHOD=ENTER ${x.name}.`
        : `NONPAR CORR\n  /VARIABLES=${x.name} ${y.name}\n  /PRINT=SPEARMAN TWOTAIL NOSIG.`,
  }),
  correlationMatrix: (vars: Variable[], method: "pearson" | "spearman"): Syntax => ({
    r: `round(cor(lyze[c(${vars.map((v) => q(v.name)).join(", ")})], use = "pairwise.complete.obs", method = ${q(method)}), 2)`,
    spss: method === "pearson" ? `CORRELATIONS\n  /VARIABLES=${vars.map((v) => v.name).join(" ")}\n  /PRINT=TWOTAIL NOSIG.` : `NONPAR CORR\n  /VARIABLES=${vars.map((v) => v.name).join(" ")}\n  /PRINT=SPEARMAN TWOTAIL NOSIG.`,
  }),
  paired: (a: Variable, b: Variable): Syntax => ({
    r: `t.test(lyze$${a.name}, lyze$${b.name}, paired = TRUE)`,
    spss: `T-TEST PAIRS=${a.name} WITH ${b.name} (PAIRED).`,
  }),
  reliability: (items: Variable[]): Syntax => ({
    r: `psych::alpha(lyze[c(${items.map((v) => q(v.name)).join(", ")})])`,
    spss: `RELIABILITY\n  /VARIABLES=${items.map((v) => v.name).join(" ")}\n  /SCALE('Scale') ALL\n  /MODEL=ALPHA\n  /SUMMARY=TOTAL.`,
  }),
};
