import type { SpeakerRole } from "./sessions";

/** Lowercase, no accents, single spaces: "Jesús " → "jesus". */
export function foldName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Edit distance with swaps of neighbours counted as one edit (Damerau–Levenshtein, optimal string alignment). */
export function editDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i]![j] = Math.min(d[i]![j]!, d[i - 2]![j - 2]! + 1);
    }
  }
  return d[a.length]![b.length]!;
}

/** Spellings of one person typed differently: "Sophia"/"Sofia", "Danielle"/"Daniell", "one of the teachers"/"One of the teachers". */
function sameName(a: string, b: string): boolean {
  const x = foldName(a);
  const y = foldName(b);
  if (x === y) return true;
  // Short names ("Amy", "Ron") differ by one letter too often to guess.
  if (Math.min(x.length, y.length) < 4 || x.includes(" ") || y.includes(" ")) return false;
  return editDistance(x, y) <= (Math.max(x.length, y.length) >= 6 ? 2 : 1);
}

/**
 * Suggest one display name per detected label, merging likely spelling variants into the most
 * frequent spelling. Returns label → name. A suggestion only: people confirm it before importing.
 */
export function suggestSpeakerNames(counts: Record<string, number>): Record<string, string> {
  const labels = Object.keys(counts).sort((a, b) => counts[b]! - counts[a]! || a.localeCompare(b));
  const canon: string[] = [];
  const out: Record<string, string> = {};
  for (const label of labels) {
    const match = canon.find((c) => sameName(label, c));
    if (match) out[label] = match;
    else {
      canon.push(label);
      out[label] = label;
    }
  }
  return out;
}

/** Labels that aren't one person: "Multiple people", "All the teachers", "One of the teachers", "Unknown". */
const GROUP_VOICE = /\b(multiple|several|everyone|everybody|all|group|crowd|unknown|inaudible|unidentified|one of|someone|somebody|audience|students|teachers|participants|people)\b/i;

/** A first guess at roles: the first speaker leads (interviewer), group voices are "other", the rest participants. */
export function suggestRoles(names: string[]): Record<string, SpeakerRole> {
  const roles: Record<string, SpeakerRole> = {};
  names.forEach((n, i) => {
    roles[n] = GROUP_VOICE.test(n) ? "other" : i === 0 ? "interviewer" : "participant";
  });
  return roles;
}
