import { keywords } from "@/lib/qual/nlp";
import type { WriteupContext } from "./context";
import { cleanProse } from "./style";

type Code = WriteupContext["codes"][number];

const pct = (x: number) => `${Math.round(x * 100)}%`;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
/** Pick a sentence shape by position, so a long draft doesn't repeat the same frame. */
const pick = <T,>(options: readonly T[], i: number) => options[i % options.length]!;

/**
 * How strongly a piece of data speaks to a question or statement: shared keyword stems, weighted
 * toward the code's name and definition over its quotes.
 */
export function relevance(target: string, code: Pick<Code, "name" | "path" | "definition" | "quotes">, ignore: ReadonlySet<string> = new Set()): number {
  const want = new Set(keywords(target).filter((w) => !ignore.has(w)));
  if (!want.size) return 0;
  const hits = (text: string, weight: number) => keywords(text).reduce((s, w) => s + (want.has(w) ? weight : 0), 0);
  return hits(code.path.join(" "), 3) + hits(code.definition ?? "", 2) + code.quotes.reduce((s, q) => s + hits(q.text, 1), 0) * 0.5;
}

/** Words used by many codes (the project's topic, like "coffee" or "people") say nothing about fit. */
/** Words every research question uses; they never decide which code fits. */
const GENERIC = new Set(["people", "person", "participant", "respondent", "someone", "thing", "way", "make", "get", "use", "help", "often", "much", "many", "main", "role", "play", "day"].map((w) => keywords(w)[0] ?? w));

function commonWords(codes: readonly Code[]): Set<string> {
  const df = new Map<string, number>();
  for (const c of codes) for (const w of new Set(keywords(`${c.name} ${c.definition ?? ""}`))) df.set(w, (df.get(w) ?? 0) + 1);
  const limit = Math.max(2, codes.length * 0.34);
  return new Set([...GENERIC, ...[...df].filter(([, n]) => n >= limit).map(([w]) => w)]);
}

export function relevantCodes(target: string, codes: readonly Code[], max = 3): Code[] {
  const ignore = commonWords(codes);
  const scored = codes.map((c) => ({ c, score: relevance(target, c, ignore) })).filter((x) => x.score >= 2 && x.c.qualPassages + x.c.quantPassages > 0);
  const best = Math.max(0, ...scored.map((x) => x.score));
  return scored
    // Keep codes that fit nearly as well as the best one; weak tag-alongs go.
    .filter((x) => x.score >= best * 0.5)
    .sort((a, b) => b.score - a.score || b.c.qualPassages + b.c.quantPassages - (a.c.qualPassages + a.c.quantPassages))
    .slice(0, max)
    .map((x) => x.c);
}

function relevantSurvey(target: string, survey: WriteupContext["survey"]) {
  const want = new Set(keywords(target));
  return survey
    .map((s) => ({ s, score: keywords(s.question).filter((w) => want.has(w)).length }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 1)
    .map((x) => x.s);
}

function weight(c: Code, i: number): string {
  const conv = c.qualPassages
    ? pick(
        [
          `**${c.name}** comes up ${plural(c.qualPassages, "time", "times")} in conversations, from ${plural(c.qualPeople, "person", "people")}`,
          `In the interviews and notes, ${plural(c.qualPeople, "person", "people")} talked about ${c.name.toLowerCase()} (${plural(c.qualPassages, "coded passage", "coded passages")})`,
          `${c.name} has ${plural(c.qualPassages, "coded passage", "coded passages")} across ${plural(c.qualPeople, "conversation partner", "conversation partners")}`,
        ],
        i,
      )
    : null;
  const surv = c.quantPassages ? `${pct(c.quantShare)} of survey respondents raised it in their own words` : null;
  if (conv && surv) return `${conv}, and ${surv}.`;
  if (conv) return `${conv}. Nobody mentioned it in an open survey answer.`;
  return `${c.name} shows up only in the survey: ${surv}.`;
}

function agreement(c: Code, i: number): string {
  if (c.qualPassages && c.quantPassages)
    return pick(["Both kinds of data point the same way here.", "The survey and the conversations agree on this one.", "Here the interviews and the survey line up."], i);
  if (c.qualPassages) return "Since it only appears in conversations, the survey can't tell us how common it is.";
  return "No one discussed it at length in an interview, so we know how often it comes up but not much about why.";
}

function quoteLine(c: Code): string | null {
  const q = c.quotes.find((x) => x.source === "conversation") ?? c.quotes[0];
  if (!q) return null;
  return `> "${q.text.trim()}"${q.who ? ` (${q.who})` : ""}`;
}

/** The built-in, deterministic write-up. Every sentence is built from counts and quotes in the context. */
export function composeWriteup(ctx: WriteupContext, date = new Date()): { title: string; body: string } {
  const title = `${ctx.project.name}: written analysis`;
  const out: string[] = [];
  out.push(`_Draft by the built-in assistant, ${date.toISOString().slice(0, 10)}. It is assembled from the codes, quotes and survey results in this project. Check each claim against the sources before you quote it anywhere._`);

  out.push("## What the project set out to learn");
  if (ctx.aim.trim()) out.push(ctx.aim.trim());
  if (ctx.questions.length) out.push(ctx.questions.map((q, i) => `${i + 1}. ${q.text}`).join("\n"));
  if (!ctx.aim.trim() && !ctx.questions.length) out.push("The brief has no aim or research questions yet, so this draft describes the data without a frame. Add them under Brief and generate again.");
  if (ctx.proposal) out.push(ctx.proposal.text ? `The uploaded proposal (${ctx.proposal.name}) was read for context.` : `A proposal is attached (${ctx.proposal.name}), but its text couldn't be read by the built-in assistant.`);

  out.push("## The data");
  const used = ctx.codes.filter((c) => c.qualPassages + c.quantPassages > 0);
  const studyList = ctx.studies.map((s) => s.name).join(", ");
  out.push(
    `This draft uses ${plural(ctx.conversations, "coded conversation", "coded conversations")} and ${plural(ctx.respondents, "completed survey response", "completed survey responses")} from ${plural(ctx.studies.length, "study", "studies")} (${studyList}). The codebook has ${plural(ctx.codes.length, "code", "codes")}, ${used.length} of them applied so far.`,
  );

  if (ctx.questions.length) {
    out.push("## Findings by research question");
    ctx.questions.forEach((q, qi) => {
      out.push(`### ${qi + 1}. ${q.text}`);
      const codes = relevantCodes(q.text, ctx.codes);
      const survey = relevantSurvey(q.text, ctx.survey);
      if (!codes.length && !survey.length) {
        out.push("None of the coded material speaks to this question directly yet. Either the codes use different words than the question, or this part of the data hasn't been coded.");
        return;
      }
      codes.forEach((c, i) => {
        out.push(`${weight(c, qi + i)} ${agreement(c, qi + i)}`);
        const quote = quoteLine(c);
        if (quote) out.push(quote);
      });
      for (const s of survey) out.push(`In the survey, "${s.question}": ${s.summary}.`);
    });
  } else if (used.length) {
    out.push("## What stands out");
    used
      .sort((a, b) => b.qualPassages + b.quantPassages - (a.qualPassages + a.quantPassages))
      .slice(0, 4)
      .forEach((c, i) => {
        out.push(`${weight(c, i)} ${agreement(c, i)}`);
        const quote = quoteLine(c);
        if (quote) out.push(quote);
      });
  }

  if (ctx.statements.length) {
    out.push("## Statements and hypotheses");
    ctx.statements.forEach((s, i) => {
      const codes = relevantCodes(s.text, ctx.codes, 2);
      const total = codes.reduce((n, c) => n + c.qualPassages + c.quantPassages, 0);
      const both = codes.some((c) => c.qualPassages && c.quantPassages);
      const label = s.kind === "hypothesis" ? `H${i + 1}` : s.kind === "proposition" ? `P${i + 1}` : `A${i + 1}`;
      let verdict: string;
      if (!codes.length) verdict = "The data collected so far doesn't test this. Nothing coded speaks to it.";
      else if (both && total >= 6)
        verdict = `The data is broadly consistent with it. ${codes.map((c) => c.name).join(" and ")} ${codes.length === 1 ? "appears" : "appear"} in both the conversations and the survey (${plural(total, "passage", "passages")} in all). This is support, not proof: the coding is interpretive and the sample is small.`;
      else verdict = `There is some support, but it is thin: ${plural(total, "passage", "passages")} under ${codes.map((c) => c.name).join(" and ")}${both ? "" : ", from one kind of data only"}.`;
      out.push(`**${label}.** ${s.text}\n\n${verdict}`);
    });
  }

  if (ctx.themes.length) {
    out.push("## Themes");
    for (const t of ctx.themes) {
      const desc = t.description?.trim() ? ` ${t.description.trim()}` : "";
      out.push(`**${t.name}.**${desc} Codes: ${t.codes.length ? t.codes.join(", ") : "none yet"}.`);
    }
  }

  out.push("## What this draft can't tell you");
  const limits = [
    `The built-in assistant links questions to codes by shared words. A code that answers a question in different words will be missed, so read the codebook alongside this.`,
    ctx.respondents && ctx.respondents < 100 ? `With ${ctx.respondents} survey responses, percentages move a lot with a few answers.` : null,
    ctx.conversations && ctx.conversations < 8 ? `${plural(ctx.conversations, "conversation", "conversations")} is enough to find themes, not to say how widespread they are.` : null,
  ].filter(Boolean);
  out.push(limits.join(" "));

  return { title, body: cleanProse(out.join("\n\n")) };
}
