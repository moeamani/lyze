"use client";

import { useTranslations } from "next-intl";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { FORM_LANGUAGES, languageDirection } from "@/lib/forms/i18n";
import { UI_LABEL_KEYS, type FormDoc, type Translation } from "@/lib/forms/schema";
import { useBuilder } from "./context";

type Entry = {
  key: string;
  source: string;
  get: (t: Translation) => string | undefined;
  set: (t: Translation, value: string | undefined) => void;
};

function entriesFor(doc: FormDoc, uiDefaults: Record<string, string>): { group: string; entries: Entry[] }[] {
  const groups: { group: string; entries: Entry[] }[] = [];
  const form: Entry[] = [
    { key: "title", source: doc.title, get: (t) => t.title, set: (t, v) => (t.title = v) },
  ];
  if (doc.description) form.push({ key: "description", source: doc.description, get: (t) => t.description, set: (t, v) => (t.description = v) });
  if (doc.settings.thankYouTitle) form.push({ key: "ty", source: doc.settings.thankYouTitle, get: (t) => t.thankYouTitle, set: (t, v) => (t.thankYouTitle = v) });
  if (doc.settings.thankYouMessage) form.push({ key: "tym", source: doc.settings.thankYouMessage, get: (t) => t.thankYouMessage, set: (t, v) => (t.thankYouMessage = v) });
  groups.push({ group: doc.title || "Form", entries: form });

  for (const page of doc.pages) {
    const entries: Entry[] = [];
    const pg = (t: Translation) => (t.pages[page.id] ??= {});
    if (page.title) entries.push({ key: `${page.id}.t`, source: page.title, get: (t) => t.pages[page.id]?.title, set: (t, v) => (pg(t).title = v) });
    if (page.description) entries.push({ key: `${page.id}.d`, source: page.description, get: (t) => t.pages[page.id]?.description, set: (t, v) => (pg(t).description = v) });
    for (const q of page.questions) {
      const qt = (t: Translation) => (t.questions[q.id] ??= {});
      entries.push({ key: `${q.id}.t`, source: q.title, get: (t) => t.questions[q.id]?.title, set: (t, v) => (qt(t).title = v) });
      if (q.description) entries.push({ key: `${q.id}.d`, source: q.description, get: (t) => t.questions[q.id]?.description, set: (t, v) => (qt(t).description = v) });
      const list = (field: "options" | "rows" | "columns", items: { id: string; label: string }[]) => {
        for (const o of items) {
          entries.push({
            key: `${q.id}.${field}.${o.id}`,
            source: o.label,
            get: (t) => t.questions[q.id]?.[field]?.[o.id],
            set: (t, v) => {
              const map = (qt(t)[field] ??= {});
              if (v) map[o.id] = v;
              else delete map[o.id];
            },
          });
        }
      };
      switch (q.type) {
        case "short_text":
        case "long_text":
          if (q.config.placeholder) entries.push({ key: `${q.id}.ph`, source: q.config.placeholder, get: (t) => t.questions[q.id]?.placeholder, set: (t, v) => (qt(t).placeholder = v) });
          break;
        case "single_choice":
        case "multiple_choice":
        case "dropdown":
        case "ranking":
          list("options", q.config.options);
          break;
        case "matrix":
          list("rows", q.config.rows);
          list("columns", q.config.columns);
          break;
        case "likert":
          q.config.labels.forEach((label, i) =>
            entries.push({
              key: `${q.id}.l${i}`,
              source: label,
              get: (t) => t.questions[q.id]?.labels?.[i] || undefined,
              set: (t, v) => {
                const labels = (qt(t).labels ??= []);
                labels[i] = v ?? "";
              },
            }),
          );
          break;
        case "nps":
        case "slider": {
          const low = q.type === "nps" ? q.config.lowLabel : q.config.minLabel;
          const high = q.type === "nps" ? q.config.highLabel : q.config.maxLabel;
          if (low) entries.push({ key: `${q.id}.lo`, source: low, get: (t) => t.questions[q.id]?.lowLabel, set: (t, v) => (qt(t).lowLabel = v) });
          if (high) entries.push({ key: `${q.id}.hi`, source: high, get: (t) => t.questions[q.id]?.highLabel, set: (t, v) => (qt(t).highLabel = v) });
          break;
        }
      }
    }
    groups.push({ group: page.title || `#${doc.pages.indexOf(page) + 1}`, entries });
  }

  groups.push({
    group: "UI",
    entries: UI_LABEL_KEYS.map((k) => ({
      key: `ui.${k}`,
      source: uiDefaults[k] ?? k,
      get: (t) => t.ui[k],
      set: (t, v) => {
        if (v) t.ui[k] = v;
        else delete t.ui[k];
      },
    })),
  });
  return groups;
}

export function TranslationsDialog({ lang, onClose }: { lang: string; onClose: () => void }) {
  const t = useTranslations("builder");
  const tr = useTranslations("respondent");
  const tc = useTranslations("common");
  const { doc, update } = useBuilder();
  const translation = doc.translations[lang] ?? { pages: {}, questions: {}, ui: {} };
  const uiDefaults: Record<string, string> = {
    start: tr("start"),
    next: tr("next"),
    back: tr("back"),
    submit: tr("submit"),
    required: tr("required"),
    other: tr("other"),
    saveLater: tr("saveLater"),
    chooseFile: tr("chooseFile"),
    record: tr("record"),
    stop: tr("stop"),
  };
  const groups = entriesFor(doc, uiDefaults).map((g, i, all) => (i === all.length - 1 ? { ...g, group: t("uiLabels") } : g));
  const all = groups.flatMap((g) => g.entries).filter((e) => e.source);
  const done = all.filter((e) => e.get(translation)).length;
  const dir = languageDirection(lang);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent closeLabel={tc("close")} className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {t("translationsTitle")} · {FORM_LANGUAGES[lang] ?? lang}
          </DialogTitle>
          <DialogDescription>
            {t("translationsHint")} {t("translationProgress", { done, total: all.length })}
          </DialogDescription>
        </DialogHeader>
        <div className="grid max-h-[65dvh] gap-6 overflow-y-auto pe-1">
          {groups.map((g) => (
            <section key={g.group} className="grid gap-3">
              <h3 className="text-sm font-semibold">{g.group}</h3>
              {g.entries
                .filter((e) => e.source)
                .map((e) => (
                  <div key={e.key} className="grid gap-1.5 sm:grid-cols-2 sm:items-center sm:gap-3">
                    <p className="text-sm break-words text-muted-foreground" id={`src-${e.key}`}>
                      {e.source}
                    </p>
                    <Input
                      dir={dir}
                      lang={lang}
                      aria-describedby={`src-${e.key}`}
                      aria-label={e.source}
                      value={e.get(translation) ?? ""}
                      placeholder={e.source}
                      onChange={(ev) =>
                        update(`tr:${lang}:${e.key}`, (d) => {
                          const target = (d.translations[lang] ??= { pages: {}, questions: {}, ui: {} });
                          e.set(target, ev.target.value || undefined);
                        })
                      }
                    />
                  </div>
                ))}
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
