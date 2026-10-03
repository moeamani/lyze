import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { clientKey, rateLimit } from "@/server/rate-limit";
import { isAppError } from "@/server/services/errors";
import { signConsent } from "@/server/services/guides";

/** A participant signs their consent form (public, rate-limited). */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/consent/[token]">) {
  const limit = rateLimit(`consent:${clientKey(request.headers)}`, 20, 10 * 60_000);
  if (!limit.ok) return NextResponse.json({ error: "rateLimited" }, { status: 429, headers: { "retry-after": String(limit.retryAfter) } });
  const { token } = await ctx.params;
  try {
    await signConsent(token, await request.json());
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) return NextResponse.json({ error: "invalid" }, { status: 400 });
    if (isAppError(error)) {
      const status = error.code === "notFound" ? 404 : error.code === "conflict" ? 409 : 400;
      return NextResponse.json({ error: error.code }, { status });
    }
    throw error;
  }
}
