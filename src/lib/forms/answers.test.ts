import { describe, expect, it } from "vitest";
import { answerColumns, answerToText, isAnswered, OTHER, validateAnswer } from "./answers";
import { createQuestion } from "./questions";
import type { Question } from "./schema";

const make = <T extends Question["type"]>(type: T, patch: Partial<Extract<Question, { type: T }>["config"]> = {}) => {
  const q = createQuestion(type) as Extract<Question, { type: T }>;
  Object.assign(q.config, patch);
  return q;
};

describe("validateAnswer", () => {
  it("enforces required", () => {
    expect(validateAnswer(make("short_text"), "", true)).toEqual({ ok: false, error: "required" });
    expect(validateAnswer(make("short_text"), undefined, false)).toEqual({ ok: true, value: undefined });
  });

  it("trims text and checks formats", () => {
    expect(validateAnswer(make("short_text"), "  hi ")).toEqual({ ok: true, value: "hi" });
    expect(validateAnswer(make("short_text", { format: "email" }), "nope")).toEqual({ ok: false, error: "email" });
    expect(validateAnswer(make("short_text", { format: "email" }), "a@b.co").ok).toBe(true);
    expect(validateAnswer(make("long_text", { maxLength: 3 }), "abcd")).toEqual({ ok: false, error: "tooLong" });
  });

  it("checks choices against options, including Other", () => {
    const q = make("single_choice");
    const first = q.config.options[0]!.id;
    expect(validateAnswer(q, { choice: first })).toEqual({ ok: true, value: { choice: first } });
    expect(validateAnswer(q, { choice: "bogus" })).toEqual({ ok: false, error: "invalid" });
    expect(validateAnswer(q, { choice: OTHER, other: "x" })).toEqual({ ok: false, error: "invalid" });
    q.config.allowOther = true;
    expect(validateAnswer(q, { choice: OTHER, other: "  " })).toEqual({ ok: false, error: "otherMissing" });
    expect(validateAnswer(q, { choice: OTHER, other: " teal " })).toEqual({ ok: true, value: { choice: OTHER, other: "teal" } });
  });

  it("enforces selection limits", () => {
    const q = make("multiple_choice", { minSelected: 2, maxSelected: 2 });
    const [a, b, c] = q.config.options.map((o) => o.id);
    expect(validateAnswer(q, { choices: [a!] })).toEqual({ ok: false, error: "minSelected" });
    expect(validateAnswer(q, { choices: [a!, b!, c!] })).toEqual({ ok: false, error: "maxSelected" });
    expect(validateAnswer(q, { choices: [a!, b!, a!] })).toEqual({ ok: true, value: { choices: [a, b] } });
  });

  it("checks scale ranges", () => {
    expect(validateAnswer(make("rating"), 6)).toEqual({ ok: false, error: "max" });
    expect(validateAnswer(make("nps"), 0)).toEqual({ ok: true, value: 0 });
    expect(validateAnswer(make("likert"), 2.5)).toEqual({ ok: false, error: "invalid" });
    expect(validateAnswer(make("slider", { min: 0, max: 10 }), 10)).toEqual({ ok: true, value: 10 });
    expect(validateAnswer(make("number", { integer: true }), 1.5)).toEqual({ ok: false, error: "integer" });
    expect(validateAnswer(make("number", { min: 18 }), 17)).toEqual({ ok: false, error: "min" });
  });

  it("requires rankings to order every option once", () => {
    const q = make("ranking");
    const ids = q.config.options.map((o) => o.id);
    expect(validateAnswer(q, [...ids].reverse()).ok).toBe(true);
    expect(validateAnswer(q, ids.slice(0, 2))).toEqual({ ok: false, error: "invalid" });
  });

  it("validates matrix cells and completeness", () => {
    const q = make("matrix");
    const [r1, r2, r3] = q.config.rows.map((r) => r.id);
    const col = q.config.columns[0]!.id;
    expect(validateAnswer(q, { [r1!]: col }, false)).toEqual({ ok: true, value: { [r1!]: col } });
    expect(validateAnswer(q, { [r1!]: col }, true)).toEqual({ ok: false, error: "incomplete" });
    expect(validateAnswer(q, { [r1!]: col, [r2!]: col, [r3!]: col }, true).ok).toBe(true);
    expect(validateAnswer(q, { bogus: col })).toEqual({ ok: false, error: "invalid" });
  });

  it("validates dates", () => {
    expect(validateAnswer(make("date"), "2026-02-30T10:00").ok).toBe(true); // Date.parse rolls over; format is what we check
    expect(validateAnswer(make("date"), "tomorrow")).toEqual({ ok: false, error: "invalid" });
  });

  it("limits files", () => {
    expect(validateAnswer(make("file_upload"), { fileIds: ["a", "b"] })).toEqual({ ok: false, error: "maxSelected" });
  });
});

describe("answer helpers", () => {
  it("detects answered values", () => {
    expect(isAnswered(make("yes_no"), false)).toBe(true);
    expect(isAnswered(make("nps"), 0)).toBe(true);
    expect(isAnswered(make("multiple_choice"), { choices: [] })).toBe(false);
  });

  it("derives numeric and text columns", () => {
    expect(answerColumns(make("yes_no"), true)).toEqual({ numeric: 1, text: null });
    expect(answerColumns(make("nps"), 9)).toEqual({ numeric: 9, text: null });
    expect(answerColumns(make("long_text"), "hello")).toEqual({ numeric: null, text: "hello" });
    expect(answerColumns(make("single_choice"), { choice: OTHER, other: "teal" })).toEqual({ numeric: null, text: "teal" });
  });

  it("renders readable text", () => {
    const q = make("likert");
    expect(answerToText(q, 4)).toBe("Agree");
    const r = make("ranking");
    const ids = r.config.options.map((o) => o.id);
    expect(answerToText(r, ids)).toBe("1. Option 1, 2. Option 2, 3. Option 3");
  });
});
