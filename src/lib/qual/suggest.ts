import { tokenize } from "@/lib/analysis/text";
import { keywords, stem } from "./nlp";
import { sentenceAt, type Range } from "./ranges";

export type Unit = { id: string; text: string };
export type CodeHint = { id: string; name: string; definition: string | null };
export type CodingSuggestion = Range & { unitId: string; codeId: string; reason: string };

/**
 * Suggest existing codes for passages by matching the code's name and definition keywords
 * against each sentence. Conservative on purpose: the name must match, or two definition words.
 */
export function suggestCodings(units: readonly Unit[], codes: readonly CodeHint[], existing: ReadonlySet<string> = new Set()): CodingSuggestion[] {
  const codeTerms = codes.map((c) => ({
    code: c,
    name: new Set(keywords(c.name)),
    def: new Set(keywords(c.definition ?? "").filter((t) => !keywords(c.name).includes(t))),
  }));
  const out: CodingSuggestion[] = [];
  for (const unit of units) {
    const words = tokenize(unit.text);
    if (!words.length) continue;
    const seen = new Set<string>();
    for (const { code, name, def } of codeTerms) {
      if (!name.size && !def.size) continue;
      // Find the first word that matches the code's name; else a sentence with ≥2 definition words.
      const lower = unit.text.toLowerCase();
      let at = -1;
      let reason = "";
      for (const m of lower.matchAll(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)) {
        if (name.has(stem(m[0]))) {
          at = m.index ?? 0;
          reason = m[0];
          break;
        }
      }
      if (at < 0 && def.size >= 2) {
        for (const m of lower.matchAll(/[^.!?…]+[.!?…]*/gu)) {
          const hit = keywords(m[0]).filter((t) => def.has(t));
          if (new Set(hit).size >= 2) {
            at = (m.index ?? 0) + 1;
            reason = [...new Set(hit)].slice(0, 3).join(", ");
            break;
          }
        }
      }
      if (at < 0) continue;
      const r = sentenceAt(unit.text, at);
      const key = `${unit.id}:${code.id}`;
      if (seen.has(key) || existing.has(key)) continue;
      seen.add(key);
      out.push({ unitId: unit.id, codeId: code.id, start: r.start, end: r.end, reason });
    }
  }
  return out;
}

/** A plain-language description for a theme from its codes and a few quotes. */
export function draftThemeDescription(theme: string, codes: readonly { name: string; definition: string | null; count: number }[], quotes: readonly string[]): string {
  const top = [...codes].sort((a, b) => b.count - a.count).slice(0, 4);
  const names = top.map((c) => c.name.toLowerCase());
  const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : (names[0] ?? "a few related ideas");
  const total = codes.reduce((s, c) => s + c.count, 0);
  const quote = quotes.find((q) => q.length > 30 && q.length < 180);
  return [
    `“${theme}” brings together ${list}${total ? ` (${total} coded passage${total === 1 ? "" : "s"})` : ""}.`,
    top[0]?.definition ? `At its core: ${top[0].definition.replace(/\.$/, "")}.` : "",
    quote ? `As one participant put it: “${quote.trim()}”` : "",
  ]
    .filter(Boolean)
    .join(" ");
}
