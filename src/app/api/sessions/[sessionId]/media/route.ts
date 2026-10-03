import { NextResponse, after, type NextRequest } from "next/server";
import { currentUser } from "@/server/auth";
import { isAppError } from "@/server/services/errors";
import { attachMedia, mediaMaxBytes, runTranscription, sessionForMember } from "@/server/services/sessions";
import { claimUpload } from "@/server/storage/direct";
import { mediaTarget } from "@/server/services/upload-targets";

/**
 * Upload a session recording as the raw request body (audio/* or video/*), or, with direct uploads,
 * report one the browser already put in Blob storage (x-blob-pathname, empty body).
 * Headers: content-type, x-file-name (URI-encoded), x-duration-ms (from the browser's media element).
 * Transcription starts after the response is sent.
 */
/** Transcription runs after the response (`after`), within this time limit on serverless hosts. */
export const maxDuration = 300;

export async function POST(request: NextRequest, ctx: RouteContext<"/api/sessions/[sessionId]/media">) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // Same-origin only: a custom header plus an Origin check rule out cross-site uploads.
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== request.headers.get("host")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!request.headers.get("x-file-name")) return NextResponse.json({ error: "invalid" }, { status: 400 });

  const { sessionId } = await ctx.params;
  const max = mediaMaxBytes();
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > max) return NextResponse.json({ error: "fileSize", maxMb: Math.round(max / 1048576) }, { status: 413 });

  try {
    const session = await sessionForMember(user.id, sessionId, "content:edit");
    const blob = request.headers.get("x-blob-pathname");
    if (blob) {
      const stored = await claimUpload(safeDecode(blob), mediaTarget(session.workspaceId, session.id));
      const { transcriptId, fileId } = await attachMedia(user.id, session.workspaceId, session.studyId, session.id, {
        stored,
        mime: stored.mime,
        name: safeDecode(request.headers.get("x-file-name")!),
        durationMs: Number(request.headers.get("x-duration-ms")) || null,
      });
      after(() => runTranscription(transcriptId));
      return NextResponse.json({ ok: true, fileId, transcriptId });
    }
    const data = await readLimited(request, max);
    if (!data) return NextResponse.json({ error: "fileSize", maxMb: Math.round(max / 1048576) }, { status: 413 });
    const { transcriptId, fileId } = await attachMedia(user.id, session.workspaceId, session.studyId, session.id, {
      data,
      mime: request.headers.get("content-type") ?? "",
      name: safeDecode(request.headers.get("x-file-name")!),
      durationMs: Number(request.headers.get("x-duration-ms")) || null,
    });
    after(() => runTranscription(transcriptId));
    return NextResponse.json({ ok: true, fileId, transcriptId });
  } catch (error) {
    if (isAppError(error)) {
      const status = error.code === "notFound" ? 404 : error.code === "forbidden" ? 403 : 400;
      return NextResponse.json({ error: error.message === error.code ? error.code : error.message }, { status });
    }
    throw error;
  }
}

/** Read the body, giving up (null) as soon as it grows past `max` bytes. */
async function readLimited(request: NextRequest, max: number): Promise<Uint8Array | null> {
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

function safeDecode(v: string) {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}
