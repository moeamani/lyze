import { DEFAULT_LOCALE, type Locale } from "./config";
import en from "../../messages/en.json";

export type Messages = typeof en;

function deepMerge<T extends Record<string, unknown>>(base: T, override: Record<string, unknown>): T {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const current = out[key];
    out[key] =
      value && typeof value === "object" && current && typeof current === "object"
        ? deepMerge(current as Record<string, unknown>, value as Record<string, unknown>)
        : value;
  }
  return out as T;
}

export async function loadMessages(locale: Locale): Promise<Messages> {
  if (locale === DEFAULT_LOCALE) return en;
  const partial = (await import(`../../messages/${locale}.json`)).default as Record<string, unknown>;
  // Untranslated keys fall back to English instead of rendering raw keys.
  return deepMerge(en, partial);
}
