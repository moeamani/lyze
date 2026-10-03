const MAX_LENGTH = 40;

/** Turn any name into a lowercase, dash-separated, URL-safe slug. */
export function slugify(input: string): string {
  const slug = input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_LENGTH)
    .replace(/-+$/g, "");
  return slug || "workspace";
}

/**
 * Pick the first free slug: `base`, `base-2`, `base-3`, …
 * `taken` holds every existing slug that starts with `base`.
 */
export function uniqueSlug(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!used.has(candidate)) return candidate;
  }
}

export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;

export const RESERVED_SLUGS = new Set(["new", "settings", "api", "admin", "app", "dev", "onboarding"]);
