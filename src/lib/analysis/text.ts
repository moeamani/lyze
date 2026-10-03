/** Small multilingual-ish stopword list (English focus; extend per language later). */
const STOPWORDS = new Set(
  `a about above after again against all am an and any are aren't as at be because been before being below between both but by can can't cannot could couldn't did didn't do does doesn't doing don't down during each few for from further had hadn't has hasn't have haven't having he her here hers herself him himself his how i i'd i'll i'm i've if in into is isn't it it's its itself just let's me more most mustn't my myself no nor not of off on once only or other ought our ours ourselves out over own really same she should shouldn't so some such than that that's the their theirs them themselves then there there's these they they'd they'll they're they've this those through to too under until up us very was wasn't we we'd we'll we're we've were weren't what what's when where which while who whom why will with won't would wouldn't you you'd you'll you're you've your yours yourself yourselves also get got like lot lots much many one would make thing things im dont cant`.split(
    /\s+/,
  ),
);

export function tokenize(text: string): string[] {
  return (
    text
      .toLowerCase()
      .normalize("NFKC")
      // Keep letters (any script), digits, apostrophes and hyphens inside words.
      .match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []
  ).map((w) => w.replace(/’/g, "'").replace(/^'+|'+$/g, ""));
}

export type WordCount = { word: string; count: number; documents: number };

/** Most frequent meaningful words across answers (counts and in how many answers each appears). */
export function wordFrequencies(texts: readonly string[], limit = 40): WordCount[] {
  const counts = new Map<string, WordCount>();
  for (const text of texts) {
    const seen = new Set<string>();
    for (const w of tokenize(text)) {
      if (w.length < 3 || STOPWORDS.has(w) || /^\d+$/.test(w)) continue;
      const entry = counts.get(w) ?? { word: w, count: 0, documents: 0 };
      entry.count++;
      if (!seen.has(w)) {
        entry.documents++;
        seen.add(w);
      }
      counts.set(w, entry);
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || b.documents - a.documents || a.word.localeCompare(b.word)).slice(0, limit);
}
