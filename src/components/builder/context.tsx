"use client";

import { createContext, useContext } from "react";
import type { FormDoc, Question } from "@/lib/forms/schema";

export type Selection = { kind: "question"; id: string } | { kind: "page"; id: string } | { kind: "form" } | null;

export type BuilderContextValue = {
  doc: FormDoc;
  update: (tag: string, mutate: (draft: FormDoc) => void) => void;
  selection: Selection;
  select: (s: Selection) => void;
  canEdit: boolean;
  captchaAvailable: boolean;
};

export const BuilderContext = createContext<BuilderContextValue | null>(null);

export function useBuilder() {
  const ctx = useContext(BuilderContext);
  if (!ctx) throw new Error("useBuilder must be used inside the form builder");
  return ctx;
}

/** Mutate one question in place inside an `update` callback. */
export function withQuestion(doc: FormDoc, id: string, fn: (q: Question) => void) {
  for (const page of doc.pages) {
    const q = page.questions.find((x) => x.id === id);
    if (q) {
      fn(q);
      return;
    }
  }
}

export function removeQuestionEverywhere(doc: FormDoc, id: string) {
  for (const page of doc.pages) page.questions = page.questions.filter((q) => q.id !== id);
  // Drop logic that depended on or targeted the question so nothing dangles.
  doc.logic = doc.logic
    .map((r) => ({ ...r, when: { ...r.when, conditions: r.when.conditions.filter((c) => c.questionId !== id) } }))
    .filter((r) => r.when.conditions.length > 0 && r.target !== id);
  for (const quota of doc.settings.quotas) quota.when.conditions = quota.when.conditions.filter((c) => c.questionId !== id);
  doc.settings.quotas = doc.settings.quotas.filter((q) => q.when.conditions.length > 0);
  for (const t of Object.values(doc.translations)) delete t.questions[id];
}
