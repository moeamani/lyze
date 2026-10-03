import { chiSquareIndependence, type ChiSquareResult } from "@/lib/stats/tests";
import type { DatasetRow } from "./dataset";
import type { Variable } from "./variables";

export type Crosstab = {
  rowVar: Variable;
  colVar: Variable;
  rowLabels: string[];
  colLabels: string[];
  counts: number[][];
  rowTotals: number[];
  colTotals: number[];
  n: number;
  /** Cases missing either variable. */
  missing: number;
  test: ChiSquareResult | null;
};

/** Contingency table of two categorical variables with a chi-square test of independence. */
export function crosstab(rows: readonly DatasetRow[], rowVar: Variable, colVar: Variable): Crosstab {
  const rc = rowVar.categories ?? [];
  const cc = colVar.categories ?? [];
  const counts = rc.map(() => cc.map(() => 0));
  let missing = 0;
  for (const r of rows) {
    const i = rc.findIndex((c) => c.value === r.values[rowVar.id]);
    const j = cc.findIndex((c) => c.value === r.values[colVar.id]);
    if (i < 0 || j < 0) {
      missing++;
      continue;
    }
    counts[i]![j]!++;
  }
  const rowTotals = counts.map((row) => row.reduce((a, b) => a + b, 0));
  const colTotals = cc.map((_, j) => counts.reduce((a, row) => a + row[j]!, 0));
  return {
    rowVar,
    colVar,
    rowLabels: rc.map((c) => c.label),
    colLabels: cc.map((c) => c.label),
    counts,
    rowTotals,
    colTotals,
    n: rowTotals.reduce((a, b) => a + b, 0),
    missing,
    test: chiSquareIndependence(counts),
  };
}
