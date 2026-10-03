import type { Dataset } from "@/lib/analysis/dataset";
import { valueLabel, type Value, type Variable } from "@/lib/analysis/variables";

export type Cell = string | number | null;

/** Rows × variables, either as codes (for stats software) or as readable labels (for people). */
export function exportTable(dataset: Dataset, mode: "codes" | "labels", variables: Variable[] = dataset.variables) {
  const headers = variables.map((v) => v.name);
  const rows: Cell[][] = dataset.rows.map((r) =>
    variables.map((v) => {
      const value: Value = r.values[v.id] ?? null;
      if (mode === "labels" && typeof value === "number" && v.categories?.length) return valueLabel(v, value);
      return value;
    }),
  );
  return { headers, rows };
}

/** One row per variable: the codebook that travels with every export. */
export function codebook(variables: Variable[]) {
  return {
    headers: ["name", "label", "type", "measure", "values"],
    rows: variables.map((v) => [v.name, v.label, v.type, v.measure, v.categories?.map((c) => `${c.value}=${c.label}`).join("; ") ?? ""]),
  };
}
