import { describe, expect, it } from "vitest";
import { OTHER, type Answers } from "./answers";
import { computeState, evaluateCondition, firstPage, nextStep, pruneHidden, validatePage, validateSubmission } from "./logic";
import { pipe } from "./piping";
import { matchingQuotas } from "./quotas";
import { seededShuffle } from "./random";
import { createQuestion, emptyForm, publishIssues } from "./questions";
import { formDocSchema, type FormDoc, type Question } from "./schema";
import { TEMPLATES, TEMPLATE_KEYS } from "./templates";
import { localize } from "./i18n";

function build(...pages: Question[][]): FormDoc {
  const doc = emptyForm("Test");
  doc.pages = pages.map((questions, i) => ({ id: `p${i}`, shuffleQuestions: false, questions }));
  return doc;
}

function choice(id: string, labels: string[], type: "single_choice" | "multiple_choice" = "single_choice") {
  const q = createQuestion(type) as Extract<Question, { type: "single_choice" | "multiple_choice" }>;
  q.id = id;
  q.title = id;
  q.config.options = labels.map((l) => ({ id: l, label: l.toUpperCase() }));
  return q;
}

function num(id: string, type: "number" | "nps" | "rating" = "number") {
  const q = createQuestion(type);
  q.id = id;
  q.title = id;
  return q;
}

describe("evaluateCondition", () => {
  const color = choice("color", ["red", "blue"]);
  const tags = choice("tags", ["a", "b", "c"], "multiple_choice");
  const age = num("age");
  const text = createQuestion("short_text");
  text.id = "name";
  const yes = createQuestion("yes_no");
  yes.id = "ok";
  const answers: Answers = {
    color: { choice: "red" },
    tags: { choices: ["a", "c"] },
    age: 30,
    name: "Ada Lovelace",
    ok: false,
  };

  it("handles choice equality", () => {
    expect(evaluateCondition({ questionId: "color", operator: "equals", value: "red" }, color, answers)).toBe(true);
    expect(evaluateCondition({ questionId: "color", operator: "not_equals", value: "red" }, color, answers)).toBe(false);
  });

  it("handles multi-select contains", () => {
    expect(evaluateCondition({ questionId: "tags", operator: "contains", value: "c" }, tags, answers)).toBe(true);
    expect(evaluateCondition({ questionId: "tags", operator: "not_contains", value: "b" }, tags, answers)).toBe(true);
  });

  it("compares numbers", () => {
    expect(evaluateCondition({ questionId: "age", operator: "gte", value: 30 }, age, answers)).toBe(true);
    expect(evaluateCondition({ questionId: "age", operator: "lt", value: "18" }, age, answers)).toBe(false);
    expect(evaluateCondition({ questionId: "age", operator: "equals", value: 30 }, age, answers)).toBe(true);
  });

  it("compares text case-insensitively", () => {
    expect(evaluateCondition({ questionId: "name", operator: "contains", value: "love" }, text, answers)).toBe(true);
    expect(evaluateCondition({ questionId: "name", operator: "equals", value: "ada lovelace" }, text, answers)).toBe(true);
  });

  it("handles booleans given as booleans or strings", () => {
    expect(evaluateCondition({ questionId: "ok", operator: "equals", value: false }, yes, answers)).toBe(true);
    expect(evaluateCondition({ questionId: "ok", operator: "equals", value: "true" }, yes, answers)).toBe(false);
  });

  it("treats unanswered questions as matching only negative operators", () => {
    expect(evaluateCondition({ questionId: "age", operator: "gt", value: 1 }, age, {})).toBe(false);
    expect(evaluateCondition({ questionId: "age", operator: "not_equals", value: 1 }, age, {})).toBe(true);
    expect(evaluateCondition({ questionId: "age", operator: "not_answered" }, age, {})).toBe(true);
    expect(evaluateCondition({ questionId: "age", operator: "answered" }, age, {})).toBe(false);
  });

  it("is false for missing questions", () => {
    expect(evaluateCondition({ questionId: "nope", operator: "answered" }, undefined, answers)).toBe(false);
  });
});

describe("visibility", () => {
  const a = choice("a", ["yes", "no"]);
  const b = num("b");
  const c = num("c");
  const doc = build([a, b, c]);
  doc.logic = [
    { id: "r1", when: { match: "all", conditions: [{ questionId: "a", operator: "equals", value: "yes" }] }, action: "show_question", target: "b" },
    { id: "r2", when: { match: "all", conditions: [{ questionId: "b", operator: "gt", value: 5 }] }, action: "show_question", target: "c" },
  ];

  it("hides show-targets until their rule matches", () => {
    expect([...computeState(doc, {}).visible]).toEqual(["a"]);
    expect([...computeState(doc, { a: { choice: "yes" } }).visible]).toEqual(["a", "b"]);
  });

  it("cascades: hiding a question also ignores its answer", () => {
    expect(computeState(doc, { a: { choice: "yes" }, b: 10 }).visible.has("c")).toBe(true);
    // Switching `a` hides `b`, so `b`'s stale answer no longer reveals `c`.
    expect(computeState(doc, { a: { choice: "no" }, b: 10 }).visible.has("c")).toBe(false);
  });

  it("prunes hidden answers", () => {
    const answers = { a: { choice: "no" }, b: 10, c: 1 };
    expect(pruneHidden(answers, computeState(doc, answers))).toEqual({ a: { choice: "no" } });
  });

  it("lets hide rules win over show rules", () => {
    const d = structuredClone(doc);
    d.logic.push({ id: "r3", when: { match: "all", conditions: [{ questionId: "a", operator: "answered" }] }, action: "hide_question", target: "b" });
    expect(computeState(d, { a: { choice: "yes" } }).visible.has("b")).toBe(false);
  });

  it("makes questions required dynamically", () => {
    const d = structuredClone(doc);
    d.logic = [{ id: "r", when: { match: "any", conditions: [{ questionId: "a", operator: "equals", value: "no" }] }, action: "require_question", target: "c" }];
    const state = computeState(d, { a: { choice: "no" } });
    expect(state.required.has("c")).toBe(true);
    expect(validatePage(d.pages[0]!, { a: { choice: "no" } }, state)).toEqual({ c: "required" });
  });
});

describe("navigation", () => {
  const screen = choice("screen", ["in", "out"]);
  const p1 = num("p1");
  const p2 = num("p2");
  const doc = build([screen], [p1], [p2]);

  it("walks pages in order by default", () => {
    expect(nextStep(doc, 0, {})).toEqual({ type: "page", index: 1 });
    expect(nextStep(doc, 2, {})).toEqual({ type: "end", screenOut: false });
  });

  it("skips to a later page", () => {
    const d = structuredClone(doc);
    d.logic = [{ id: "s", when: { match: "all", conditions: [{ questionId: "screen", operator: "equals", value: "in" }] }, action: "skip_to_page", target: "p2" }];
    expect(nextStep(d, 0, { screen: { choice: "in" } })).toEqual({ type: "page", index: 2 });
    expect(nextStep(d, 0, { screen: { choice: "out" } })).toEqual({ type: "page", index: 1 });
  });

  it("never skips backwards", () => {
    const d = structuredClone(doc);
    d.logic = [{ id: "s", when: { match: "all", conditions: [{ questionId: "p1", operator: "answered" }] }, action: "skip_to_page", target: "p0" }];
    expect(nextStep(d, 1, { p1: 3 })).toEqual({ type: "page", index: 2 });
  });

  it("ends the form, optionally screening out", () => {
    const d = structuredClone(doc);
    d.logic = [
      { id: "e", when: { match: "all", conditions: [{ questionId: "screen", operator: "equals", value: "out" }] }, action: "end_form", screenOut: true, message: "Bye" },
    ];
    expect(nextStep(d, 0, { screen: { choice: "out" } })).toEqual({ type: "end", screenOut: true, message: "Bye" });
  });

  it("skips pages whose questions are all hidden", () => {
    const d = structuredClone(doc);
    d.logic = [{ id: "h", when: { match: "all", conditions: [{ questionId: "screen", operator: "answered" }] }, action: "hide_question", target: "p1" }];
    expect(nextStep(d, 0, { screen: { choice: "in" } })).toEqual({ type: "page", index: 2 });
  });

  it("starts on the first page with something to show", () => {
    expect(firstPage(doc)).toBe(0);
  });
});

describe("validateSubmission", () => {
  const a = choice("a", ["yes", "no"]);
  a.required = true;
  const b = num("b");
  b.required = true;
  const doc = build([a], [b]);
  doc.logic = [{ id: "e", when: { match: "all", conditions: [{ questionId: "a", operator: "equals", value: "no" }] }, action: "end_form", screenOut: true }];

  it("accepts a complete path and drops answers off the path", () => {
    expect(validateSubmission(doc, { a: { choice: "no" }, b: 4 })).toEqual({ ok: true, answers: { a: { choice: "no" } }, screenOut: true });
  });

  it("requires questions on the path", () => {
    expect(validateSubmission(doc, { a: { choice: "yes" } })).toEqual({ ok: false, errors: { b: "required" } });
  });

  it("rejects tampered values", () => {
    expect(validateSubmission(doc, { a: { choice: "maybe" } })).toMatchObject({ ok: false, errors: { a: "invalid" } });
  });
});

describe("piping", () => {
  it("inserts earlier answers", () => {
    const color = choice("color", ["red"]);
    const doc = build([color]);
    expect(pipe("You picked {{color}}!", doc, { color: { choice: "red" } })).toBe("You picked RED!");
    expect(pipe("You picked {{ color }}!", doc, {})).toBe("You picked …!");
    expect(pipe("Other: {{color}}", doc, { color: { choice: OTHER, other: "teal" } })).toBe("Other: teal");
  });
});

describe("quotas", () => {
  it("matches quota conditions", () => {
    const color = choice("color", ["red", "blue"]);
    const doc = build([color]);
    doc.settings.quotas = [{ id: "qa", name: "Reds", limit: 1, when: { match: "all", conditions: [{ questionId: "color", operator: "equals", value: "red" }] } }];
    expect(matchingQuotas(doc, { color: { choice: "red" } })).toEqual(["qa"]);
    expect(matchingQuotas(doc, { color: { choice: "blue" } })).toEqual([]);
  });
});

describe("seededShuffle", () => {
  it("is stable for a seed and keeps every item", () => {
    const items = ["a", "b", "c", "d", "e", "f"];
    const one = seededShuffle(items, "resp-1:q");
    expect(seededShuffle(items, "resp-1:q")).toEqual(one);
    expect([...one].sort()).toEqual(items);
    expect(items.some((_, i) => seededShuffle(items, `seed-${i}`).join() !== items.join())).toBe(true);
  });
});

describe("templates", () => {
  it.each(TEMPLATE_KEYS)("%s is a valid, publishable form", (key) => {
    const doc = TEMPLATES[key]();
    expect(formDocSchema.safeParse(doc).success).toBe(true);
    expect(publishIssues(doc)).toEqual([]);
  });
});

describe("localize", () => {
  it("swaps in translations and falls back per string", () => {
    const color = choice("color", ["red", "blue"]);
    const doc = build([color]);
    doc.settings.languages = ["fr"];
    doc.translations.fr = { title: "Essai", pages: {}, questions: { color: { title: "Couleur", options: { red: "Rouge" } } }, ui: {} };
    const fr = localize(doc, "fr");
    expect(fr.title).toBe("Essai");
    const q = fr.pages[0]!.questions[0]! as typeof color;
    expect(q.title).toBe("Couleur");
    expect(q.config.options.map((o) => o.label)).toEqual(["Rouge", "BLUE"]);
    expect(localize(doc, "en")).toBe(doc);
  });
});

describe("publishIssues", () => {
  it("flags empty forms, untitled questions and broken logic", () => {
    expect(publishIssues(emptyForm("x")).map((i) => i.code)).toEqual(["noQuestions"]);
    const q = createQuestion("short_text");
    const doc = build([q]);
    doc.logic = [{ id: "r", when: { match: "all", conditions: [{ questionId: "gone", operator: "answered" }] }, action: "show_question", target: q.id }];
    expect(publishIssues(doc).map((i) => i.code)).toEqual(["untitled", "badLogic"]);
  });
});
