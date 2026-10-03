/**
 * House style for every piece of prose Lyze writes (analyses, report text, summaries), from the
 * humanize skill vendored at docs/skills/humanize: no dashes, no AI vocabulary or filler, no
 * formulaic sections, every claim tied to the data.
 */
export const STYLE_RULES = `Follow the "humanize" house style (docs/skills/humanize). The master principle: generic is the tell, specific is the fix. Every sentence that could appear in anyone's report is a liability; every sentence only this project could produce is proof of life.

House rules (always):
- No em dashes or en dashes. Ever. Use commas, colons, periods or parentheses.
- No invented content or metrics. Every number, code name and quote must come from the data given.
- Concise over comprehensive. No preamble, no closing summary, no "In conclusion".
- Neutral, plain academic voice: this is research writing, so plain IS the human voice. Vary sentence length.

Avoid all 33 patterns of AI writing:
Content: inflated significance or legacy claims; notability padding; superficial trailing "-ing" analyses ("highlighting the importance of..."); promotional tone; weasel attributions ("experts say"); formulaic "Challenges" / "Future outlook" sections.
Language: AI vocabulary (delve, tapestry, pivotal, landscape, testament, vibrant, intricate, fostering, underscore, showcase, realm, harness, illuminate, bolster, facilitate, streamline, seamless, robust, nuanced, multifaceted, crucial, transformative, innovative); copula avoidance ("serves as", "boasts" instead of "is", "has"); negative parallelisms ("It's not X, it's Y"); rule-of-three lists for rhythm; synonym cycling for the same thing (call a code by its name every time); false ranges ("from X to Y" that isn't a range); vague passive voice and subjectless fragments.
Style: no em or en dashes; little bold; no bold-label bullet lists; sentence-case headings, not Title Case; no emojis; straight quotes.
Communication: no chatbot leftovers ("I hope this helps", "Let me know"); no speculation to fill gaps; no flattery.
Filler: no "in order to", "due to the fact that", "it is important to note"; no stacked hedges (hedge once, where it matters, and say why); no upbeat endings; no "at its core", "the real question is"; no signposting ("let's look at"); no headers followed by a one-line restatement; no staccato drama or punchlines; no aphorisms ("X is the Y of Z").

Detection: look for clusters, not single words. Keep what makes writing human: specific details, mixed results and unresolved tension, participants' exact words. Don't over-sanitize into stiff prose.`;

/** The audit step of the humanize process, used as a second pass over AI drafts. */
export const AUDIT_PROMPT = `What makes the text below so obviously AI generated? List the remaining tells honestly (pattern and the exact words). Then write the final version that fixes them while keeping every fact, number, code name, heading and quote exactly as they are. Same structure, same length roughly, Markdown kept. No em or en dashes anywhere.`;

/** Words and phrases that mark text as machine-written (humanize: references/ai-tells.md and patterns.md). */
export const AI_TELLS = [
  "delve", "tapestry", "pivotal", "landscape", "testament", "vibrant", "intricate", "fostering", "underscore",
  "underscores", "showcase", "showcases", "crucial", "multifaceted", "nuanced", "robust", "seamless", "realm",
  "holistic", "leverage", "game-changer", "game-changing", "in today's world", "serves as", "boasts", "harness",
  "illuminate", "bolster", "streamline", "revolutionize", "cutting-edge", "transformative", "that being said",
  "at its core", "a key takeaway", "shed light on", "it is important to note", "in order to", "due to the fact that",
];

/** Safe phrase swaps from the humanize word tables. Applied mechanically; wording beyond these is left to the writer. */
const SWAPS: [RegExp, string][] = [
  [/\bin order to\b/gi, "to"],
  [/\bdue to the fact that\b/gi, "because"],
  [/\bthat being said,/gi, "even so,"],
  [/\bdelves into\b/gi, "looks at"],
  [/\bdelve into\b/gi, "look at"],
  [/\bshed(s)? light on\b/gi, "explain$1"],
  [/\bunderscores\b/gi, "shows"],
  [/\bunderscore\b/gi, "show"],
  [/\bserves as\b/gi, "is"],
  [/\bfacilitates\b/gi, "helps"],
  [/\bfacilitate\b/gi, "help"],
  [/\butiliz(e|es|ed|ing)\b/gi, "us$1"],
  [/\ba testament to\b/gi, "evidence of"],
];

/** Filler openers that are simply dropped; the next word is capitalized when it starts a sentence. */
const DROPS = [/\b(?:it is|it's) (?:important|worth) (?:to note|noting) that\s+(\p{L})/giu, /\bat its core,\s+(\p{L})/giu];

function drop(text: string): string {
  let out = text;
  for (const re of DROPS)
    out = out.replace(re, (_m, c: string, offset: number, all: string) => (offset === 0 || /[.!?]\s*$|\n\s*$/.test(all.slice(Math.max(0, offset - 3), offset)) ? c.toUpperCase() : c));
  return out;
}

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
  let out = drop(text);
  for (const [re, to] of SWAPS) out = out.replace(re, (m) => {
    const r = m.replace(new RegExp(re.source, "i"), to);
    return /^[A-Z]/.test(m) ? r.charAt(0).toUpperCase() + r.slice(1) : r;
  });
  return out
    .replace(/(\d)\s*[–—]\s*(\d)/g, "$1 to $2")
    .replace(/\s*[—]\s*/g, ", ")
    .replace(/\s+[–]\s+/g, ", ")
    .replace(/[–]/g, "-")
    .replace(/[“”„]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/,\s*,/g, ",")
    .replace(/[ \t]{2,}/g, " ");
}
