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
export function parseTranscript(input: string): { format: ImportFormat; segments: SegmentInput[]; speakers: string[] } {
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
  const speakers = [...new Set(segments.map((s) => s.speaker).filter((s): s is string => !!s))];
  return { format, segments, speakers };
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
function splitSpeaker(line: string): { speaker: string; text: string } | null {
  const m = line.match(/^([^:\n]{1,40}?):\s+([\s\S]+)$/);
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
 * Plain text in the common shapes:
 *   `[00:01:02] Jane: text` · `00:01:02 Jane: text` · `Jane: text` ·
 *   `Jane  0:03` on its own line followed by a paragraph · plain paragraphs.
 */
function parsePlainText(text: string): SegmentInput[] {
  const out: SegmentInput[] = [];
  let pendingHeader: { speaker: string; startMs: number | null } | null = null;
  const paragraphs = text.split(/\n/);
  for (const raw of paragraphs) {
    let line = raw.trim();
    if (!line) {
      pendingHeader = null;
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
      line = line.slice(t[0].length);
    }
    const named = splitSpeaker(line);
    if (pendingHeader && !named) {
      const prev = out.at(-1);
      // Continuation lines of the same header paragraph join the previous segment.
      if (prev && prev.speaker === pendingHeader.speaker && prev.startMs === pendingHeader.startMs) prev.text += ` ${line}`;
      else out.push({ speaker: pendingHeader.speaker, startMs: pendingHeader.startMs, endMs: null, text: line });
      continue;
    }
    pendingHeader = null;
    if (named) out.push({ speaker: named.speaker, startMs, endMs: null, text: named.text });
    else {
      const prev = out.at(-1);
      if (prev && startMs === null && !prev.speaker && prev.text.length < MAX_SEGMENT_CHARS) prev.text += ` ${line}`;
      else out.push({ speaker: null, startMs, endMs: null, text: line });
    }
  }
  return fillEndTimes(out.map((s) => ({ ...s, text: s.text.slice(0, MAX_SEGMENT_CHARS) })));
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
