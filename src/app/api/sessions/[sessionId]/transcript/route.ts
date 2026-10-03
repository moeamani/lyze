import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/server/auth";
import { isAppError } from "@/server/services/errors";
import { getSessionDetail, sessionForMember } from "@/server/services/sessions";
import { transcriptToSrt, transcriptToText, transcriptToVtt } from "@/lib/interviews/transcript";
import { slugify } from "@/lib/slug";

const FORMATS = { txt: "text/plain", vtt: "text/vtt", srt: "application/x-subrip" } as const;

/** Download a transcript as plain text, WebVTT or SRT. Workspace members only. */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/sessions/[sessionId]/transcript">) {
  const user = await currentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const format = (request.nextUrl.searchParams.get("format") ?? "txt") as keyof typeof FORMATS;
  if (!(format in FORMATS)) return new NextResponse("Unknown format", { status: 400 });
  const { sessionId } = await ctx.params;
  try {
    const session = await sessionForMember(user.id, sessionId);
    const d = await getSessionDetail(session.workspaceId, session.studyId, session.id);
    if (!d.transcript || d.transcript.status !== "ready") return new NextResponse("No transcript yet", { status: 404 });
    const speakers = d.transcript.speakers;
    const header = `${d.session.title}${d.session.scheduledAt ? ` — ${d.session.scheduledAt.toISOString().slice(0, 10)}` : ""}`;
    const body = format === "vtt" ? transcriptToVtt(d.segments, speakers) : format === "srt" ? transcriptToSrt(d.segments, speakers) : transcriptToText(d.segments, speakers, header);
    const name = `${slugify(d.session.title) || "transcript"}.${format}`;
    return new NextResponse(format === "txt" ? `﻿${body}` : body, {
      headers: {
        "content-type": `${FORMATS[format]}; charset=utf-8`,
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    if (isAppError(error)) return new NextResponse("Not found", { status: 404 });
    throw error;
  }
}
