import { describe, expect, it } from "vitest";
import { formatCueTime, formatTimestamp, parseTimestamp } from "./time";
import { emptyGuide, flatQuestions, guideDocSchema, guideTemplate, GUIDE_TEMPLATE_KEYS, questionCount, sectionSchedule, totalMinutes } from "./guide";
import { advanceStatus, nextParticipantCode, parseDelimited, parseParticipantCsv } from "./participants";
import { defaultKind, kindsFor, parseNote } from "./sessions";
import { activeSegmentIndex, fillEndTimes, mergeCues, parseTranscript, transcriptToSrt, transcriptToText, transcriptToVtt } from "./transcript";
import { mockTranscript } from "./mock-transcript";

describe("time", () => {
  it("formats and parses timestamps", () => {
    expect(formatTimestamp(0)).toBe("00:00");
    expect(formatTimestamp(65_400)).toBe("01:05");
    expect(formatTimestamp(3_725_000)).toBe("1:02:05");
    expect(formatTimestamp(5_000, { hours: true })).toBe("0:00:05");
    expect(formatCueTime(3_725_042, ".")).toBe("01:02:05.042");
    expect(formatCueTime(1_500, ",")).toBe("00:00:01,500");
    expect(parseTimestamp("1:02")).toBe(62_000);
    expect(parseTimestamp("01:02:03")).toBe(3_723_000);
    expect(parseTimestamp("00:00:01.5")).toBe(1_500);
    expect(parseTimestamp("00:00:01,250")).toBe(1_250);
    expect(parseTimestamp("1:75")).toBeNull();
    expect(parseTimestamp("hello")).toBeNull();
  });
});

describe("guide", () => {
  it("templates are valid documents with timing", () => {
    for (const key of GUIDE_TEMPLATE_KEYS) {
      const g = guideTemplate(key);
      expect(guideDocSchema.safeParse(g).success).toBe(true);
      expect(questionCount(g)).toBeGreaterThan(0);
    }
    const g = guideTemplate("discovery");
    expect(totalMinutes(g)).toBe(45);
    expect(sectionSchedule(g).map((s) => [s.startMin, s.endMin])).toEqual([
      [0, 5],
      [5, 25],
      [25, 40],
      [40, 45],
    ]);
    expect(flatQuestions(g)[1]).toMatchObject({ sectionTitle: "Current experience", text: "Walk me through the last time you did this." });
    expect(totalMinutes(emptyGuide())).toBe(0);
  });

  it("rejects malformed guides", () => {
    expect(guideDocSchema.safeParse({ intro: "", outro: "", sections: [{ id: "a", title: "x", minutes: -1, questions: [] }] }).success).toBe(false);
  });
});

describe("participants", () => {
  it("numbers participants", () => {
    expect(nextParticipantCode([])).toBe("P01");
    expect(nextParticipantCode(["P01", "P07", "X3"])).toBe("P08");
    expect(nextParticipantCode(["P99"])).toBe("P100");
  });

  it("only advances along the pipeline", () => {
    expect(advanceStatus("recruited", "scheduled")).toBe("scheduled");
    expect(advanceStatus("completed", "scheduled")).toBe("completed");
    expect(advanceStatus("scheduled", "completed")).toBe("completed");
    expect(advanceStatus("withdrawn", "completed")).toBe("withdrawn");
    expect(advanceStatus("ineligible", "scheduled")).toBe("ineligible");
  });

  it("parses CSV with quotes, other delimiters and a BOM", () => {
    expect(parseDelimited('a,b\n"x, y","he said ""hi"""\r\n')).toEqual([
      ["a", "b"],
      ["x, y", 'he said "hi"'],
    ]);
    expect(parseDelimited("﻿a;b\n1;2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
    expect(parseDelimited("a\tb\n1\t2\n\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("maps participant columns and keeps the rest as attributes", () => {
    const { rows, skipped } = parseParticipantCsv(
      "First name,Last name,E-mail,Phone,Panel ID,Age group,Segment\nAda,Lovelace,ADA@example.com,+44 1,77,35-44,Heavy\n,,,,,25-34,Light\nBob,,not-an-email,,,18-24,\n",
    );
    expect(skipped).toBe(1);
    expect(rows).toEqual([
      { name: "Ada Lovelace", email: "ada@example.com", phone: "+44 1", externalId: "77", attributes: { "Age group": "35-44", Segment: "Heavy" } },
      { name: "Bob", email: null, phone: null, externalId: null, attributes: { "Age group": "18-24" } },
    ]);
  });
});

describe("sessions", () => {
  it("picks kinds by study type", () => {
    expect(defaultKind("interview")).toBe("interview");
    expect(defaultKind("observation")).toBe("field_notes");
    expect(kindsFor("diary")[0]).toBe("diary");
    expect(kindsFor("diary")).toHaveLength(4);
  });

  it("reads #tags from notes", () => {
    expect(parseNote("#Pricing too expensive")).toEqual({ tag: "pricing", text: "too expensive" });
    expect(parseNote("#quote")).toEqual({ tag: "quote", text: "" });
    expect(parseNote("no tag # here")).toEqual({ tag: null, text: "no tag # here" });
    expect(parseNote("#café great")).toEqual({ tag: "café", text: "great" });
  });
});

describe("transcript import", () => {
  it("parses Zoom-style WebVTT and merges short cues", () => {
    const vtt = `WEBVTT

1
00:00:01.000 --> 00:00:03.500
Jane Doe: Hi, thanks for joining.

2
00:00:03.600 --> 00:00:05.000
Jane Doe: Shall we start?

3
00:00:05.200 --> 00:00:09.000
Sam: Sure, happy to.
`;
    const r = parseTranscript(vtt);
    expect(r.format).toBe("vtt");
    expect(r.speakers).toEqual(["Jane Doe", "Sam"]);
    expect(r.segments).toEqual([
      { speaker: "Jane Doe", startMs: 1000, endMs: 5000, text: "Hi, thanks for joining. Shall we start?" },
      { speaker: "Sam", startMs: 5200, endMs: 9000, text: "Sure, happy to." },
    ]);
  });

  it("parses Teams voice spans and entities", () => {
    const vtt = "WEBVTT\n\nNOTE generated\n\nabc-1\n00:01:00.000 --> 00:01:02.000\n<v Ana Lima>Cats &amp; dogs</v>\n";
    expect(parseTranscript(vtt).segments).toEqual([{ speaker: "Ana Lima", startMs: 60_000, endMs: 62_000, text: "Cats & dogs" }]);
  });

  it("parses SRT", () => {
    const srt = "1\n00:00:00,000 --> 00:00:02,000\nInterviewer: Hello\n\n2\n00:00:10,000 --> 00:00:12,000\nInterviewer: Still there?\n";
    const r = parseTranscript(srt);
    expect(r.format).toBe("srt");
    // 8 s apart: not merged.
    expect(r.segments).toHaveLength(2);
  });

  it("parses plain text in common shapes", () => {
    const txt = "[00:00:05] Jane: Welcome!\n00:00:09 Sam: Thanks.\nJane: How are you?\n";
    expect(parseTranscript(txt).segments).toEqual([
      { speaker: "Jane", startMs: 5000, endMs: 9000, text: "Welcome!" },
      { speaker: "Sam", startMs: 9000, endMs: null, text: "Thanks." },
      { speaker: "Jane", startMs: null, endMs: null, text: "How are you?" },
    ]);
  });

  it("parses Otter-style header lines", () => {
    const otter = "Speaker 1  0:03\nSo tell me about mornings.\n\nSpeaker 2  0:09\nWell, it starts with coffee.\nUsually two cups.\n";
    expect(parseTranscript(otter).segments).toEqual([
      { speaker: "Speaker 1", startMs: 3000, endMs: 9000, text: "So tell me about mornings." },
      { speaker: "Speaker 2", startMs: 9000, endMs: null, text: "Well, it starts with coffee. Usually two cups." },
    ]);
  });

  it("does not mistake sentences with colons for speakers", () => {
    const r = parseTranscript("Note: this is fine.\nThe plan was simple, really: wake up early.");
    expect(r.segments[0]!.speaker).toBe("Note");
    expect(r.segments[1]).toMatchObject({ speaker: null, text: "The plan was simple, really: wake up early." });
  });

  it("fills end times and merges only same-speaker neighbours", () => {
    expect(fillEndTimes([{ speaker: null, startMs: 0, endMs: null, text: "a" }, { speaker: null, startMs: null, endMs: null, text: "b" }, { speaker: null, startMs: 7, endMs: null, text: "c" }])[0]!.endMs).toBe(7);
    expect(mergeCues([{ speaker: "A", startMs: 0, endMs: 1, text: "x" }, { speaker: "B", startMs: 1, endMs: 2, text: "y" }])).toHaveLength(2);
  });
});

describe("transcript export", () => {
  const speakers = { S1: { name: "Jane", role: "interviewer" as const }, S2: { name: "P01", role: "participant" as const } };
  const segments = [
    { speaker: "S1", startMs: 1000, endMs: 4000, text: "Hello <there> & welcome" },
    { speaker: "S2", startMs: 4500, endMs: null, text: "Hi!" },
    { speaker: null, startMs: null, endMs: null, text: "[laughter]" },
  ];

  it("round-trips through WebVTT", () => {
    const vtt = transcriptToVtt(segments, speakers);
    expect(vtt).toContain("00:00:01.000 --> 00:00:04.000\n<v Jane>Hello &lt;there&gt; &amp; welcome");
    const back = parseTranscript(vtt).segments;
    expect(back.map((s) => [s.speaker, s.text])).toEqual([
      ["Jane", "Hello <there> & welcome"],
      ["P01", "Hi!"],
      [null, "[laughter]"],
    ]);
  });

  it("writes SRT and text", () => {
    expect(transcriptToSrt(segments, speakers)).toMatch(/^1\n00:00:01,000 --> 00:00:04,000\nJane: Hello/);
    expect(transcriptToText(segments, speakers, "Interview P01")).toBe("Interview P01\n\n[0:00:01] Jane: Hello <there> & welcome\n\n[0:00:04] P01: Hi!\n\n[laughter]\n");
    expect(parseTranscript(transcriptToSrt(segments, speakers)).segments).toHaveLength(3);
  });

  it("finds the segment playing at a time", () => {
    const s = [{ startMs: 0 }, { startMs: null }, { startMs: 5000 }, { startMs: 9000 }];
    expect(activeSegmentIndex(s, -1)).toBe(-1);
    expect(activeSegmentIndex(s, 0)).toBe(0);
    expect(activeSegmentIndex(s, 4999)).toBe(0);
    expect(activeSegmentIndex(s, 5000)).toBe(2);
    expect(activeSegmentIndex(s, 99_999)).toBe(3);
    expect(activeSegmentIndex([], 10)).toBe(-1);
  });
});

describe("mock transcription", () => {
  it("asks the guide questions, in order, within the recording", () => {
    const guide = guideTemplate("coffee");
    const segs = mockTranscript({ guide, durationMs: 600_000, seed: "x" });
    const asked = segs.filter((s) => s.speaker === "S1").map((s) => s.text);
    for (const q of flatQuestions(guide)) expect(asked).toContain(q.text);
    expect(segs.at(-1)!.endMs!).toBeLessThanOrEqual(600_000);
    for (let i = 1; i < segs.length; i++) expect(segs[i]!.startMs!).toBeGreaterThanOrEqual(segs[i - 1]!.endMs!);
    expect(mockTranscript({ guide, durationMs: 600_000, seed: "x" })).toEqual(segs);
  });

  it("gives focus groups several voices", () => {
    const speakers = new Set(mockTranscript({ guide: null, durationMs: null, seed: "fg", participants: 3 }).map((s) => s.speaker));
    expect(speakers.size).toBe(4);
  });
});
