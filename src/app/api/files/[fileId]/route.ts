import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/server/auth";
import { getFileForMember } from "@/server/services/responses";
import { isAppError } from "@/server/services/errors";
import { storageFor } from "@/server/storage";

/** Download a response file. Workspace members only. */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/files/[fileId]">) {
  const user = await currentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const { fileId } = await ctx.params;
  try {
    const file = await getFileForMember(user.id, fileId);
    const object = await storageFor(file.storage).get(file.key);
    if (!object) return new NextResponse("Not found", { status: 404 });
    const inline = /^(image|audio|video)\//.test(file.mime) || file.mime === "application/pdf";
    const download = request.nextUrl.searchParams.get("download") === "1";
    return new NextResponse(object.body as BodyInit, {
      headers: {
        "content-type": file.mime,
        "content-length": String(object.size ?? file.size),
        "content-disposition": `${inline && !download ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
        "cache-control": "private, max-age=3600",
        "x-content-type-options": "nosniff",
        // Never let an uploaded file run scripts in our origin.
        "content-security-policy": "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox",
      },
    });
  } catch (error) {
    if (isAppError(error)) return new NextResponse("Not found", { status: 404 });
    throw error;
  }
}
