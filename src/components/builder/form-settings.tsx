"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { LanguagesIcon, PlusIcon, Trash2Icon, XIcon } from "lucide-react";
import { RadioGroup as RadioGroupPrimitive } from "radix-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { swatchClass } from "@/components/common/swatch";
import { FORM_LANGUAGES } from "@/lib/forms/i18n";
import { newRuleId } from "@/lib/forms/questions";
import { FORM_ACCENTS, ONE_RESPONSE_MODES, allQuestions, type FormDoc } from "@/lib/forms/schema";
import { cn } from "@/lib/utils";
import { useBuilder } from "./context";
import { ConditionGroupEditor, operatorsFor } from "./logic-editor";
import { Field, NumberInput, Section, SwitchRow } from "./question-editor";
import { TranslationsDialog } from "./translations-dialog";

export function FormSettings() {
  const t = useTranslations("builder");
  const tp = useTranslations("projects");
  const { doc, update, canEdit, captchaAvailable } = useBuilder();
  const [translating, setTranslating] = useState<string | null>(null);
  const s = doc.settings;
  const set = (field: string, fn: (d: FormDoc) => void) => update(`form:${field}`, fn);
  const usedLangs = new Set([s.defaultLanguage, ...s.languages]);

  return (
    <fieldset disabled={!canEdit} className="grid min-w-0 gap-6">
      <Section title={t("general")}>
        <Field label={t("formTitle")} htmlFor="form-title">
          <Input id="form-title" value={doc.title} onChange={(e) => set("title", (d) => (d.title = e.target.value))} />
        </Field>
        <Field label={t("formDescription")} htmlFor="form-desc">
          <Textarea id="form-desc" rows={3} value={doc.description ?? ""} onChange={(e) => set("description", (d) => (d.description = e.target.value || undefined))} />
        </Field>
      </Section>

      <Section title={t("thankYou")}>
        <Field label={t("thankYouTitle")} htmlFor="ty-title">
          <Input id="ty-title" value={s.thankYouTitle ?? ""} onChange={(e) => set("tyTitle", (d) => (d.settings.thankYouTitle = e.target.value || undefined))} />
        </Field>
        <Field label={t("thankYouMessage")} htmlFor="ty-msg">
          <Textarea id="ty-msg" rows={2} value={s.thankYouMessage ?? ""} onChange={(e) => set("tyMsg", (d) => (d.settings.thankYouMessage = e.target.value || undefined))} />
        </Field>
        <Field label={t("closedMessage")} htmlFor="closed-msg">
          <Textarea id="closed-msg" rows={2} value={s.closedMessage ?? ""} onChange={(e) => set("closedMsg", (d) => (d.settings.closedMessage = e.target.value || undefined))} />
        </Field>
      </Section>

      <Section title={t("behavior")}>
        <SwitchRow id="set-progress" label={t("progressBar")} checked={s.progressBar} onChange={(v) => set("progress", (d) => (d.settings.progressBar = v))} />
        <SwitchRow id="set-numbers" label={t("showNumbers")} checked={s.showQuestionNumbers} onChange={(v) => set("numbers", (d) => (d.settings.showQuestionNumbers = v))} />
        <SwitchRow id="set-resume" label={t("allowResume")} checked={s.allowResume} onChange={(v) => set("resume", (d) => (d.settings.allowResume = v))} />
        <Field label={t("oneResponse")} htmlFor="set-one" hint={t(`oneResponseHints.${s.oneResponse}`)}>
          <Select value={s.oneResponse} onValueChange={(v) => set("one", (d) => (d.settings.oneResponse = v as typeof s.oneResponse))}>
            <SelectTrigger id="set-one" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ONE_RESPONSE_MODES.map((m) => (
                <SelectItem key={m} value={m}>
                  {t(`oneResponseModes.${m}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <SwitchRow
          id="set-captcha"
          label={t("captcha")}
          hint={captchaAvailable ? undefined : t("captchaUnavailable")}
          checked={s.captcha}
          disabled={!captchaAvailable && !s.captcha}
          onChange={(v) => set("captcha", (d) => (d.settings.captcha = v))}
        />
      </Section>

      <Section title={t("theme")}>
        <Field label={t("accent")}>
          <RadioGroupPrimitive.Root
            value={s.theme.accent}
            onValueChange={(v) => set("accent", (d) => (d.settings.theme.accent = v as typeof s.theme.accent))}
            className="flex flex-wrap gap-2"
            aria-label={t("accent")}
          >
            {FORM_ACCENTS.map((c) => (
              <RadioGroupPrimitive.Item
                key={c}
                value={c}
                aria-label={tp(`colors.${c}`)}
                className="grid size-11 place-items-center rounded-xl border-2 border-transparent outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 data-[state=checked]:border-foreground/70"
              >
                <span className={cn("size-6 rounded-full", swatchClass(c))} />
              </RadioGroupPrimitive.Item>
            ))}
          </RadioGroupPrimitive.Root>
        </Field>
        <Field label={t("background")}>
          <ToggleGroup type="single" value={s.theme.background} onValueChange={(v) => v && set("bg", (d) => (d.settings.theme.background = v as typeof s.theme.background))} className="w-full" aria-label={t("background")}>
            {(["tinted", "plain"] as const).map((b) => (
              <ToggleGroupItem key={b} value={b}>
                {t(`backgrounds.${b}`)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Field>
        <Field label={t("corners")}>
          <ToggleGroup type="single" value={s.theme.corners} onValueChange={(v) => v && set("corners", (d) => (d.settings.theme.corners = v as typeof s.theme.corners))} className="w-full" aria-label={t("corners")}>
            {(["square", "soft", "round"] as const).map((c) => (
              <ToggleGroupItem key={c} value={c}>
                {t(`cornerStyles.${c}`)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Field>
      </Section>

      <Section title={t("languages")}>
        <Field label={t("defaultLanguage")} htmlFor="lang-default">
          <Select
            value={s.defaultLanguage}
            onValueChange={(v) =>
              set("defaultLang", (d) => {
                d.settings.defaultLanguage = v;
                d.settings.languages = d.settings.languages.filter((l) => l !== v);
              })
            }
          >
            <SelectTrigger id="lang-default" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(FORM_LANGUAGES).map(([code, label]) => (
                <SelectItem key={code} value={code}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        {s.languages.length > 0 && (
          <ul className="grid gap-2">
            {s.languages.map((code) => (
              <li key={code} className="flex items-center gap-2 rounded-xl border bg-card p-2 ps-3 text-sm shadow-soft">
                <span className="flex-1">{FORM_LANGUAGES[code] ?? code}</span>
                <Button type="button" variant="ghost" size="sm" onClick={() => setTranslating(code)}>
                  <LanguagesIcon />
                  {t("editTranslations")}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("removeLanguage", { language: FORM_LANGUAGES[code] ?? code })}
                  onClick={() =>
                    set("removeLang", (d) => {
                      d.settings.languages = d.settings.languages.filter((l) => l !== code);
                      delete d.translations[code];
                    })
                  }
                >
                  <XIcon />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <Select
          value=""
          onValueChange={(code) =>
            set("addLang", (d) => {
              d.settings.languages.push(code);
              d.translations[code] ??= { pages: {}, questions: {}, ui: {} };
            })
          }
        >
          <SelectTrigger className="w-full" aria-label={t("addLanguage")}>
            <SelectValue placeholder={t("addLanguage")} />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(FORM_LANGUAGES)
              .filter(([code]) => !usedLangs.has(code))
              .map(([code, label]) => (
                <SelectItem key={code} value={code}>
                  {label}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </Section>

      <Quotas />

      {translating && <TranslationsDialog lang={translating} onClose={() => setTranslating(null)} />}
    </fieldset>
  );
}

function Quotas() {
  const t = useTranslations("builder");
  const { doc, update, canEdit } = useBuilder();
  const questions = allQuestions(doc);
  const quotas = doc.settings.quotas;
  const setQuota = (id: string, field: string, fn: (q: (typeof quotas)[number]) => void) =>
    update(`quota:${id}:${field}`, (d) => {
      const q = d.settings.quotas.find((x) => x.id === id);
      if (q) fn(q);
    });

  return (
    <Section title={t("quotas")} hint={t("quotasHint")}>
      {quotas.map((quota) => (
        <div key={quota.id} className="grid gap-3 rounded-xl border bg-card p-3 shadow-soft">
          <div className="grid grid-cols-[1fr_6rem_auto] items-end gap-2">
            <Field label={t("quotaName")} htmlFor={`qn-${quota.id}`}>
              <Input id={`qn-${quota.id}`} value={quota.name} onChange={(e) => setQuota(quota.id, "name", (q) => (q.name = e.target.value))} />
            </Field>
            <Field label={t("quotaLimit")} htmlFor={`ql-${quota.id}`}>
              <NumberInput id={`ql-${quota.id}`} min={1} value={quota.limit} onChange={(v) => setQuota(quota.id, "limit", (q) => (q.limit = Math.max(1, Math.round(v ?? 1))))} />
            </Field>
            <Button type="button" variant="ghost" size="icon" aria-label={t("delete")} onClick={() => update("quota", (d) => (d.settings.quotas = d.settings.quotas.filter((q) => q.id !== quota.id)))}>
              <Trash2Icon />
            </Button>
          </div>
          <p className="text-xs font-medium text-muted-foreground">{t("quotaWhen")}</p>
          <ConditionGroupEditor group={quota.when} eligible={questions} onChange={(when) => setQuota(quota.id, "when", (q) => (q.when = when))} />
          <Field label={t("quotaMessage")} htmlFor={`qm-${quota.id}`}>
            <Input id={`qm-${quota.id}`} value={quota.message ?? ""} onChange={(e) => setQuota(quota.id, "message", (q) => (q.message = e.target.value || undefined))} />
          </Field>
        </div>
      ))}
      {canEdit && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-fit"
          disabled={questions.length === 0}
          onClick={() => {
            const q = questions[0];
            update("quota", (d) =>
              d.settings.quotas.push({
                id: newRuleId(),
                name: `${t("quotas")} ${d.settings.quotas.length + 1}`,
                limit: 100,
                when: { match: "all", conditions: [{ questionId: q?.id ?? "", operator: operatorsFor(q)[0]! }] },
              }),
            );
          }}
        >
          <PlusIcon />
          {t("addQuota")}
        </Button>
      )}
    </Section>
  );
}
