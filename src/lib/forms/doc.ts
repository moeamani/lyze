// Zod-free helpers so the respondent bundle doesn't pull in the schema validator.
import type { FormDoc, Question } from "./schema";

export function allQuestions(doc: Pick<FormDoc, "pages">): Question[] {
  return doc.pages.flatMap((p) => p.questions);
}

export function findQuestion(doc: Pick<FormDoc, "pages">, questionId: string): Question | undefined {
  for (const page of doc.pages) {
    const q = page.questions.find((x) => x.id === questionId);
    if (q) return q;
  }
  return undefined;
}

export function pageIndexOfQuestion(doc: Pick<FormDoc, "pages">, questionId: string): number {
  return doc.pages.findIndex((p) => p.questions.some((q) => q.id === questionId));
}
