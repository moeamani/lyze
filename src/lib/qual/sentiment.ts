import { tokenize } from "@/lib/analysis/text";

/**
 * Lexicon-based sentiment for short English answers (AFINN-style word scores from −3 to +3, with
 * negation and intensifiers). A quick overview, not a classifier: always show examples next to it.
 */
const LEXICON: Record<string, number> = Object.fromEntries(
  `love:3 loved:3 lovely:3 amazing:3 excellent:3 perfect:3 wonderful:3 fantastic:3 delicious:3 best:3 brilliant:3 joy:3 favourite:2 favorite:2
great:3 awesome:3 enjoy:2 enjoyed:2 enjoying:2 enjoyable:2 happy:2 happier:2 glad:2 nice:2 good:2 better:2 pleasant:2 calm:2 peace:2 peaceful:2
relaxing:2 relaxed:2 cozy:2 cosy:2 comfortable:2 fun:2 tasty:2 fresh:1 easy:1 easier:1 helpful:2 helps:1 help:1 like:1 liked:1 likes:1 fine:1 ok:1 okay:1
quiet:1 warm:1 treat:2 ritual:1 smooth:1 clear:1 fast:1 quick:1 simple:1 worth:2 recommend:2 thanks:2 thank:2 grateful:2 satisfied:2 savor:2 savour:2
energy:1 focus:1 focused:1 motivated:2 ready:1 fresh:1 beautiful:3 kind:2 friendly:2 welcome:2 safe:1 trust:2 reliable:2 smile:2 laugh:2 cheerful:2
bad:-2 worse:-2 worst:-3 awful:-3 terrible:-3 horrible:-3 hate:-3 hated:-3 disgusting:-3 bitter:-1 boring:-2 bored:-2 tired:-2 exhausted:-2
stress:-2 stressed:-2 stressful:-2 anxious:-2 anxiety:-2 jittery:-2 nervous:-2 headache:-2 headaches:-2 sick:-2 pain:-2 hurt:-2 sad:-2 angry:-3
annoying:-2 annoyed:-2 frustrating:-2 frustrated:-2 frustrates:-2 problem:-1 problems:-1 issue:-1 issues:-1 difficult:-1 hard:-1 hardest:-2
expensive:-1 pricey:-1 slow:-1 late:-1 rushed:-1 rushing:-1 rush:-1 chaotic:-2 chaos:-2 mess:-2 messy:-1 noisy:-1 loud:-1 crowded:-1
worried:-2 worry:-2 regret:-2 regretted:-2 guilty:-2 addicted:-2 dependent:-1 crash:-2 broken:-2 fail:-2 failed:-2 wrong:-2 confusing:-2 confused:-2
miss:-1 lonely:-2 overwhelmed:-2 cold:-1 weak:-1 burnt:-2 burned:-2 sour:-1 poor:-2 unfortunately:-2 disappointed:-2 disappointing:-2 never:-1 rough:-2 embarrassing:-2 embarrassingly:-1 culprit:-1 terrible:-3`
    .split(/\s+/)
    .filter(Boolean)
    .map((pair) => {
      const [w, s] = pair.split(":");
      return [w!, Number(s)];
    }),
);

const NEGATORS = new Set(["not", "no", "never", "without", "hardly", "isn't", "wasn't", "don't", "doesn't", "didn't", "can't", "cannot", "won't", "aren't", "nothing"]);
const BOOSTERS: Record<string, number> = { very: 1.5, really: 1.5, so: 1.3, extremely: 2, super: 1.5, quite: 1.2, totally: 1.5, absolutely: 1.8, slightly: 0.6, bit: 0.7 };

export type Sentiment = { score: number; comparative: number; label: "positive" | "neutral" | "negative"; positive: string[]; negative: string[] };

export function sentiment(text: string): Sentiment {
  const words = tokenize(text);
  let score = 0;
  const positive: string[] = [];
  const negative: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i]!;
    const base = LEXICON[w];
    if (base === undefined) continue;
    let value = base;
    const prev = words.slice(Math.max(0, i - 3), i);
    if (prev.some((p) => NEGATORS.has(p) || p.endsWith("n't"))) value = -value * 0.75;
    const boost = BOOSTERS[words[i - 1] ?? ""];
    if (boost) value *= boost;
    score += value;
    (value >= 0 ? positive : negative).push(w);
  }
  const comparative = words.length ? score / Math.sqrt(words.length) : 0;
  const label = comparative > 0.25 ? "positive" : comparative < -0.25 ? "negative" : "neutral";
  return { score: Math.round(score * 100) / 100, comparative: Math.round(comparative * 1000) / 1000, label, positive, negative };
}

export function sentimentOverview(texts: readonly string[]) {
  const rows = texts.map((text, index) => ({ index, text, ...sentiment(text) }));
  const count = (l: Sentiment["label"]) => rows.filter((r) => r.label === l).length;
  const byScore = [...rows].sort((a, b) => b.comparative - a.comparative);
  return {
    total: rows.length,
    positive: count("positive"),
    neutral: count("neutral"),
    negative: count("negative"),
    mostPositive: byScore.filter((r) => r.label === "positive").slice(0, 3),
    mostNegative: byScore.reverse().filter((r) => r.label === "negative").slice(0, 3),
  };
}
