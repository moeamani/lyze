/** Codebook helpers: a flat list of codes with parent links, shown and validated as a tree. */

export const CODE_COLORS = ["1", "2", "3", "4", "5", "6", "7", "8"] as const;
export type CodeColor = (typeof CODE_COLORS)[number];

/** Same order as the validated categorical palette (--series-1…8, light mode values). */
export const CODE_COLOR_HEX: Record<CodeColor, string> = {
  "1": "#2a78d6",
  "2": "#eb6834",
  "3": "#1baf7a",
  "4": "#eda100",
  "5": "#e87ba4",
  "6": "#008300",
  "7": "#4a3aa7",
  "8": "#e34948",
};

export const codeColorVar = (color: string) => `var(--series-${CODE_COLORS.includes(color as CodeColor) ? color : "1"})`;

export type CodeLike = { id: string; parentId: string | null; name: string; position: number };
export type TreeRow<T extends CodeLike> = T & { depth: number; childCount: number; path: string[] };

/** Depth-first order (siblings by position, then name), with depth for indentation. */
export function flattenTree<T extends CodeLike>(codes: readonly T[]): TreeRow<T>[] {
  const ids = new Set(codes.map((c) => c.id));
  const children = new Map<string | null, T[]>();
  for (const c of codes) {
    // Orphans (parent deleted elsewhere) are shown at the top level.
    const parent = c.parentId && ids.has(c.parentId) ? c.parentId : null;
    children.set(parent, [...(children.get(parent) ?? []), c]);
  }
  for (const list of children.values()) list.sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
  const out: TreeRow<T>[] = [];
  const visit = (parent: string | null, depth: number, path: string[], seen: Set<string>) => {
    for (const c of children.get(parent) ?? []) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      out.push({ ...c, depth, childCount: children.get(c.id)?.length ?? 0, path: [...path, c.name] });
      visit(c.id, depth + 1, [...path, c.name], seen);
    }
  };
  visit(null, 0, [], new Set());
  return out;
}

/** The code and everything nested under it. */
export function subtreeIds(codes: readonly CodeLike[], id: string): Set<string> {
  const out = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const c of codes) {
      if (c.parentId && out.has(c.parentId) && !out.has(c.id)) {
        out.add(c.id);
        grew = true;
      }
    }
  }
  return out;
}

/** A code can't be moved under itself or one of its own children. */
export function canMoveUnder(codes: readonly CodeLike[], id: string, parentId: string | null): boolean {
  if (parentId === null) return true;
  return !subtreeIds(codes, id).has(parentId);
}

export const MAX_DEPTH = 4;

export function depthOf(codes: readonly CodeLike[], id: string | null): number {
  let depth = 0;
  const byId = new Map(codes.map((c) => [c.id, c]));
  let cur = id ? byId.get(id) : undefined;
  while (cur && depth < 50) {
    depth++;
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return depth;
}

/** Sibling names must be unique (case-insensitive) so a code path is unambiguous. */
export function nameTaken(codes: readonly CodeLike[], name: string, parentId: string | null, exceptId?: string): boolean {
  const n = name.trim().toLowerCase();
  return codes.some((c) => c.id !== exceptId && (c.parentId ?? null) === (parentId ?? null) && c.name.trim().toLowerCase() === n);
}
