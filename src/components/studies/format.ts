/** "2 min 05 s" style duration from milliseconds. */
export function durationParts(ms: number | null | undefined): { m: number; s: number } | null {
  if (ms === null || ms === undefined) return null;
  const total = Math.round(ms / 1000);
  return { m: Math.floor(total / 60), s: total % 60 };
}
