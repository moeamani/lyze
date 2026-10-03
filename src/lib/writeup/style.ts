/**
 * House style for every written analysis, built-in or AI: plain, specific, human prose.
 * Based on the "humanize" checklist (Wikipedia's signs of AI writing): no dashes, no inflated
 * vocabulary, no formulaic sections, every claim tied to the data.
 */
export const STYLE_RULES = `Write like an experienced researcher writing for colleagues, not like a chatbot.
- Be specific. Name the code, the number of people, the study. Generic sentences that could fit any project are not allowed.
- Use plain verbs: "is", "has", "shows", "says". Avoid "serves as", "boasts", "underscores", "highlights the importance of".
- Never use these words: delve, tapestry, pivotal, landscape, testament, vibrant, intricate, fostering, underscore, showcase, crucial, multifaceted, nuanced, robust, seamless, realm, holistic, leverage, navigate (figuratively), journey (figuratively), unpack, game-changer, in today's world.
- Never use em dashes or en dashes. Use a comma, colon, period or parentheses instead.
- No "It's not X, it's Y" constructions. No rule-of-three lists for rhythm. No rhetorical questions. No "In conclusion" or upbeat closing lines.
- Vary sentence length. Short sentences are fine. So are longer ones that take their time.
- Use straight quotes. Quote participants exactly and say who said it (participant code) when you know.
- Hedge once, where it matters, and say why (small sample, one study, self-report). Do not stack hedges.
- Say plainly when the data does not answer a question. Do not fill gaps with speculation.
- Headings in sentence case. Bold only for the occasional key finding, never as bullet labels.`;

/** Words that mark text as machine-written; checked by tests and stripped from AI output where safe. */
export const AI_TELLS = [
  "delve", "tapestry", "pivotal", "landscape", "testament", "vibrant", "intricate", "fostering", "underscore",
  "underscores", "showcase", "showcases", "crucial", "multifaceted", "nuanced", "robust", "seamless", "realm",
  "holistic", "leverage", "game-changer", "in today's world", "serves as", "boasts",
];

/** Words found in `text` that read as AI-written. */
export function proseIssues(text: string): string[] {
  const lower = text.toLowerCase();
  const found = AI_TELLS.filter((w) => new RegExp(`(^|[^a-z])${w.replace(/[-']/g, "[-']")}([^a-z]|$)`).test(lower));
  if (/[–—]/.test(text)) found.push("dash");
  return found;
}

/**
 * Mechanical clean-up applied to every write-up: dashes become commas (or "to" in ranges),
 * curly quotes become straight, and doubled spaces collapse. Wording changes are left to the writer.
 */
export function cleanProse(text: string): string {
  return text
    .replace(/(\d)\s*[–—]\s*(\d)/g, "$1 to $2")
    .replace(/\s*[—]\s*/g, ", ")
    .replace(/\s+[–]\s+/g, ", ")
    .replace(/[–]/g, "-")
    .replace(/[“”„]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/,\s*,/g, ",")
    .replace(/[ \t]{2,}/g, " ");
}
