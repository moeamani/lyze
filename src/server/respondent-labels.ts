import "server-only";
import { isLocale } from "@/i18n/config";
import { loadMessages } from "@/i18n/messages";
import type { RunnerLabels } from "@/components/form-runner/labels";
import { UI_LABEL_KEYS, type FormDoc } from "@/lib/forms/schema";

/**
 * Respondent UI strings for a form language: Lyze's own translations when we have them, English
 * otherwise, then the form author's overrides (e.g. their own "Next" / "Submit" wording).
 */
export async function respondentLabels(doc: FormDoc, lang: string): Promise<RunnerLabels> {
  const base = lang.split("-")[0]!;
  const messages = await loadMessages(isLocale(base) ? base : "en");
  const { questionCount: _q, minutes: _m, ...labels } = messages.respondent;
  void _q;
  void _m;
  const overrides = doc.translations[lang]?.ui ?? {};
  const out: RunnerLabels = { ...labels, errors: { ...labels.errors } };
  for (const key of UI_LABEL_KEYS) {
    const value = overrides[key];
    if (value) (out as Record<string, unknown>)[key] = value;
  }
  return out;
}

/** Pick the form language: explicit ?lang, else the browser's preference, else the form default. */
export function pickFormLanguage(doc: FormDoc, requested: string | undefined, acceptLanguage: string | null): string {
  const available = [doc.settings.defaultLanguage, ...doc.settings.languages];
  if (requested && available.includes(requested)) return requested;
  for (const part of (acceptLanguage ?? "").split(",")) {
    const tag = part.split(";")[0]!.trim().toLowerCase();
    const match = available.find((l) => l.toLowerCase() === tag) ?? available.find((l) => l.toLowerCase() === tag.split("-")[0]);
    if (match) return match;
  }
  return doc.settings.defaultLanguage;
}
