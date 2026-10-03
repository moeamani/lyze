import { describe, expect, it } from "vitest";
import { docxBlocks, docxText } from "@/lib/docx";
import { parseTranscript } from "@/lib/interviews/transcript";
import { editDistance, suggestRoles, suggestSpeakerNames } from "@/lib/interviews/speaker-names";
import { codeRowsToCsv, parseCodebookDocx } from "@/lib/create/codebook-docx";
import { parseCodebookCsv } from "@/lib/create/misc";
import { buildDocx } from "../helpers/docx";

/** Made-up text in the shape of a hand-typed focus group transcript (numbered turns, sloppy times). */
export const FOCUS_GROUP = buildDocx([
  "Session 3 - clean transcription",
  "",
  "1 (00:45:35) - Nadia: Welcome, everyone. Let's start with what brought you to this workshop.",
  "Take a minute to think about it first.",
  "",
  "2 (00:46:39) - Omar: I started teaching French last year with almost no training.",
  "So I wanted ideas I could use on Monday.",
  "",
  "3 (00:47:02) - Lena: For me it's engagement. Grade sevens switch off fast.",
  "",
  "4 (00:48:58) - Multiple people: xxx",
  "",
  "5(00:49:00) Leena:Same here, honestly.",
  "",
  "6 (02:11:040) - Omar: Group two, are you ready?",
  "",
  "(Break)",
  "",
  "7 (02:31:50) - Multiple people are talking simultaneously.",
  "",
  "8 (02:34:39 ) - one of the teachers: Can we keep the slides?",
  "",
  "9 (02:35:01) - One of the teachers: Yes please.",
  "",
  "10 (02:36:10) - Nadia: Thank you all. This was useful.",
  "We'll pick up next week.",
]);

describe("reading .docx", () => {
  it("keeps paragraphs, list levels, headings, bold lines and tables", () => {
    const doc = buildDocx([{ text: "Codebook", style: "Title" }, { text: "Motivation", style: "Heading1" }, { text: "Engagement", list: 0 }, { text: "Bold one", bold: true }, { table: [["Code", "Definition"], ["A", "Def A"]] }]);
    const blocks = docxBlocks(doc);
    expect(blocks).toEqual([
      { type: "p", text: "Codebook", style: "Title", heading: 0, listLevel: null, bold: false },
      { type: "p", text: "Motivation", style: "Heading1", heading: 1, listLevel: null, bold: false },
      { type: "p", text: "Engagement", style: null, heading: null, listLevel: 0, bold: false },
      { type: "p", text: "Bold one", style: null, heading: null, listLevel: null, bold: true },
      { type: "table", rows: [["Code", "Definition"], ["A", "Def A"]] },
    ]);
    expect(docxText(doc)).toContain("Motivation\nEngagement");
  });
});

describe("hand-typed transcripts", () => {
  it("reads numbered, timed turns with their follow-on paragraphs, notes and sloppy formatting", () => {
    const r = parseTranscript(docxText(FOCUS_GROUP));
    expect(r.title).toBe("Session 3 - clean transcription");
    const view = r.segments.map((s) => [s.speaker, s.startMs, s.text]);
    expect(view).toEqual([
      ["Nadia", 2735000, "Welcome, everyone. Let's start with what brought you to this workshop. Take a minute to think about it first."],
      ["Omar", 2799000, "I started teaching French last year with almost no training. So I wanted ideas I could use on Monday."],
      ["Lena", 2822000, "For me it's engagement. Grade sevens switch off fast."],
      ["Multiple people", 2938000, "xxx"],
      ["Leena", 2940000, "Same here, honestly."],
      ["Omar", 7900000, "Group two, are you ready?"],
      [null, null, "(Break)"],
      [null, 9110000, "Multiple people are talking simultaneously."],
      ["one of the teachers", 9279000, "Can we keep the slides?"],
      ["One of the teachers", 9301000, "Yes please."],
      ["Nadia", 9370000, "Thank you all. This was useful. We'll pick up next week."],
    ]);
  });

  it("splits very long turns instead of cutting them off", () => {
    const long = `1 (00:00:01) - Ana: ${"This is a sentence that goes on. ".repeat(300)}`;
    const r = parseTranscript(long);
    expect(r.segments.length).toBeGreaterThan(2);
    expect(r.segments.every((s) => s.speaker === "Ana" && s.text.length <= 4000)).toBe(true);
    expect(r.segments.map((s) => s.text).join(" ").length).toBeGreaterThan(9000);
  });

  it("suggests merging spelling variants and guesses roles", () => {
    expect(editDistance("melissa", "mellisa")).toBe(2);
    expect(suggestSpeakerNames({ Sophia: 4, Sofia: 5, Danielle: 38, Daniell: 2, Olena: 13, Oleana: 1, "One of the teachers": 3, "one of the teachers": 2, Amy: 40, Ami: 1, Jesús: 12, Jesus: 1 })).toEqual({
      Sofia: "Sofia",
      Sophia: "Sofia",
      Danielle: "Danielle",
      Daniell: "Danielle",
      Olena: "Olena",
      Oleana: "Olena",
      "One of the teachers": "One of the teachers",
      "one of the teachers": "One of the teachers",
      Amy: "Amy",
      Ami: "Ami",
      Jesús: "Jesús",
      Jesus: "Jesús",
    });
    expect(suggestRoles(["Nadia", "Omar", "Multiple people", "All the teachers", "One of the teachers"])).toEqual({
      Nadia: "interviewer",
      Omar: "participant",
      "Multiple people": "other",
      "All the teachers": "other",
      "One of the teachers": "other",
    });
  });
});

describe("codebooks in Word", () => {
  const csvRows = (rows: ReturnType<typeof parseCodebookDocx>["rows"]) => parseCodebookCsv(codeRowsToCsv(rows)).rows;

  it("reads a table with a header, categories and examples", () => {
    const doc = buildDocx([
      { text: "Codebook", style: "Title" },
      {
        table: [
          ["Category", "Code", "Definition", "Example"],
          ["Motivation", "Engagement", "Students take part willingly", "\"They didn't want to stop\""],
          ["", "Relevance", "Tasks feel real", ""],
          ["Barriers", "Time, planning", "Not enough prep time", ""],
        ],
      },
    ]);
    const { rows } = parseCodebookDocx(docxBlocks(doc));
    expect(rows).toEqual([
      { name: "Motivation", parent: null, definition: null, color: null },
      { name: "Engagement", parent: "Motivation", definition: 'Students take part willingly Example: "They didn\'t want to stop"', color: null },
      { name: "Relevance", parent: "Motivation", definition: "Tasks feel real", color: null },
      { name: "Barriers", parent: null, definition: null, color: null },
      { name: "Time, planning", parent: "Barriers", definition: "Not enough prep time", color: null },
    ]);
    // Survives the trip through the CSV import (commas and quotes included).
    expect(csvRows(rows).map((r) => r.name)).toEqual(["Motivation", "Engagement", "Relevance", "Barriers", "Time, planning"]);
  });

  it("reads a two-column table without a header, with category rows", () => {
    const { rows } = parseCodebookDocx(docxBlocks(buildDocx([{ table: [["Motivation", ""], ["Engagement", "Students take part"], ["Relevance", "Feels real"]] }])));
    expect(rows.map((r) => [r.name, r.parent, r.definition])).toEqual([
      ["Motivation", null, null],
      ["Engagement", "Motivation", "Students take part"],
      ["Relevance", "Motivation", "Feels real"],
    ]);
  });

  it("reads an outline: headings for parents, bullets with definitions and detail lines", () => {
    const doc = buildDocx([
      { text: "Coding scheme", style: "Heading1" },
      { text: "Motivation", style: "Heading2" },
      { text: "Engagement: students take part willingly", list: 0 },
      { text: "Example: they didn't want to stop", list: 1 },
      { text: "Self-efficacy – feeling able to teach in the target language", list: 0 },
      { text: "Barriers", style: "Heading2" },
      { text: "Time", list: 0 },
      "Definition: not enough planning time.",
      "Exclude: school timetabling.",
    ]);
    const { rows } = parseCodebookDocx(docxBlocks(doc));
    expect(rows.map((r) => [r.name, r.parent, r.definition])).toEqual([
      ["Motivation", null, null],
      ["Engagement", "Motivation", "students take part willingly Example: they didn't want to stop"],
      ["Self-efficacy", "Motivation", "feeling able to teach in the target language"],
      ["Barriers", null, null],
      ["Time", "Barriers", "not enough planning time. Exclude: school timetabling."],
    ]);
  });

  it("reads bold code names with the definition in the paragraph below", () => {
    const { rows } = parseCodebookDocx(docxBlocks(buildDocx([{ text: "Engagement", bold: true }, "Students take part willingly.", { text: "Relevance", bold: true }, "Tasks feel real."])));
    expect(rows.map((r) => [r.name, r.parent, r.definition])).toEqual([
      ["Engagement", null, "Students take part willingly."],
      ["Relevance", null, "Tasks feel real."],
    ]);
  });

  it("reports when there's nothing to import", () => {
    expect(parseCodebookDocx(docxBlocks(buildDocx([]))).errors).toEqual([{ line: 1, message: "noCodes" }]);
  });
});
