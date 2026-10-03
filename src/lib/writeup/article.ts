import { keywords } from "@/lib/qual/nlp";
import { tTwoSided } from "@/lib/stats/distributions";
import { formatP } from "@/lib/stats/format";
import type { WriteupContext } from "./context";
import { relevantCodes } from "./compose";
import { cleanProse } from "./style";

/**
 * The built-in "Data analysis and results" section, written the way such sections read in a
 * journal article or thesis chapter: how the data were analysed, the sample, descriptive results
 * with M, SD and percentages, themes with quotes, how the two strands compare, a test of each
 * hypothesis where the survey measured it, and an answer to each research question.
 *
 * Everything is computed from the project's own data; nothing is invented. Sentence frames rotate
 * so the text doesn't repeat itself, and the output goes through the humanize clean-up.
 */

type Item = WriteupContext["items"][number];
type Code = WriteupContext["codes"][number];

const f2 = (x: number) => x.toFixed(2);
const pc = (x: number) => `${Math.round(x)}%`;
const q = (s: string) => `"${s.trim().replace(/[.?!]$/, "")}"`;
const WORDS_LC = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
/** APA style: numbers under 10 as words in running text. */
const plural = (n: number, one: string, many: string) => `${n < 10 ? WORDS_LC[n] : n} ${n === 1 ? one : many}`;
/** A quote inside a sentence: its own closing punctuation goes, the sentence supplies one. */
const inQuote = (t: string) => `"${t.trim().replace(/[.!?]+$/, "")}"`;
const pick = <T,>(xs: readonly T[], i: number) => xs[((i % xs.length) + xs.length) % xs.length]!;
const listing = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);
const WORDS = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];
const spell = (n: number) => (n <= 10 ? WORDS[n]! : String(n));

const DEMOGRAPHIC = /\b(age|old|gender|sex|education|degree|occupation|job|income|city|country|live|born|ethnic|marital|employ)/i;
const isDemographic = (it: Item) => /about you|demograph|background/i.test(it.page) || DEMOGRAPHIC.test(it.question);
const GENERIC = new Set(["people", "person", "participant", "respondent", "make", "get", "use", "often", "much", "many", "main", "day", "regular", "help", "try", "stick", "role", "play", "shape", "way", "thing"].map((w) => keywords(w)[0] ?? w));

/** Survey item that best measures a statement, by shared words (ignoring the project's generic words). */
function matchItem(text: string, items: readonly Item[], common: ReadonlySet<string>): Item | null {
  const want = new Set(keywords(text).filter((w) => !GENERIC.has(w) && !common.has(w)));
  let best: { it: Item; score: number } | null = null;
  for (const it of items) {
    if (it.kind !== "scale" || !it.bounds || it.mean === null || it.sd === null || it.n < 3) continue;
    const score = keywords(it.question).filter((w) => want.has(w)).length;
    if (score > 0 && (!best || score > best.score)) best = { it, score };
  }
  return best?.it ?? null;
}

/** One-sample t-test of an item's mean against its scale midpoint, from M, SD and n. */
export function midpointTest(it: Pick<Item, "mean" | "sd" | "n" | "bounds">) {
  if (it.mean === null || it.sd === null || !it.bounds || it.n < 3 || it.sd === 0) return null;
  const mid = (it.bounds[0] + it.bounds[1]) / 2;
  const t = (it.mean - mid) / (it.sd / Math.sqrt(it.n));
  const df = it.n - 1;
  return { mid, t, df, p: tTwoSided(t, df), d: (it.mean - mid) / it.sd };
}

const testText = (r: NonNullable<ReturnType<typeof midpointTest>>) => `t(${r.df}) = ${f2(r.t)}, p ${formatP(r.p)}, d = ${f2(r.d)}`;

function topTwo(it: Item): number | null {
  if (!it.bounds || it.categories.length < 3) return null;
  return it.categories.slice(-2).reduce((s, c) => s + c.percent, 0);
}

function describeItem(it: Item, i: number): string {
  if (it.kind === "scale" && it.mean !== null) {
    const sd = it.sd !== null ? `, SD = ${f2(it.sd)}` : "";
    if (!it.bounds) return pick([`The mean answer to ${q(it.question)} was ${f2(it.mean)} (${sd.slice(2)}, n = ${it.n}).`, `Respondents reported an average of ${f2(it.mean)} for ${q(it.question)} (${sd.slice(2)}, n = ${it.n}).`], i);
    const top = topTwo(it);
    const tail = top !== null ? pick([` In all, ${pc(top)} chose one of the two highest points.`, ` The top two points of the scale drew ${pc(top)} of respondents.`], i) : "";
    if (it.type === "likert")
      return pick([`Agreement with ${q(it.question)} averaged M = ${f2(it.mean)}${sd} on a ${it.bounds[0]} to ${it.bounds[1]} scale (n = ${it.n}).`, `Respondents' agreement that ${q(it.question)} was M = ${f2(it.mean)}${sd} (n = ${it.n}).`], i) + tail;
    return pick([`Ratings for ${q(it.question)} averaged M = ${f2(it.mean)}${sd} on a ${it.bounds[0]} to ${it.bounds[1]} scale (n = ${it.n}).`, `${q(it.question)} received a mean rating of M = ${f2(it.mean)}${sd} (n = ${it.n}).`], i) + tail;
  }
  if ((it.kind === "choice" || it.kind === "multi") && it.categories.length) {
    const cats = [...it.categories].sort((a, b) => b.count - a.count);
    const [a, b] = cats;
    const multi = it.kind === "multi" ? " (respondents could choose more than one)" : "";
    if (a!.percent >= 50 && it.kind === "choice") return `A majority answered ${q(it.question)} with "${a!.label}" (${pc(a!.percent)}, n = ${a!.count} of ${it.n})${b ? `, while ${pc(b.percent)} chose "${b.label}"` : ""}.`;
    return pick(
      [
        `For ${q(it.question)}, the most common answer was "${a!.label}" (${pc(a!.percent)}, n = ${a!.count})${b ? `, followed by "${b.label}" (${pc(b.percent)})` : ""}${multi}.`,
        `Asked ${q(it.question)}, ${pc(a!.percent)} of respondents chose "${a!.label}"${b ? ` and ${pc(b.percent)} "${b.label}"` : ""}${multi} (n = ${it.n}).`,
      ],
      i,
    );
  }
  if (it.kind === "text" && it.n) return `${it.n <= 10 ? spell(it.n) : `In total, ${it.n}`} respondents answered the open question ${q(it.question)}.${it.words.length >= 3 ? ` The most frequent words were "${it.words[0]}", "${it.words[1]}" and "${it.words[2]}".` : ""}`;
  return "";
}

function quoteLine(c: Code, i: number, source?: "conversation" | "survey"): string | null {
  const x = c.quotes.find((y) => !source || y.source === source);
  if (!x) return null;
  const who = x.who ? ` (${x.who})` : x.source === "survey" ? " (survey respondent)" : "";
  return `${pick(["As one participant put it:", "In one participant's words:", "For example:"], i)}\n\n> "${x.text.trim()}"${who}`;
}

const codeWeight = (c: Code) => `${c.name} (${plural(c.qualPassages + c.quantPassages, "passage", "passages")})`;

export function composeArticle(ctx: WriteupContext): { title: string; body: string } {
  const out: string[] = [];
  const items = ctx.items.filter((it) => it.n > 0);
  const demo = items.filter(isDemographic);
  const substantive = items.filter((it) => !isDemographic(it));
  const scaleItems = substantive.filter((it) => it.kind === "scale" && it.mean !== null);
  const used = ctx.codes.filter((c) => c.qualPassages + c.quantPassages > 0).sort((a, b) => b.qualPassages + b.quantPassages - (a.qualPassages + a.quantPassages));
  const themed = new Set(ctx.themes.flatMap((t) => t.codes));
  const common = new Set<string>();
  {
    const df = new Map<string, number>();
    for (const c of ctx.codes) for (const w of new Set(keywords(`${c.name} ${c.definition ?? ""}`))) df.set(w, (df.get(w) ?? 0) + 1);
    for (const [w, n] of df) if (n >= Math.max(2, ctx.codes.length * 0.34)) common.add(w);
  }
  const testable = ctx.statements.map((s) => ({ s, item: matchItem(s.text, scaleItems, common) }));

  // ── Data analysis ──
  out.push("## Data analysis");
  const methods: string[] = [];
  if (items.length) {
    methods.push("Survey responses were analysed descriptively. Categorical items are reported as counts and percentages, and rating and agreement items as means (M) with standard deviations (SD).");
    if (testable.some((x) => x.item)) methods.push("Where a hypothesis corresponded to a single agreement or rating item, the item mean was compared with the scale midpoint using a one-sample t-test, with Cohen's d as the effect size and α = .05.");
  }
  if (used.length)
    methods.push(
      `${ctx.conversations ? `Transcripts of ${plural(ctx.conversations, "conversation", "conversations")}` : "Open survey answers"}${ctx.conversations && items.some((i) => i.kind === "text") ? " and open survey answers" : ""} were coded inductively. The codebook settled at ${plural(ctx.codes.length, "code", "codes")}${ctx.themes.length ? `, and related codes were grouped into ${plural(ctx.themes.length, "theme", "themes")}` : ""}.`,
    );
  if (used.length && items.length) methods.push("The two strands were then compared code by code, noting where a topic appeared in both the conversations and the survey and where it appeared in only one.");
  out.push(methods.join(" ") || "No data has been collected or coded in this project yet, so there is nothing to analyse.");

  out.push("## Results");

  // ── Sample ──
  if (ctx.respondents || ctx.conversations) {
    out.push("### Sample");
    const s: string[] = [];
    if (ctx.respondents) {
      if (ctx.started > ctx.respondents) s.push(`Of the ${ctx.started} people who started the survey, ${ctx.respondents} completed it (${pc((ctx.respondents / ctx.started) * 100)}).`);
      else s.push(`${spell(ctx.respondents)} respondents completed the survey.`);
    }
    demo.slice(0, 3).forEach((it, i) => {
      const cats = [...it.categories].sort((a, b) => b.count - a.count);
      if (cats[0]) s.push(pick([`The largest group for ${q(it.question)} was "${cats[0].label}" (${pc(cats[0].percent)})${cats[1] ? `, then "${cats[1].label}" (${pc(cats[1].percent)})` : ""}.`, `Most respondents answered ${q(it.question)} with "${cats[0].label}" (${pc(cats[0].percent)}).`], i));
    });
    if (ctx.conversations) {
      const people = Math.max(0, ...used.map((c) => c.qualPeople));
      s.push(`In addition, ${plural(ctx.conversations, "conversation was", "conversations were")} transcribed and coded${people ? `, involving at least ${plural(people, "participant", "participants")}` : ""}.`);
    }
    out.push(s.join(" "));
  }

  // ── Survey results ──
  if (substantive.length) {
    out.push("### Survey results");
    const scale = substantive.filter((it) => it.kind === "scale" && it.mean !== null && it.sd !== null);
    if (scale.length >= 3) {
      out.push(`Table 1 summarises the numeric, rating and agreement items.`);
      out.push(["**Table 1.** Descriptive statistics for numeric, rating and agreement items", "", "| Item | n | M | SD | Scale |", "| --- | --- | --- | --- | --- |", ...scale.slice(0, 12).map((it) => `| ${it.question.replace(/\|/g, "/")} | ${it.n} | ${f2(it.mean!)} | ${f2(it.sd!)} | ${it.bounds ? `${it.bounds[0]} to ${it.bounds[1]}` : "count"} |`)].join("\n"));
    }
    const paras: string[] = [];
    substantive.slice(0, 10).forEach((it, i) => {
      const t = describeItem(it, i);
      if (t) paras.push(t);
    });
    // Two or three sentences per paragraph reads better than one long block.
    for (let i = 0; i < paras.length; i += 3) out.push(paras.slice(i, i + 3).join(" "));
  }

  // ── Qualitative findings ──
  if (used.length) {
    out.push("### Qualitative findings");
    const top = used.slice(0, 3);
    out.push(`Coding produced ${plural(ctx.codes.length, "code", "codes")}, ${used.length} of them applied to the data. The most frequent were ${listing(top.map(codeWeight))}.`);
    ctx.themes.forEach((t, ti) => {
      const codes = used.filter((c) => t.codes.includes(c.name));
      if (!codes.length && !t.description) return;
      out.push(`#### ${t.name}`);
      const parts: string[] = [];
      if (t.description?.trim()) parts.push(t.description.trim());
      if (codes.length) {
        const people = Math.max(0, ...codes.map((c) => c.qualPeople));
        parts.push(`The theme draws on ${listing(codes.map(codeWeight))}${people ? `, raised by ${plural(people, "interviewee", "interviewees")}` : ""}.`);
      }
      out.push(parts.join(" "));
      const lead = codes.find((c) => c.quotes.length);
      const line = lead ? quoteLine(lead, ti, "conversation") ?? quoteLine(lead, ti) : null;
      if (line) out.push(line);
    });
    const loose = used.filter((c) => !themed.has(c.name) && c.qualPassages + c.quantPassages >= 2).slice(0, 4);
    if (loose.length) out.push(`Outside the themes, ${listing(loose.map(codeWeight))} also recurred.`);
  }

  // ── Integration ──
  if (used.length && ctx.respondents && ctx.conversations) {
    out.push("### Comparing the interviews and the survey");
    const both = used.filter((c) => c.qualPassages && c.quantPassages);
    const qualOnly = used.filter((c) => c.qualPassages && !c.quantPassages);
    const quantOnly = used.filter((c) => !c.qualPassages && c.quantPassages);
    const s: string[] = [];
    if (both.length) {
      const lead = both[0]!;
      s.push(`${spell(both.length)} ${both.length === 1 ? "code appeared" : "codes appeared"} in both strands (${listing(both.map((c) => c.name))}). ${lead.name}, for instance, came up in ${plural(lead.qualPassages, "interview passage", "interview passages")} and in the open answers of ${pc(lead.quantShare * 100)} of survey respondents, so the survey gives a rough sense of how widespread a concern from the interviews is.`);
    }
    if (qualOnly.length) s.push(`${listing(qualOnly.map((c) => c.name))} ${qualOnly.length === 1 ? "was" : "were"} raised only in the interviews; the survey cannot say how common ${qualOnly.length === 1 ? "it is" : "they are"}.`);
    if (quantOnly.length) s.push(`${listing(quantOnly.map((c) => c.name))} appeared only in survey answers, without the context an interview would give.`);
    out.push(s.join(" "));
  }

  // ── Hypotheses ──
  if (ctx.statements.length) {
    out.push("### Hypotheses");
    testable.forEach(({ s, item }, i) => {
      const label = s.kind === "hypothesis" ? `H${i + 1}` : s.kind === "proposition" ? `P${i + 1}` : `A${i + 1}`;
      const codes = relevantCodes(s.text, ctx.codes, 2);
      const qualN = codes.reduce((n, c) => n + c.qualPassages, 0);
      const parts: string[] = [`**${label}** stated that ${s.text.charAt(0).toLowerCase()}${s.text.slice(1).replace(/[.]$/, "")}.`];
      const r = item ? midpointTest(item) : null;
      let survey: "for" | "against" | "none" | "untested" = "untested";
      if (item && r) {
        parts.push(`The closest survey item was ${q(item.question)} (M = ${f2(item.mean!)}, SD = ${f2(item.sd!)}, n = ${item.n}). Compared with the scale midpoint of ${r.mid}, ${testText(r)}.`);
        survey = r.p < 0.05 ? (r.t > 0 ? "for" : "against") : "none";
      }
      if (qualN) parts.push(`In the qualitative data, ${listing(codes.map((c) => c.name))} ${codes.length === 1 ? "was" : "were"} coded in ${plural(qualN, "interview passage", "interview passages")}${codes.find((c) => c.quotes.length) ? `, for example: ${inQuote(codes.find((c) => c.quotes.length)!.quotes[0]!.text)}` : ""}.`);
      const verdict =
        survey === "for" && qualN
          ? `${label} was supported by both strands.`
          : survey === "for"
            ? `${label} was supported by the survey, though the interviews said little about it.`
            : survey === "against"
              ? `${label} was not supported: the mean fell significantly below the midpoint.`
              : survey === "none"
                ? `The survey difference was not statistically significant, so ${label} was not supported at α = .05${qualN ? ", although the interviews give it some weight" : ""}.`
                : qualN
                  ? `The survey did not measure this directly, so ${label} rests on the qualitative evidence alone and should be read as tentative.`
                  : `None of the collected data addresses ${label}, so it remains untested.`;
      parts.push(verdict);
      out.push(parts.join(" "));
    });
  }

  // ── Research questions ──
  if (ctx.questions.length) {
    out.push("### Research questions");
    ctx.questions.forEach((rq, i) => {
      const codes = relevantCodes(rq.text, ctx.codes, 3);
      const want = new Set(keywords(rq.text).filter((w) => !GENERIC.has(w) && !common.has(w)));
      const its = substantive.filter((it) => keywords(it.question).some((w) => want.has(w))).slice(0, 2);
      const parts = [`**RQ${i + 1}** asked: ${rq.text.trim()}`];
      if (codes.length) {
        const people = Math.max(0, ...codes.map((c) => c.qualPeople));
        parts.push(`The interviews answer it mainly through ${listing(codes.map((c) => c.name))}${people ? `, which ${plural(people, "participant", "participants")} talked about` : ""}.${codes[0]!.definition ? ` ${codes[0]!.name} covers ${codes[0]!.definition.charAt(0).toLowerCase()}${codes[0]!.definition.slice(1).replace(/[.]$/, "")}.` : ""}`);
      }
      for (const it of its) {
        const t = describeItem(it, i + 1);
        if (t) parts.push(`On the survey side, ${t.charAt(0).toLowerCase()}${t.slice(1)}`);
      }
      if (!codes.length && !its.length) parts.push("None of the coded material or survey items speaks to this question yet; it may need more data or codes that use its terms.");
      out.push(parts.join(" "));
    });
  }

  // ── Limitations ──
  const lim: string[] = [];
  if (ctx.respondents && ctx.respondents < 100) lim.push(`The survey sample (n = ${ctx.respondents}) is small, so percentages and means have wide margins of error.`);
  if (ctx.conversations && ctx.conversations < 10) lim.push(`With ${plural(ctx.conversations, "conversation", "conversations")}, the qualitative findings describe the range of experiences, not their frequency.`);
  if (testable.some((x) => x.item)) lim.push("The hypothesis tests rely on single items rather than validated scales.");
  if (lim.length) {
    out.push("### Limitations");
    out.push(lim.join(" "));
  }

  return { title: `${ctx.project.name}: data analysis and results`, body: cleanProse(out.join("\n\n")) };
}
