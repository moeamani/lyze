import type { FormDoc, Question, Translation } from "./schema";

/** Return a copy of the form with text replaced by the given language's translations (falls back per string). */
export function localize(doc: FormDoc, lang: string | undefined): FormDoc {
  if (!lang || lang === doc.settings.defaultLanguage) return doc;
  const t: Translation | undefined = doc.translations[lang];
  if (!t) return doc;

  return {
    ...doc,
    title: t.title || doc.title,
    description: t.description || doc.description,
    settings: {
      ...doc.settings,
      thankYouTitle: t.thankYouTitle || doc.settings.thankYouTitle,
      thankYouMessage: t.thankYouMessage || doc.settings.thankYouMessage,
    },
    pages: doc.pages.map((page) => ({
      ...page,
      title: t.pages[page.id]?.title || page.title,
      description: t.pages[page.id]?.description || page.description,
      questions: page.questions.map((q) => localizeQuestion(q, t)),
    })),
  };
}

function relabel<T extends { id: string; label: string }>(items: T[], map: Record<string, string> | undefined): T[] {
  if (!map) return items;
  return items.map((o) => ({ ...o, label: map[o.id] || o.label }));
}

function localizeQuestion(q: Question, t: Translation): Question {
  const qt = t.questions[q.id];
  if (!qt) return q;
  const base = { ...q, title: qt.title || q.title, description: qt.description || q.description };
  switch (base.type) {
    case "short_text":
      return { ...base, config: { ...base.config, placeholder: qt.placeholder || base.config.placeholder } };
    case "long_text":
      return { ...base, config: { ...base.config, placeholder: qt.placeholder || base.config.placeholder } };
    case "single_choice":
    case "multiple_choice":
    case "dropdown":
    case "ranking":
      return { ...base, config: { ...base.config, options: relabel(base.config.options, qt.options) } } as Question;
    case "matrix":
      return {
        ...base,
        config: { ...base.config, rows: relabel(base.config.rows, qt.rows), columns: relabel(base.config.columns, qt.columns) },
      };
    case "likert":
      return {
        ...base,
        config: { ...base.config, labels: base.config.labels.map((l, i) => qt.labels?.[i] || l) },
      };
    case "nps":
      return {
        ...base,
        config: { ...base.config, lowLabel: qt.lowLabel || base.config.lowLabel, highLabel: qt.highLabel || base.config.highLabel },
      };
    case "slider":
      return {
        ...base,
        config: { ...base.config, minLabel: qt.lowLabel || base.config.minLabel, maxLabel: qt.highLabel || base.config.maxLabel },
      };
    default:
      return base;
  }
}

/** Common language codes offered in the builder (any BCP-47 code also works). */
export const FORM_LANGUAGES: Record<string, string> = {
  en: "English",
  es: "Español",
  fr: "Français",
  de: "Deutsch",
  pt: "Português",
  it: "Italiano",
  nl: "Nederlands",
  ar: "العربية",
  fa: "فارسی",
  he: "עברית",
  hi: "हिन्दी",
  zh: "中文",
  ja: "日本語",
  ko: "한국어",
  tr: "Türkçe",
  ru: "Русский",
  uk: "Українська",
  pl: "Polski",
  sw: "Kiswahili",
};

const RTL_LANGS = new Set(["ar", "fa", "he", "ur"]);
export function languageDirection(lang: string): "ltr" | "rtl" {
  return RTL_LANGS.has(lang.split("-")[0]!) ? "rtl" : "ltr";
}
