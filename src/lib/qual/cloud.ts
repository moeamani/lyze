/**
 * Deterministic word-cloud layout: biggest words first, each placed on an Archimedean spiral at
 * the first spot that doesn't overlap (bounding boxes with estimated glyph widths). Horizontal
 * words only — easier to read, and no font measuring needed on the server.
 */
export type CloudWord = { word: string; count: number };
export type PlacedWord = CloudWord & { x: number; y: number; size: number; width: number; height: number; rank: number };

export function layoutCloud(words: readonly CloudWord[], opts: { width: number; height: number; minSize?: number; maxSize?: number; padding?: number }): PlacedWord[] {
  const { width, height, minSize = 12, maxSize = 44, padding = 3 } = opts;
  const sorted = [...words].sort((a, b) => b.count - a.count || a.word.localeCompare(b.word));
  if (!sorted.length) return [];
  const max = sorted[0]!.count;
  const min = sorted.at(-1)!.count;
  const placed: PlacedWord[] = [];
  const overlaps = (x: number, y: number, w: number, h: number) =>
    placed.some((p) => x < p.x + p.width / 2 + padding + w / 2 && x + w / 2 + padding > p.x - p.width / 2 && Math.abs(y - p.y) < (p.height + h) / 2 + padding / 2);

  sorted.forEach((word, rank) => {
    const t = max === min ? 1 : Math.sqrt((word.count - min) / (max - min));
    const size = Math.round(minSize + t * (maxSize - minSize));
    const w = word.word.length * size * 0.58 + 4;
    const h = size * 1.05;
    for (let step = 0; step < 2500; step++) {
      const angle = step * 0.35;
      const radius = 1.6 * angle;
      const x = width / 2 + radius * Math.cos(angle) * 1.6;
      const y = height / 2 + radius * Math.sin(angle);
      if (x - w / 2 < 0 || x + w / 2 > width || y - h / 2 < 0 || y + h / 2 > height) {
        if (radius > Math.max(width, height)) break;
        continue;
      }
      if (!overlaps(x, y, w, h)) {
        placed.push({ ...word, x: Math.round(x), y: Math.round(y), size, width: w, height: h, rank });
        return;
      }
    }
  });
  return placed;
}
