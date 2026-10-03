import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/server/auth";
import { isAppError } from "@/server/services/errors";
import { sessionForMember } from "@/server/services/sessions";
import { buildIcs } from "@/lib/interviews/ics";
import { slugify } from "@/lib/slug";

/** Add a scheduled session to a calendar (.ics). */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/sessions/[sessionId]/calendar">) {
  const user = await currentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const { sessionId } = await ctx.params;
  try {
    const s = await sessionForMember(user.id, sessionId);
    if (!s.scheduledAt) return new NextResponse("Not scheduled", { status: 404 });
    const ics = buildIcs({
      uid: s.id,
      title: s.title,
      start: s.scheduledAt,
      durationMin: s.durationMin ?? 60,
      location: s.location,
      url: request.nextUrl.searchParams.get("from") ?? null,
    });
    return new NextResponse(ics, {
      headers: {
        "content-type": "text/calendar; charset=utf-8",
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`${slugify(s.title) || "session"}.ics`)}`,
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    if (isAppError(error)) return new NextResponse("Not found", { status: 404 });
    throw error;
  }
}
