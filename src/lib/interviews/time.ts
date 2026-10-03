/** Timestamps for transcripts and notes. All times are milliseconds from the start of the recording. */

/** `mm:ss`, or `h:mm:ss` once past an hour (or when `hours` is forced). */
export function formatTimestamp(ms: number, opts: { hours?: boolean } = {}): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 || opts.hours ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** `hh:mm:ss.mmm` (WebVTT) or `hh:mm:ss,mmm` (SRT). */
export function formatCueTime(ms: number, separator: "." | ","): string {
  const v = Math.max(0, Math.round(ms));
  const h = Math.floor(v / 3_600_000);
  const m = Math.floor((v % 3_600_000) / 60_000);
  const s = Math.floor((v % 60_000) / 1000);
  const f = v % 1000;
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}${separator}${pad(f, 3)}`;
}

/**
 * Parse `1:02`, `01:02:03`, `00:01:02.500` or `00:01:02,500` into milliseconds.
 * Returns null for anything else.
 */
export function parseTimestamp(raw: string): number | null {
  const m = raw.trim().match(/^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})(?:[.,](\d{1,3}))?$/);
  if (!m) return null;
  const [, h, min, s, frac] = m;
  if (Number(s) > 59 || (h !== undefined && Number(min) > 59)) return null;
  const ms = frac ? Number(frac.padEnd(3, "0")) : 0;
  return ((Number(h ?? 0) * 60 + Number(min)) * 60 + Number(s)) * 1000 + ms;
}

/** "45 min", "1 h 30 min". */
export function formatMinutes(minutes: number): { h: number; m: number } {
  const total = Math.max(0, Math.round(minutes));
  return { h: Math.floor(total / 60), m: total % 60 };
}
