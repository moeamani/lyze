/**
 * Chart colors come from CSS tokens (see globals.css) so light/dark are handled in one place.
 * Categorical slots are assigned in fixed order and never cycled: past 8 series, fold into "Other".
 */
export const SERIES = Array.from({ length: 8 }, (_, i) => `var(--series-${i + 1})`);
export const MAX_SERIES = SERIES.length;

export function seriesColor(i: number) {
  return SERIES[Math.min(i, SERIES.length - 1)]!;
}

/**
 * Diverging scale for ordered agreement-style answers: k points from the negative pole through a
 * neutral gray midpoint to the positive pole (lightness steps via color-mix with the midpoint).
 */
export function divergingColor(i: number, k: number) {
  if (k <= 1) return "var(--diverge-mid)";
  const mid = (k - 1) / 2;
  const d = (i - mid) / mid; // −1 … 1
  if (Math.abs(d) < 1e-9) return "var(--diverge-mid)";
  const pole = d < 0 ? "var(--diverge-neg)" : "var(--diverge-pos)";
  const strength = Math.round(35 + 65 * Math.abs(d));
  return `color-mix(in oklab, ${pole} ${strength}%, var(--diverge-mid))`;
}

/** Sequential single-hue scale (heatmaps): from the card surface toward series-1. */
export function heatColor(t: number) {
  const s = Math.round(8 + Math.max(0, Math.min(1, t)) * 82);
  return `color-mix(in oklab, var(--series-1) ${s}%, var(--card))`;
}

/** Ink that stays readable on a heat cell. */
export function heatInk(t: number) {
  return t > 0.55 ? "white" : "var(--foreground)";
}
