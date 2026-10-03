import { del, get, put } from "@vercel/blob";
import type { StorageAdapter } from "./index";

/**
 * Vercel Blob, private store (uploads hold research data, so nothing gets a public URL; files are
 * served through /api/files after a permission check). Env: BLOB_READ_WRITE_TOKEN, which Vercel
 * adds when a Blob store is connected to the project.
 */
export function blobStorage(): StorageAdapter {
  return {
    name: "blob",
    async put(key, body, contentType) {
      await put(key, Buffer.from(body), { access: "private", contentType, addRandomSuffix: false, allowOverwrite: true });
    },
    async get(key, range) {
      const result = await get(key, { access: "private", headers: range ? { range: `bytes=${range.start}-${range.end}` } : undefined });
      if (!result || !result.stream) return null;
      const length = Number(result.headers.get("content-length"));
      return { body: result.stream, size: Number.isFinite(length) && length > 0 ? length : (result.blob.size ?? undefined) };
    },
    async delete(key) {
      await del(key);
    },
  };
}
