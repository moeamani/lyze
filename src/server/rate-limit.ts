import "server-only";
import { createHash } from "node:crypto";

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

/**
 * Fixed-window rate limiter kept in process memory. Good enough for a single instance; put a shared
 * store (e.g. Redis) behind the same function when running several.
 */
export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    if (buckets.size > 50_000) sweep(now);
    return { ok: true, retryAfter: 0 };
  }
  bucket.count++;
  return bucket.count > limit ? { ok: false, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) } : { ok: true, retryAfter: 0 };
}

function sweep(now: number) {
  for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
}

/** Client IP from proxy headers, hashed so raw addresses are never stored or logged. */
export function clientKey(headers: Headers): string {
  const ip = headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "local";
  return createHash("sha256").update(`${process.env.AUTH_SECRET ?? "lyze"}:${ip}`).digest("hex").slice(0, 32);
}
