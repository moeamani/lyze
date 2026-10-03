import type { Answers } from "@/lib/forms/answers";
import { emptyForm } from "@/lib/forms/questions";
import type { FormDoc, Question } from "@/lib/forms/schema";
import type { SourceResponse } from "@/lib/analysis/dataset";

/** A form covering every question type, with fixed ids, for analysis and export tests. */
export function fixtureDoc(): FormDoc {
  const doc = emptyForm("Commute & wellbeing");
  const opts = (...labels: string[]) => labels.map((label, i) => ({ id: `o${i + 1}`, label }));
  const q = (x: Omit<Question, "required" | "description"> & { required?: boolean }) => ({ required: false, ...x }) as Question;
  doc.pages = [
    {
      id: "p1",
      shuffleQuestions: false,
      questions: [
        q({ id: "mode", type: "single_choice", title: "How do you commute?", dataKind: "quant", config: { options: opts("Bike", "Bus", "Car"), allowOther: true, shuffle: false } }),
        q({ id: "why", type: "multiple_choice", title: "Why?", dataKind: "quant", config: { options: opts("Cost", "Speed", "Health"), allowOther: false, shuffle: false } }),
        q({ id: "l1", type: "likert", title: "My commute is relaxing", dataKind: "quant", config: { labels: ["SD", "D", "N", "A", "SA"] } }),
        q({ id: "l2", type: "likert", title: "My commute is stressful", dataKind: "quant", config: { labels: ["SD", "D", "N", "A", "SA"] } }),
        q({ id: "nps", type: "nps", title: "Recommend?", dataKind: "quant", config: {} }),
        q({ id: "mins", type: "number", title: "Minutes per trip", dataKind: "quant", config: { integer: true } }),
      ],
    },
    {
      id: "p2",
      shuffleQuestions: false,
      questions: [
        q({ id: "story", type: "long_text", title: "Tell us about your commute", dataKind: "qual", config: {} }),
        q({ id: "grid", type: "matrix", title: "Rate parts", dataKind: "quant", config: { rows: opts("Seats", "Noise"), columns: opts("Bad", "OK", "Good"), multiple: false } }),
        q({ id: "rank", type: "ranking", title: "Rank", dataKind: "quant", config: { options: opts("Price", "Time"), shuffle: false } }),
        q({ id: "when", type: "date", title: "Last trip", dataKind: "quant", config: { includeTime: false } }),
        q({ id: "ok", type: "yes_no", title: "Happy?", dataKind: "quant", config: {} }),
      ],
    },
  ];
  return doc;
}

let seq = 0;
export function response(answers: Answers, patch: Partial<SourceResponse> = {}): SourceResponse {
  seq++;
  return {
    id: `rsp_${String(seq).padStart(3, "0")}`,
    status: "complete",
    startedAt: new Date(Date.UTC(2026, 8, 1, 9, 0, seq)),
    submittedAt: new Date(Date.UTC(2026, 8, 1, 9, 5, seq)),
    durationMs: 300_000,
    locale: "en",
    answers,
    ...patch,
  };
}

export function fixtureResponses(): SourceResponse[] {
  seq = 0;
  return [
    response({ mode: { choice: "o1" }, why: { choices: ["o2", "o3"] }, l1: 5, l2: 1, nps: 10, mins: 15, story: "I love cycling along the river. Café stop — ☕ every morning!\nSecond line.", grid: { o1: "o3", o2: "o2" }, rank: ["o2", "o1"], when: "2026-08-30", ok: true }),
    response({ mode: { choice: "o2" }, why: { choices: ["o1"] }, l1: 2, l2: 4, nps: 6, mins: 40, story: "The bus is often late and crowded.", grid: { o1: "o1" }, rank: ["o1", "o2"], when: "2026-08-29", ok: false }),
    response({ mode: { choice: "__other__", other: "Scooter" }, l1: 4, l2: 2, nps: 9, mins: 20, ok: true }),
    response({ mode: { choice: "o3" }, why: { choices: ["o2"] }, l1: 3, l2: 3, nps: 7, mins: 35 }),
    response({ mode: { choice: "o2" }, l1: 1 }, { status: "partial", submittedAt: null, durationMs: null }),
    response({ mode: { choice: "o3" }, l1: 4, l2: 2, nps: 8, mins: 5 }, { durationMs: 4000 }),
  ];
}
