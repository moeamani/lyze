import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/server/auth";
import { getFileForMember } from "@/server/services/responses";
import { isAppError } from "@/server/services/errors";
import { storageFor, type ByteRange } from "@/server/storage";

/**
 * Download a stored file (response uploads, session recordings). Workspace members only.
 * Supports single byte ranges so audio and video can seek.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/files/[fileId]">) {
  const user = await currentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const { fileId } = await ctx.params;
  try {
    const file = await getFileForMember(user.id, fileId);
    const inline = /^(image|audio|video)\//.test(file.mime) || file.mime === "application/pdf";
    const download = request.nextUrl.searchParams.get("download") === "1";
    const headers: Record<string, string> = {
      "content-type": file.mime,
      "content-disposition": `${inline && !download ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      "cache-control": "private, max-age=3600",
      "accept-ranges": "bytes",
      "x-content-type-options": "nosniff",
      // Never let an uploaded file run scripts in our origin.
      "content-security-policy": "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox",
    };

    const rangeHeader = request.headers.get("range");
    const range = rangeHeader ? parseRange(rangeHeader, file.size) : undefined;
    if (range === null) {
      return new NextResponse(null, { status: 416, headers: { ...headers, "content-range": `bytes */${file.size}` } });
    }
    const object = await storageFor(file.storage).get(file.key, range);
    if (!object) return new NextResponse("Not found", { status: 404 });
    if (range) {
      return new NextResponse(object.body as BodyInit, {
        status: 206,
        headers: { ...headers, "content-range": `bytes ${range.start}-${range.end}/${file.size}`, "content-length": String(range.end - range.start + 1) },
      });
    }
    return new NextResponse(object.body as BodyInit, { headers: { ...headers, "content-length": String(object.size ?? file.size) } });
  } catch (error) {
    if (isAppError(error)) return new NextResponse("Not found", { status: 404 });
    throw error;
  }
}

/** `bytes=a-b`, `bytes=a-` or `bytes=-n`. Multiple ranges are served as the first one. Null = unsatisfiable. */
function parseRange(header: string, size: number): ByteRange | null | undefined {
  const m = header.match(/^bytes=(\d*)-(\d*)/);
  if (!m || (!m[1] && !m[2])) return undefined;
  let start: number;
  let end: number;
  if (!m[1]) {
    const suffix = Number(m[2]);
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
  }
  if (start >= size || start > end) return null;
  return { start, end };
}
