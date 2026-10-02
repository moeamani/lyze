import type en from "../../../messages/en.json";

/** Raw respondent strings. `{name}` placeholders are filled with `fmt`. ICU plurals are resolved server-side. */
export type RunnerLabels = Omit<(typeof en)["respondent"], "questionCount" | "minutes">;

export function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, key: string) => (key in vars ? String(vars[key]) : m));
}
