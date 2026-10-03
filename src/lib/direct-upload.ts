import type { UploadPurpose } from "@/server/services/upload-targets";

/** A direct upload was refused or failed. `status` 413 means the file is too large. */
export class DirectUploadError extends Error {
  constructor(
    public readonly status: number,
    public readonly maxBytes?: number,
  ) {
    super(`Upload failed (${status})`);
  }
}

/**
 * Send a file straight to Blob storage when the server uses it (Vercel), skipping the ~4.5 MB limit
 * on serverless request bodies. Returns the stored path to report to the server, or null when
 * direct uploads are off and the file should be sent to the server as before.
 */
export async function directUpload(file: Blob, name: string, purpose: UploadPurpose, onProgress?: (fraction: number) => void): Promise<string | null> {
  const res = await fetch("/api/uploads", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "lyze.prepare", purpose }) });
  if (!res.ok) throw new DirectUploadError(res.status);
  const prep = (await res.json()) as { direct: boolean; prefix?: string; maxBytes?: number };
  if (!prep.direct || !prep.prefix) return null;
  if (prep.maxBytes && file.size > prep.maxBytes) throw new DirectUploadError(413, prep.maxBytes);
  const safeName = name.replace(/[^\w.-]+/g, "_").slice(-80) || "file";
  try {
    // Loaded only when needed, so pages without uploads (like public forms) stay small.
    const { upload } = await import("@vercel/blob/client");
    const blob = await upload(`${prep.prefix}${safeName}`, file, {
      access: "private",
      handleUploadUrl: "/api/uploads",
      clientPayload: JSON.stringify(purpose),
      contentType: file.type || undefined,
      multipart: file.size > 20 * 1024 * 1024,
      onUploadProgress: (p) => onProgress?.(p.percentage / 100),
    });
    return blob.pathname;
  } catch {
    throw new DirectUploadError(400);
  }
}
