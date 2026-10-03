import "server-only";
import { del, head } from "@vercel/blob";
import { AppError } from "@/server/services/errors";

/**
 * Direct uploads: the browser sends big files (recordings, attachments, proposals) straight to
 * Vercel Blob, because serverless functions only accept request bodies up to ~4.5 MB. Lyze hands
 * out a short-lived upload token after a permission check, then records the file once the browser
 * reports the path. Off unless BLOB_READ_WRITE_TOKEN is set; then files go through the server.
 */
export const directUploadsEnabled = () => !!process.env.BLOB_READ_WRITE_TOKEN;

/** Where a direct upload may go and how big it may be. */
export type UploadTarget = { prefix: string; maxBytes: number; contentTypes?: string[] };

/** A file the browser already put in Blob storage. */
export type StoredUpload = { key: string; size: number; mime: string };

/** Check that a reported upload exists and sits under the prefix this person may write to. */
export async function claimUpload(pathname: unknown, target: UploadTarget): Promise<StoredUpload> {
  if (typeof pathname !== "string" || !directUploadsEnabled() || pathname.length > 500 || pathname.includes("..") || !pathname.startsWith(target.prefix)) throw new AppError("invalid");
  const meta = await head(pathname).catch(() => null);
  if (!meta) throw new AppError("invalid");
  if (meta.size > target.maxBytes) {
    await discardUpload(meta.pathname);
    throw new AppError("invalid", "fileSize");
  }
  return { key: meta.pathname, size: meta.size, mime: (meta.contentType || "application/octet-stream").split(";")[0]!.trim().toLowerCase() };
}

export async function discardUpload(key: string) {
  await del(key).catch(() => undefined);
}
