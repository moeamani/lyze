import { STOPWORDS, tokenize } from "@/lib/analysis/text";

/**
 * Small, deterministic text tools used by the built-in (mock) AI assistant: keyword stems,
 * TF-IDF, k-means clustering of short answers and extractive summaries. No network, no model.
 */

/** Very light stemming so "habits"/"habit" and "rushing"/"rush" meet. */
export function stem(word: string): string {
  let w = word.toLowerCase();
  if (w.length > 5 && w.endsWith("ing")) {
    w = w.slice(0, -3);
    // "cutting" → "cut", "shopping" → "shop"
    if (/([bdgmnprt])\1$/.test(w)) w = w.slice(0, -1);
  }
  else if (w.length > 4 && w.endsWith("ies")) w = `${w.slice(0, -3)}y`;
  else if (w.length > 4 && w.endsWith("es") && /(sh|ch|x|ss)es$/.test(w)) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) w = w.slice(0, -1);
  else if (w.length > 4 && w.endsWith("ed")) w = w.slice(0, -2);
  return w;
}

export function keywords(text: string): string[] {
  return tokenize(text)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w) && !/^\d+$/.test(w))
    .map(stem);
}

type Vector = Map<string, number>;

export function tfidf(docs: readonly string[][]): Vector[] {
  const df = new Map<string, number>();
  for (const d of docs) for (const t of new Set(d)) df.set(t, (df.get(t) ?? 0) + 1);
  const n = docs.length;
  return docs.map((d) => {
    const tf = new Map<string, number>();
    for (const t of d) tf.set(t, (tf.get(t) ?? 0) + 1);
    const v: Vector = new Map();
    let norm = 0;
    for (const [t, c] of tf) {
      const w = (1 + Math.log(c)) * Math.log(1 + n / (df.get(t) ?? 1));
      v.set(t, w);
      norm += w * w;
    }
    norm = Math.sqrt(norm) || 1;
    for (const [t, w] of v) v.set(t, w / norm);
    return v;
  });
}

function cosine(a: Vector, b: Vector): number {
  let s = 0;
  const [small, big] = a.size < b.size ? [a, b] : [b, a];
  for (const [t, w] of small) s += w * (big.get(t) ?? 0);
  return s;
}

function mean(vectors: Vector[]): Vector {
  const out: Vector = new Map();
  for (const v of vectors) for (const [t, w] of v) out.set(t, (out.get(t) ?? 0) + w / vectors.length);
  let norm = 0;
  for (const w of out.values()) norm += w * w;
  norm = Math.sqrt(norm) || 1;
  for (const [t, w] of out) out.set(t, w / norm);
  return out;
}

export type Cluster = { label: string; terms: string[]; members: number[]; representative: number };

/**
 * Group short texts by shared vocabulary (spherical k-means, farthest-point initialisation so
 * results are stable). Texts with no keywords are left out. k defaults to ~√(n/2), 2–8.
 */
export function clusterTexts(texts: readonly string[], k?: number): Cluster[] {
  const tokens = texts.map(keywords);
  const usable = tokens.map((t, i) => ({ t, i })).filter((x) => x.t.length > 0);
  if (usable.length < 2) return usable.length ? [{ label: tokens[usable[0]!.i]![0] ?? "", terms: [], members: [usable[0]!.i], representative: usable[0]!.i }] : [];
  const vectors = tfidf(usable.map((u) => u.t));
  const kk = Math.max(1, Math.min(k ?? Math.round(Math.sqrt(usable.length / 2)), 8, usable.length));
  // Farthest-point init from the densest text.
  const centers: Vector[] = [];
  const density = vectors.map((v) => vectors.reduce((s, o) => s + cosine(v, o), 0));
  centers.push(vectors[density.indexOf(Math.max(...density))]!);
  while (centers.length < kk) {
    let best = -1;
    let bestDist = -1;
    vectors.forEach((v, i) => {
      const d = 1 - Math.max(...centers.map((c) => cosine(v, c)));
      if (d > bestDist) {
        bestDist = d;
        best = i;
      }
    });
    centers.push(vectors[best]!);
  }
  let assign = vectors.map(() => 0);
  for (let iter = 0; iter < 25; iter++) {
    const next = vectors.map((v) => {
      let bi = 0;
      let bs = -Infinity;
      centers.forEach((c, ci) => {
        const s = cosine(v, c);
        if (s > bs) {
          bs = s;
          bi = ci;
        }
      });
      return bi;
    });
    const changed = next.some((a, i) => a !== assign[i]);
    assign = next;
    centers.forEach((_, ci) => {
      const members = vectors.filter((_, i) => assign[i] === ci);
      if (members.length) centers[ci] = mean(members);
    });
    if (!changed && iter > 0) break;
  }
  const clusters: Cluster[] = [];
  centers.forEach((c, ci) => {
    const idx = usable.filter((_, i) => assign[i] === ci).map((u) => u.i);
    if (!idx.length) return;
    const terms = [...c.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 4).map(([t]) => t);
    let rep = idx[0]!;
    let repScore = -Infinity;
    for (const i of idx) {
      const s = cosine(vectors[usable.findIndex((u) => u.i === i)]!, c);
      if (s > repScore) {
        repScore = s;
        rep = i;
      }
    }
    clusters.push({ label: terms.slice(0, 2).join(" / "), terms, members: idx, representative: rep });
  });
  return clusters.sort((a, b) => b.members.length - a.members.length);
}

export function sentences(text: string): string[] {
  return (text.match(/[^.!?…]+[.!?…]+["”’)]?|[^.!?…]+$/g) ?? []).map((s) => s.trim()).filter(Boolean);
}

/** Pick the most informative sentences (TF-IDF across the document), kept in original order. */
export function extractiveSummary(paragraphs: readonly string[], max = 4): string[] {
  const all = paragraphs.flatMap((p) => sentences(p));
  const usable = all.filter((s) => keywords(s).length >= 3);
  if (usable.length <= max) return usable;
  const vectors = tfidf(usable.map(keywords));
  const centroid = mean(vectors);
  const scored = usable.map((s, i) => ({ s, i, score: cosine(vectors[i]!, centroid) }));
  const picked: typeof scored = [];
  for (const cand of [...scored].sort((a, b) => b.score - a.score)) {
    // Skip near-duplicates of what we already picked.
    if (picked.some((p) => cosine(vectors[p.i]!, vectors[cand.i]!) > 0.6)) continue;
    picked.push(cand);
    if (picked.length >= max) break;
  }
  return picked.sort((a, b) => a.i - b.i).map((p) => p.s);
}
