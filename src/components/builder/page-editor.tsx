"use client";

import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Page } from "@/lib/forms/schema";
import { useBuilder } from "./context";
import { RulesForPage } from "./logic-editor";
import { Field, Section, SwitchRow } from "./question-editor";

export function PageEditor({ page }: { page: Page }) {
  const t = useTranslations("builder");
  const { doc, update, canEdit } = useBuilder();
  const index = doc.pages.findIndex((p) => p.id === page.id);
  const set = (field: string, fn: (p: Page) => void) =>
    update(`page:${page.id}:${field}`, (d) => {
      const p = d.pages.find((x) => x.id === page.id);
      if (p) fn(p);
    });

  return (
    <fieldset disabled={!canEdit} className="grid min-w-0 gap-6">
      <Section title={`${t("pageSettings")} · ${t("page", { n: index + 1 })}`}>
        <Field label={t("formTitle")} htmlFor={`pt-${page.id}`}>
          <Input id={`pt-${page.id}`} placeholder={t("untitledPage")} value={page.title ?? ""} onChange={(e) => set("title", (p) => (p.title = e.target.value || undefined))} />
        </Field>
        <Field label={t("description")} htmlFor={`pd-${page.id}`}>
          <Textarea id={`pd-${page.id}`} rows={3} value={page.description ?? ""} onChange={(e) => set("description", (p) => (p.description = e.target.value || undefined))} />
        </Field>
        <SwitchRow id={`ps-${page.id}`} label={t("shuffleQuestions")} checked={page.shuffleQuestions} onChange={(v) => set("shuffle", (p) => (p.shuffleQuestions = v))} />
      </Section>
      <Section title={t("logicFromPage")} hint={t("logicHint")}>
        <RulesForPage pageId={page.id} />
      </Section>
    </fieldset>
  );
}
