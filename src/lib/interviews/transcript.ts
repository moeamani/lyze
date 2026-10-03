import { formatCueTime, formatTimestamp, parseTimestamp } from "./time";
import type { Speakers } from "./sessions";

/**
 * Transcript segments as stored: who spoke, when (when known) and what they said.
 * `speaker` is a key into the transcript's speaker map (e.g. "S1"), so renaming a speaker or
 * linking them to a participant is one edit.
 */
export type SegmentInput = { speaker: string | null; startMs: number | null; endMs: number | null; text: string };
export type ImportFormat = "vtt" | "srt" | "text";

const MAX_SEGMENT_CHARS = 4000;

/** Detect the format and parse a transcript exported from Zoom, Teams, Meet, Otter, Descript… */
export function parseTranscript(input: string): { format: ImportFormat; segments: SegmentInput[]; speakers: string[]; title: string | null } {
  const text = input.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  let format: ImportFormat;
  let segments: SegmentInput[];
  if (/^WEBVTT/.test(text.trimStart())) {
    format = "vtt";
    segments = mergeCues(parseCues(text));
  } else if (/^\s*\d+\s*\n\s*\d{1,2}:\d{2}:\d{2},\d{1,3}\s*-->/.test(text)) {
    format = "srt";
    segments = mergeCues(parseCues(text));
  } else {
    format = "text";
    segments = parsePlainText(text);
  }
  // A document heading before the first turn ("Session 1 - clean transcription") is a title, not speech.
  let title: string | null = null;
  const firstTurn = segments.findIndex((s) => s.speaker);
  if (firstTurn === 1 && !segments[0]!.speaker && segments[0]!.startMs === null && segments[0]!.text.length <= 120 && !/^[([]/.test(segments[0]!.text)) {
    title = segments[0]!.text.trim();
    segments = segments.slice(1);
  }
  const speakers = [...new Set(segments.map((s) => s.speaker).filter((s): s is string => !!s))];
  return { format, segments, speakers, title };
}

const CUE_TIME = /(\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{1,3}/;
const CUE_LINE = new RegExp(`^\\s*(${CUE_TIME.source})\\s*-->\\s*(${CUE_TIME.source})`);

function parseCues(text: string): SegmentInput[] {
  const blocks = text.split(/\n{2,}/);
  const out: SegmentInput[] = [];
  for (const block of blocks) {
    const lines = block.split("\n");
    const timeIdx = lines.findIndex((l) => CUE_LINE.test(l));
    if (timeIdx < 0) continue; // header, NOTE, STYLE, REGION blocks
    const m = lines[timeIdx]!.match(CUE_LINE)!;
    const startMs = parseTimestamp(m[1]!);
    const endMs = parseTimestamp(m[3]!);
    let body = lines.slice(timeIdx + 1).join(" ").trim();
    if (!body) continue;
    let speaker: string | null = null;
    // Teams / WebVTT voice spans: <v Jane Doe>Hello</v>
    const voice = body.match(/^<v(?:\.[^\s>]+)*\s+([^>]+)>/);
    if (voice) {
      speaker = voice[1]!.trim();
      body = body.replace(/<v(?:\.[^\s>]+)*\s+[^>]+>/g, "").replace(/<\/v>/g, "");
    }
    body = body.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").trim();
    // Zoom / SRT: "Jane Doe: Hello"
    if (!speaker) {
      const named = splitSpeaker(body);
      if (named) {
        speaker = named.speaker;
        body = named.text;
      }
    }
    if (body) out.push({ speaker, startMs, endMs, text: body });
  }
  return out;
}

/** "Name: text" with a plausible name (short, no sentence punctuation, not a URL). */
function splitSpeaker(line: string, { tight = false } = {}): { speaker: string; text: string } | null {
  // Inside a numbered turn "Name:text" (no space) is still a speaker; elsewhere it needs the space.
  const m = line.match(tight ? /^([^:\n]{1,40}?):\s*(\S[\s\S]*)$/ : /^([^:\n]{1,40}?):\s+([\s\S]+)$/);
  if (!m) return null;
  const name = m[1]!.trim();
  if (!name || /[.?!,;"]|https?$|^\d+$/.test(name) || name.split(/\s+/).length > 4) return null;
  return { speaker: name, text: m[2]!.trim() };
}

/**
 * Captions arrive as many short cues. Join consecutive cues from the same speaker into one
 * readable segment when they follow each other closely.
 */
export function mergeCues(cues: SegmentInput[], gapMs = 2000): SegmentInput[] {
  const out: SegmentInput[] = [];
  for (const cue of cues) {
    const prev = out.at(-1);
    const close = prev && prev.endMs !== null && cue.startMs !== null && cue.startMs - prev.endMs <= gapMs;
    if (prev && prev.speaker === cue.speaker && close && prev.text.length + cue.text.length < MAX_SEGMENT_CHARS / 4) {
      prev.text = `${prev.text} ${cue.text}`;
      prev.endMs = cue.endMs;
    } else {
      out.push({ ...cue });
    }
  }
  return out;
}

const BRACKET_TIME = /^\[?\(?((?:\d{1,2}:)?\d{1,2}:\d{2}(?:[.,]\d{1,3})?)\)?\]?\s*/;
/** Otter / Descript style header line: "Jane Doe  0:03" or "Jane Doe 00:01:02". */
const HEADER_LINE = /^(.{1,40}?)\s+((?:\d{1,2}:)?\d{1,2}:\d{2})$/;
/**
 * Numbered turns from hand-made transcripts: "12 (00:45:35) - Jane: text", "12(00:45:35) Jane: …",
 * "12 [0:45:35] Jane: …". The time may be sloppy ("02:11:040", "02:34:39 ").
 */
const NUMBERED_TIMED = /^\s*\d{1,5}\s*[([]\s*(\d{1,2}:\d{1,2}(?::\d{1,3})?(?:[.,]\d{1,3})?)\s*[)\]]\s*[-–—:]?\s*([\s\S]*)$/;
/** "12. Jane: text", "12) Jane: text", "12 - Jane: text". */
const NUMBERED = /^\s*\d{1,5}\s*[.)\-–—]\s*([\s\S]+)$/;
/** A numbered note that isn't speech: "245 (The video goes blank and comes back again)". */
const NUMBERED_NOTE = /^\s*\d{1,5}\s*(\([^)]{3,}\))\s*$/;

/** Like parseTimestamp, but forgiving of typed times: "02:11:040" → 2:11:40, "1:5:03" → 1:05:03. */
function looseTimestamp(raw: string): number | null {
  const exact = parseTimestamp(raw);
  if (exact !== null) return exact;
  const m = raw.trim().match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,3}))?$/);
  if (!m) return null;
  const [h, min, sec] = m[3] !== undefined ? [Number(m[1]), Number(m[2]), Number(m[3])] : [0, Number(m[1]), Number(m[2])];
  if (min > 59 || sec > 59) return null;
  return ((h * 60 + min) * 60 + sec) * 1000;
}

/**
 * Plain text in the common shapes:
 *   `[00:01:02] Jane: text` · `00:01:02 Jane: text` · `Jane: text` ·
 *   `12 (00:01:02) - Jane: text` (numbered turns; untimed lines like "(00:31:50) - Several people
 *   talk at once." become notes without a speaker) ·
 *   `Jane  0:03` on its own line followed by a paragraph · plain paragraphs.
 * A paragraph straight after a numbered turn (no blank line between) continues that turn.
 */
function parsePlainText(text: string): SegmentInput[] {
  const out: SegmentInput[] = [];
  let pendingHeader: { speaker: string; startMs: number | null } | null = null;
  // Whether the previous line was (part of) a numbered turn, so the next plain line continues it.
  let inTurn = false;
  const push = (seg: SegmentInput, numbered = false) => {
    out.push(seg);
    inTurn = numbered && !!seg.speaker;
  };
  const append = (line: string) => {
    const prev = out.at(-1)!;
    if (prev.text.length + line.length + 1 <= MAX_SEGMENT_CHARS) prev.text += ` ${line}`;
    // Too long for one segment: carry on in a new one from the same speaker.
    else out.push({ speaker: prev.speaker, startMs: null, endMs: null, text: line });
  };
  const lines = text.split(/\n/);
  // Hand-made transcripts that number every turn: an unnumbered paragraph is never a new speaker.
  const numberedDoc = lines.filter((l) => NUMBERED_TIMED.test(l) || (NUMBERED.test(l) && splitSpeaker(l.replace(NUMBERED, "$1").trim(), { tight: true }))).length >= 3;
  for (const raw of lines) {
    let line = raw.trim();
    if (!line) {
      pendingHeader = null;
      inTurn = false;
      continue;
    }

    const note = line.match(NUMBERED_NOTE);
    if (note) {
      pendingHeader = null;
      push({ speaker: null, startMs: null, endMs: null, text: note[1]! });
      continue;
    }
    const timed = line.match(NUMBERED_TIMED);
    if (timed) {
      pendingHeader = null;
      const startMs = looseTimestamp(timed[1]!);
      const named = splitSpeaker(timed[2]!.trim(), { tight: true });
      if (named) push({ speaker: named.speaker, startMs, endMs: null, text: named.text }, true);
      else if (timed[2]!.trim()) push({ speaker: null, startMs, endMs: null, text: timed[2]!.trim() });
      continue;
    }
    const numbered = line.match(NUMBERED);
    const numberedNamed = numbered ? splitSpeaker(numbered[1]!.trim(), { tight: true }) : null;
    if (numberedNamed) {
      pendingHeader = null;
      push({ speaker: numberedNamed.speaker, startMs: null, endMs: null, text: numberedNamed.text }, true);
      continue;
    }

    if (numberedDoc) {
      const prev = out.at(-1);
      // "(Break)", "[inaudible]": a note. Anything else continues the last speaker's turn.
      if (/^[([].*[)\]]$/.test(line) || !prev?.speaker) push({ speaker: null, startMs: null, endMs: null, text: line });
      else append(line);
      continue;
    }

    const header = line.match(HEADER_LINE);
    if (header && !splitSpeaker(line)) {
      pendingHeader = { speaker: header[1]!.trim(), startMs: parseTimestamp(header[2]!) };
      continue;
    }
    let startMs: number | null = null;
    const t = line.match(BRACKET_TIME);
    if (t && parseTimestamp(t[1]!) !== null) {
      startMs = parseTimestamp(t[1]!);
      line = line.slice(t[0].length).replace(/^[-–—]\s*/, "");
    }
    const named = splitSpeaker(line);
    if (pendingHeader && !named) {
      const prev = out.at(-1);
      // Continuation lines of the same header paragraph join the previous segment.
      if (prev && prev.speaker === pendingHeader.speaker && prev.startMs === pendingHeader.startMs) append(line);
      else push({ speaker: pendingHeader.speaker, startMs: pendingHeader.startMs, endMs: null, text: line });
      continue;
    }
    pendingHeader = null;
    if (named) push({ speaker: named.speaker, startMs, endMs: null, text: named.text });
    else {
      const prev = out.at(-1);
      if (prev && startMs === null && inTurn) append(line);
      else if (prev && startMs === null && !prev.speaker && prev.text.length < MAX_SEGMENT_CHARS) append(line);
      else push({ speaker: null, startMs, endMs: null, text: line });
    }
  }
  return fillEndTimes(out.flatMap((s) => splitLong(s)));
}

/** Break a segment longer than the limit at sentence ends, so nothing is cut off. */
function splitLong(seg: SegmentInput): SegmentInput[] {
  if (seg.text.length <= MAX_SEGMENT_CHARS) return [seg];
  const parts: string[] = [];
  let rest = seg.text;
  while (rest.length > MAX_SEGMENT_CHARS) {
    const window = rest.slice(0, MAX_SEGMENT_CHARS);
    const cut = Math.max(window.lastIndexOf(". "), window.lastIndexOf("? "), window.lastIndexOf("! "));
    const at = cut > MAX_SEGMENT_CHARS / 2 ? cut + 1 : window.lastIndexOf(" ") > 0 ? window.lastIndexOf(" ") : MAX_SEGMENT_CHARS;
    parts.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) parts.push(rest);
  return parts.map((text, i) => ({ ...seg, startMs: i ? null : seg.startMs, endMs: i === parts.length - 1 ? seg.endMs : null, text }));
}

/** A segment without an end time ends where the next timed one starts. */
export function fillEndTimes(segments: SegmentInput[]): SegmentInput[] {
  return segments.map((s, i) => {
    if (s.endMs !== null || s.startMs === null) return s;
    const next = segments.slice(i + 1).find((n) => n.startMs !== null);
    return { ...s, endMs: next?.startMs ?? null };
  });
}

// ── Exports ────────────────────────────────────────────────────────────────

type Exportable = { speaker: string | null; startMs: number | null; endMs: number | null; text: string };
const nameOf = (speakers: Speakers, key: string | null) => (key ? (speakers[key]?.name ?? key) : null);

export function transcriptToText(segments: Exportable[], speakers: Speakers, header?: string): string {
  const lines = segments.map((s) => {
    const time = s.startMs !== null ? `[${formatTimestamp(s.startMs, { hours: true })}] ` : "";
    const who = nameOf(speakers, s.speaker);
    return `${time}${who ? `${who}: ` : ""}${s.text}`;
  });
  return `${header ? `${header}\n\n` : ""}${lines.join("\n\n")}\n`;
}

/** Cues need times: untimed segments get a 4-second slot after the previous cue. */
function timed(segments: Exportable[]) {
  let cursor = 0;
  return segments.map((s) => {
    const start = s.startMs ?? cursor;
    const end = s.endMs ?? Math.max(start + 4000, start + s.text.length * 60);
    cursor = end;
    return { ...s, start, end };
  });
}

export function transcriptToVtt(segments: Exportable[], speakers: Speakers): string {
  const cues = timed(segments).map((s) => {
    const who = nameOf(speakers, s.speaker);
    const body = s.text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return `${formatCueTime(s.start, ".")} --> ${formatCueTime(s.end, ".")}\n${who ? `<v ${who.replace(/>/g, "")}>` : ""}${body}`;
  });
  return `WEBVTT\n\n${cues.join("\n\n")}\n`;
}

export function transcriptToSrt(segments: Exportable[], speakers: Speakers): string {
  const cues = timed(segments).map((s, i) => {
    const who = nameOf(speakers, s.speaker);
    return `${i + 1}\n${formatCueTime(s.start, ",")} --> ${formatCueTime(s.end, ",")}\n${who ? `${who}: ` : ""}${s.text}`;
  });
  return `${cues.join("\n\n")}\n`;
}

/** Index of the segment playing at `ms` (last segment that started at or before it). */
export function activeSegmentIndex(segments: readonly { startMs: number | null }[], ms: number): number {
  let lo = 0;
  let hi = segments.length - 1;
  let found = -1;
  // Timed segments are in order; untimed ones are skipped over.
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    let probe = mid;
    while (probe >= lo && segments[probe]!.startMs === null) probe--;
    if (probe < lo) {
      lo = mid + 1;
      continue;
    }
    if (segments[probe]!.startMs! <= ms) {
      found = probe;
      lo = mid + 1;
    } else {
      hi = probe - 1;
    }
  }
  return found;
}
