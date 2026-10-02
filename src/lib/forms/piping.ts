import { answerToText, type Answers } from "./answers";
import { findQuestion } from "./doc";
import type { FormDoc } from "./schema";

/** `{{questionId}}` placeholders inside titles and descriptions. */
export const PIPE_PATTERN = /\{\{\s*([\w-]+)\s*\}\}/g;

/** Replace `{{questionId}}` tokens with the respondent's answer (or `fallback` when unanswered). */
export function pipe(text: string, doc: Pick<FormDoc, "pages">, answers: Answers, fallback = "…"): string {
  if (!text.includes("{{")) return text;
  return text.replace(PIPE_PATTERN, (_, id: string) => {
    const question = findQuestion(doc, id);
    if (!question) return fallback;
    return answerToText(question, answers[id]) || fallback;
  });
}

export function pipeToken(questionId: string) {
  return `{{${questionId}}}`;
}

export function referencedQuestions(text: string): string[] {
  return [...text.matchAll(PIPE_PATTERN)].map((m) => m[1]!);
}
