/**
 * Text ranges for coding. Offsets are UTF-16 indices into one unit of text (a transcript segment
 * or an open-text answer), exactly what the browser's Selection API gives us.
 */

export type Range = { start: number; end: number };
export type Marked = Range & { id: string; codeId: string; pending?: boolean };

/** Clamp to the text and drop surrounding whitespace. Null when nothing is left. */
export function normalizeRange(text: string, start: number, end: number): Range | null {
  let s = Math.max(0, Math.min(start, end, text.length));
  let e = Math.min(text.length, Math.max(start, end, 0));
  while (s < e && /\s/.test(text[s]!)) s++;
  while (e > s && /\s/.test(text[e - 1]!)) e--;
  return e > s ? { start: s, end: e } : null;
}

/** Widen a range to whole words, so a sloppy drag still codes complete words. */
export function snapToWords(text: string, r: Range): Range {
  let { start, end } = r;
  const word = /[\p{L}\p{N}'’-]/u;
  while (start > 0 && word.test(text[start - 1]!) && word.test(text[start]!)) start--;
  while (end < text.length && word.test(text[end]!) && word.test(text[end - 1]!)) end++;
  return { start, end };
}

/**
 * Split a text into consecutive spans, each listing the codings that cover it. Used to render
 * overlapping highlights without nesting marks.
 */
export function spans(length: number, marks: readonly Marked[]): { start: number; end: number; marks: Marked[] }[] {
  const points = new Set([0, length]);
  for (const m of marks) {
    points.add(Math.max(0, Math.min(length, m.start)));
    points.add(Math.max(0, Math.min(length, m.end)));
  }
  const sorted = [...points].sort((a, b) => a - b);
  const out: { start: number; end: number; marks: Marked[] }[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const start = sorted[i]!;
    const end = sorted[i + 1]!;
    if (end <= start) continue;
    out.push({ start, end, marks: marks.filter((m) => m.start <= start && m.end >= end) });
  }
  return out;
}

/**
 * After a text edit, find where a coded quote went. Exact position first, then the occurrence
 * nearest to the old start. Null when the quote no longer exists.
 */
export function relocate(newText: string, quote: string, oldStart: number): Range | null {
  if (!quote) return null;
  if (newText.slice(oldStart, oldStart + quote.length) === quote) return { start: oldStart, end: oldStart + quote.length };
  let best: number | null = null;
  for (let i = newText.indexOf(quote); i >= 0; i = newText.indexOf(quote, i + 1)) {
    if (best === null || Math.abs(i - oldStart) < Math.abs(best - oldStart)) best = i;
  }
  return best === null ? null : { start: best, end: best + quote.length };
}

/** Sentence that contains a position (for "code the sentence" suggestions). */
export function sentenceAt(text: string, at: number): Range {
  const enders = /[.!?…]["”’)]?\s+/g;
  let start = 0;
  let end = text.length;
  for (let m = enders.exec(text); m; m = enders.exec(text)) {
    const boundary = m.index + m[0].length;
    if (boundary <= at) start = boundary;
    else {
      end = m.index + m[0].trimEnd().length;
      break;
    }
  }
  return normalizeRange(text, start, end) ?? { start: 0, end: text.length };
}

/** UTF-16 offset → Unicode code point offset (REFI-QDA positions). */
export function toCodePoints(text: string, utf16: number): number {
  return Array.from(text.slice(0, utf16)).length;
}
