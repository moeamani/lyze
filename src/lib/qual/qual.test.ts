import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { canMoveUnder, depthOf, flattenTree, nameTaken, subtreeIds } from "./codes";
import { normalizeRange, relocate, sentenceAt, snapToWords, spans, toCodePoints } from "./ranges";
import { hits, likePattern, matches, parseQuery, snippet } from "./search";
import { sentiment, sentimentOverview } from "./sentiment";
import { layoutCloud } from "./cloud";
import { clusterTexts, extractiveSummary, keywords, stem } from "./nlp";
import { draftThemeDescription, suggestCodings } from "./suggest";
import { parseCodebook, writeCodebook, writeProjectQdpx } from "@/lib/exports/refi";

const codes = [
  { id: "a", parentId: null, name: "Routine", position: 1 },
  { id: "b", parentId: "a", name: "Morning", position: 0 },
  { id: "c", parentId: "b", name: "Kettle", position: 0 },
  { id: "d", parentId: null, name: "Cost", position: 0 },
  { id: "e", parentId: "missing", name: "Orphan", position: 2 },
];

describe("code tree", () => {
  it("flattens depth-first by position", () => {
    expect(flattenTree(codes).map((c) => `${"-".repeat(c.depth)}${c.name}`)).toEqual(["Cost", "Routine", "-Morning", "--Kettle", "Orphan"]);
    expect(flattenTree(codes).find((c) => c.id === "c")!.path).toEqual(["Routine", "Morning", "Kettle"]);
  });

  it("prevents cycles and duplicate sibling names", () => {
    expect([...subtreeIds(codes, "a")].sort()).toEqual(["a", "b", "c"]);
    expect(canMoveUnder(codes, "a", "c")).toBe(false);
    expect(canMoveUnder(codes, "c", "d")).toBe(true);
    expect(canMoveUnder(codes, "a", null)).toBe(true);
    expect(depthOf(codes, "c")).toBe(3);
    expect(nameTaken(codes, " morning ", "a")).toBe(true);
    expect(nameTaken(codes, "Morning", null)).toBe(false);
    expect(nameTaken(codes, "Morning", "a", "b")).toBe(false);
  });
});

describe("ranges", () => {
  const text = "I make a pour-over. It takes four minutes!  Then work.";

  it("normalizes and snaps selections", () => {
    expect(normalizeRange(text, 20, 9)).toEqual({ start: 9, end: 19 });
    expect(normalizeRange(text, 42, 44)).toBeNull();
    expect(snapToWords(text, { start: 11, end: 15 })).toEqual({ start: 9, end: 18 });
  });

  it("splits overlapping codings into flat spans", () => {
    const s = spans(10, [
      { id: "1", codeId: "x", start: 0, end: 6 },
      { id: "2", codeId: "y", start: 4, end: 10 },
    ]);
    expect(s.map((x) => [x.start, x.end, x.marks.map((m) => m.id).join("")])).toEqual([
      [0, 4, "1"],
      [4, 6, "12"],
      [6, 10, "2"],
    ]);
  });

  it("relocates quotes after edits", () => {
    expect(relocate("Well, I make a pour-over.", "pour-over", 9)).toEqual({ start: 15, end: 24 });
    expect(relocate("abc abc", "abc", 5)).toEqual({ start: 4, end: 7 });
    expect(relocate("gone", "pour-over", 0)).toBeNull();
  });

  it("finds sentences and code points", () => {
    expect(text.slice(...Object.values(sentenceAt(text, 25)) as [number, number])).toBe("It takes four minutes!");
    expect(toCodePoints("☕️ hi 😀 there", 9)).toBe(8);
  });
});

describe("search", () => {
  it("parses phrases and exclusions", () => {
    const q = parseQuery('coffee "morning routine" -tea Coffee');
    expect(q).toEqual({ terms: ["coffee", "morning routine"], exclude: ["tea"] });
    expect(matches("My Morning Routine with coffee", q)).toBe(true);
    expect(matches("Morning routine coffee and tea", q)).toBe(false);
  });

  it("highlights and windows", () => {
    expect(hits("Coffee, coffee and more COFFEE", ["coffee"])).toHaveLength(3);
    const long = `${"word ".repeat(60)}the kettle sings ${"word ".repeat(60)}`;
    const s = snippet(long, ["kettle"], 30);
    expect(s.text.slice(s.hits[0]!.start, s.hits[0]!.end)).toBe("kettle");
    expect(s.clippedStart && s.clippedEnd).toBe(true);
    expect(likePattern("50%_off\\")).toBe("%50\\%\\_off\\\\%");
  });
});

describe("sentiment", () => {
  it("scores with negation and intensity", () => {
    expect(sentiment("I really love this quiet ritual").label).toBe("positive");
    expect(sentiment("Too much coffee makes me jittery and stressed").label).toBe("negative");
    expect(sentiment("The cup is on the table").label).toBe("neutral");
    expect(sentiment("not good").score).toBeLessThan(0);
    const o = sentimentOverview(["love it", "awful", "ok then", "table"]);
    expect([o.positive, o.negative, o.neutral]).toEqual([2, 1, 1]);
    expect(o.mostNegative[0]!.text).toBe("awful");
  });
});

describe("word cloud", () => {
  it("places words without overlaps inside the box", () => {
    const words = ["coffee", "morning", "quiet", "kitchen", "taste", "ritual", "friends", "energy"].map((w, i) => ({ word: w, count: 20 - i * 2 }));
    const placed = layoutCloud(words, { width: 400, height: 220 });
    expect(placed).toHaveLength(8);
    expect(placed[0]!.size).toBe(44);
    for (const p of placed) {
      expect(p.x - p.width / 2).toBeGreaterThanOrEqual(0);
      expect(p.x + p.width / 2).toBeLessThanOrEqual(400);
    }
    for (let i = 0; i < placed.length; i++)
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i]!;
        const b = placed[j]!;
        const overlapX = Math.abs(a.x - b.x) < (a.width + b.width) / 2;
        const overlapY = Math.abs(a.y - b.y) < (a.height + b.height) / 2;
        expect(overlapX && overlapY).toBe(false);
      }
    expect(layoutCloud(words, { width: 400, height: 220 })).toEqual(placed);
  });
});

describe("nlp", () => {
  it("stems and extracts keywords", () => {
    expect(["habits", "rushing", "stories", "boxes", "brewed"].map(stem)).toEqual(["habit", "rush", "story", "box", "brew"]);
    expect(keywords("The kids and the school run")).toEqual(["kid", "school", "run"]);
  });

  it("clusters short answers by vocabulary", () => {
    const texts = [
      "espresso at the station café",
      "quick espresso before the train at the station",
      "slow pour-over with my partner on sunday",
      "pour-over sunday mornings with partner",
      "cold brew in summer by the river",
      "iced cold brew walking by the river",
      "",
    ];
    const clusters = clusterTexts(texts, 3);
    expect(clusters).toHaveLength(3);
    const groups = clusters.map((c) => [...c.members].sort());
    expect(groups).toContainEqual([0, 1]);
    expect(groups).toContainEqual([2, 3]);
    expect(groups).toContainEqual([4, 5]);
    expect(clusters.flatMap((c) => c.members)).not.toContain(6);
  });

  it("summarizes without near-duplicates", () => {
    const s = extractiveSummary(["Coffee is the excuse for a pause in my busy morning.", "I cut down from five cups to three because of sleep.", "The pause matters more than the caffeine in the morning.", "Ok."], 2);
    expect(s).toHaveLength(2);
    expect(s.every((x) => x.length > 10)).toBe(true);
  });
});

describe("suggestions", () => {
  it("suggests codes for matching sentences", () => {
    const out = suggestCodings(
      [
        { id: "u1", text: "I love it. Café coffee has gotten expensive and the price keeps rising." },
        { id: "u2", text: "Nothing relevant here." },
      ],
      [
        { id: "cost", name: "Cost", definition: "Mentions of price, money or being expensive" },
        { id: "sleep", name: "Sleep", definition: null },
      ],
    );
    expect(out).toEqual([{ unitId: "u1", codeId: "cost", start: 11, end: 71, reason: "expensive, price" }]);
    expect(suggestCodings([{ id: "u1", text: "Price matters." }], [{ id: "cost", name: "Price", definition: null }], new Set(["u1:cost"]))).toEqual([]);
  });

  it("drafts theme descriptions", () => {
    const d = draftThemeDescription("A pause for me", [{ name: "Ritual", definition: "Coffee as a repeated, meaningful act.", count: 5 }, { name: "Quiet", definition: null, count: 2 }], ["The only four minutes in the day that are mine."]);
    expect(d).toContain("ritual and quiet (7 coded passages)");
    expect(d).toContain("four minutes");
  });
});

describe("REFI-QDA exchange", () => {
  const book = [
    { id: "a", parentId: null, name: "Routine & ritual", color: "#2a78d6", definition: "Repeated <acts>" },
    { id: "b", parentId: "a", name: "Morning", color: "#eb6834", definition: null },
    { id: "c", parentId: null, name: "Cost", color: "#1baf7a", definition: null },
  ];

  it("round-trips a codebook", () => {
    let n = 0;
    const xml = writeCodebook(book, { uuid: () => `g${++n}` });
    expect(xml).toContain('xmlns="urn:QDA-XML:codebook:1.0"');
    const parsed = parseCodebook(xml);
    expect(parsed.map((c) => [c.name, c.parentKey, c.color, c.description])).toEqual([
      ["Routine & ritual", null, "#2a78d6", "Repeated <acts>"],
      ["Morning", "g1", "#eb6834", null],
      ["Cost", null, "#1baf7a", null],
    ]);
  });

  it("reads codebooks from other tools", () => {
    const nvivo = `<?xml version="1.0"?><qda:CodeBook xmlns:qda="urn:QDA-XML:codebook:1.0"><qda:Codes><qda:Code guid="x1" name="Barriers" isCodable="true"><qda:Description>Things in the way</qda:Description><qda:Code guid="x2" name="Time" isCodable="true"/></qda:Code></qda:Codes></qda:CodeBook>`;
    expect(parseCodebook(nvivo)).toEqual([
      { key: "x1", parentKey: null, name: "Barriers", color: null, description: "Things in the way" },
      { key: "x2", parentKey: "x1", name: "Time", color: null, description: null },
    ]);
  });

  it("exports a project with coded sources at code-point offsets", () => {
    const text = "Interviewer: Hi ☕️\n\nP01: Coffee is a pause.";
    const start = text.indexOf("Coffee");
    const zip = writeProjectQdpx({
      projectName: "Demo",
      userName: "Ana",
      codes: book,
      cases: [{ id: "p1", name: "P01", attributes: { "Age group": "25–34" } }],
      sources: [{ id: "s1", name: "Interview · P01", text, created: new Date("2026-01-01T00:00:00Z"), caseId: "p1", selections: [{ codeId: "a", start, end: start + 6 }] }],
      notes: [{ name: "Memo", text: "Pause = control.", created: new Date("2026-01-02T00:00:00Z") }],
      now: new Date("2026-01-03T00:00:00Z"),
    });
    const files = unzipSync(zip);
    const qde = strFromU8(files["project.qde"]!);
    const sel = qde.match(/startPosition="(\d+)" endPosition="(\d+)"/)!;
    const source = Object.keys(files).find((f) => f.startsWith("sources/"))!;
    const body = Array.from(strFromU8(files[source]!).replace(/^﻿/, ""));
    expect(body.slice(Number(sel[1]), Number(sel[2])).join("")).toBe("Coffee");
    expect(qde).toContain("<SourceRef");
    expect(qde).toContain("<TextValue>25–34</TextValue>");
    expect(qde).toContain("<PlainTextContent>Pause = control.</PlainTextContent>");
  });
});
