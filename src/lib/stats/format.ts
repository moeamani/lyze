/** APA-style p: "< .001", ".034" (no leading zero, 3 decimals). */
export function formatP(p: number): string {
  if (!Number.isFinite(p)) return "—";
  if (p < 0.001) return "< .001";
  return `= ${p.toFixed(3).replace(/^0/, "")}`;
}

/** Statistic with fixed decimals, minus sign as "−" for typography. */
export function num(x: number | null | undefined, digits = 2): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return "—";
  return x.toFixed(digits).replace(/^-/, "−");
}

/** Correlation-like values without the leading zero (r = .42), APA style. */
export function corr(x: number, digits = 2): string {
  return num(x, digits).replace(/^(−?)0\./, "$1.");
}

export function pct(x: number, digits = 0): string {
  return `${x.toFixed(digits)}%`;
}

export const SIGNIFICANCE = 0.05;
