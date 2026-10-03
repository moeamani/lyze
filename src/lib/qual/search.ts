import type { Range } from "./ranges";

/** `coffee "morning routine" -tea` → terms (all must match), phrases kept together, exclusions. */
export function parseQuery(q: string): { terms: string[]; exclude: string[] } {
  const terms: string[] = [];
  const exclude: string[] = [];
  const re = /(-?)"([^"]+)"|(-?)(\S+)/g;
  for (let m = re.exec(q); m; m = re.exec(q)) {
    const neg = (m[1] ?? m[3]) === "-";
    const term = (m[2] ?? m[4] ?? "").trim().toLowerCase();
    if (!term || term === "-") continue;
    (neg ? exclude : terms).push(term);
  }
  return { terms: [...new Set(terms)], exclude: [...new Set(exclude)] };
}

export function matches(text: string, query: { terms: string[]; exclude: string[] }): boolean {
  const lower = text.toLowerCase();
  return query.terms.every((t) => lower.includes(t)) && !query.exclude.some((t) => lower.includes(t));
}

/** All occurrences of the terms, merged where they touch. */
export function hits(text: string, terms: readonly string[]): Range[] {
  const lower = text.toLowerCase();
  const found: Range[] = [];
  for (const t of terms) for (let i = lower.indexOf(t); i >= 0 && t; i = lower.indexOf(t, i + t.length)) found.push({ start: i, end: i + t.length });
  found.sort((a, b) => a.start - b.start);
  const merged: Range[] = [];
  for (const r of found) {
    const last = merged.at(-1);
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end);
    else merged.push({ ...r });
  }
  return merged;
}

/** A window of text around the first hit, with hit positions relative to the snippet. */
export function snippet(text: string, terms: readonly string[], radius = 90): { text: string; hits: Range[]; clippedStart: boolean; clippedEnd: boolean } {
  const all = hits(text, terms);
  if (text.length <= radius * 2 || !all.length) {
    const clipped = text.length > radius * 2;
    const t = clipped ? text.slice(0, radius * 2) : text;
    return { text: t, hits: all.filter((h) => h.end <= t.length), clippedStart: false, clippedEnd: clipped };
  }
  const first = all[0]!;
  let start = Math.max(0, first.start - radius);
  let end = Math.min(text.length, first.end + radius);
  // Don't cut words in half.
  while (start > 0 && /\S/.test(text[start - 1]!)) start--;
  while (end < text.length && /\S/.test(text[end]!)) end++;
  return {
    text: text.slice(start, end),
    hits: all.filter((h) => h.start >= start && h.end <= end).map((h) => ({ start: h.start - start, end: h.end - start })),
    clippedStart: start > 0,
    clippedEnd: end < text.length,
  };
}

/** Escape a term for SQL LIKE (with `\` as the escape character). */
export function likePattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
