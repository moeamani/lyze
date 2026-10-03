import "server-only";
import { conditionGroupSchema, type ConditionGroup } from "@/lib/forms/schema";
import { isCategorical, type Dataset } from "@/lib/analysis/dataset";

/** Segment filter from the `f` search param (JSON condition group), validated. */
export function parseFilter(raw: string | string[] | undefined): ConditionGroup | null {
  if (typeof raw !== "string" || !raw) return null;
  try {
    const parsed = conditionGroupSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Variables people can split results by: single-answer categorical questions and recodes. */
export function compareOptions(dataset: Dataset) {
  return dataset.variables
    .filter((v) => (v.role === "question" || v.role === "recode") && isCategorical(v) && !v.group && (v.categories?.length ?? 0) <= 12)
    .map((v) => ({ id: v.id, label: `${v.name} · ${v.label}` }));
}

export function str(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" ? v : undefined;
}
