import { NextResponse, type NextRequest } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { currentUser } from "@/server/auth";
import { directUploadsEnabled } from "@/server/storage/direct";
import { uploadPurpose, uploadTarget } from "@/server/services/upload-targets";
import { isAppError } from "@/server/services/errors";
import { clientKey, rateLimit } from "@/server/rate-limit";

/**
 * Direct uploads to Vercel Blob.
 * - `{ type: "lyze.prepare", purpose }` → `{ direct, prefix }`: whether to upload directly, and where.
 * - Vercel Blob's own client-token requests (from `upload()` in the browser), with the purpose as
 *   the client payload. The token only allows paths under that prefix, these types and this size.
 */
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== request.headers.get("host")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!rateLimit(`uploads:${clientKey(request.headers)}`, 120, 60_000).ok) return NextResponse.json({ error: "rateLimited" }, { status: 429 });
  const body = (await request.json().catch(() => null)) as (HandleUploadBody & { purpose?: unknown }) | { type: "lyze.prepare"; purpose?: unknown } | null;
  if (!body) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const userId = (await currentUser())?.id ?? null;

  try {
    if (body.type === "lyze.prepare") {
      if (!directUploadsEnabled()) return NextResponse.json({ direct: false });
      const target = await uploadTarget(userId, uploadPurpose.parse(body.purpose));
      return NextResponse.json({ direct: true, prefix: target.prefix, maxBytes: target.maxBytes });
    }
    if (!directUploadsEnabled()) return NextResponse.json({ error: "invalid" }, { status: 400 });
    const result = await handleUpload({
      request,
      body: body as HandleUploadBody,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const target = await uploadTarget(userId, uploadPurpose.parse(JSON.parse(clientPayload ?? "null")));
        if (!pathname.startsWith(target.prefix) || pathname.includes("..")) throw new Error("Upload path not allowed");
        return {
          allowedContentTypes: target.contentTypes,
          maximumSizeInBytes: target.maxBytes,
          addRandomSuffix: true,
          validUntil: Date.now() + 60 * 60_000,
        };
      },
    });
    return NextResponse.json(result);
  } catch (error) {
    if (isAppError(error)) return NextResponse.json({ error: error.code }, { status: error.code === "unauthorized" ? 401 : error.code === "notFound" ? 404 : 403 });
    console.error(error);
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
}
