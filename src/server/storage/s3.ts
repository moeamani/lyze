import { AwsClient } from "aws4fetch";
import type { StorageAdapter } from "./index";

/**
 * Minimal S3-compatible adapter (AWS S3, Cloudflare R2, MinIO, Backblaze…).
 * Env: S3_BUCKET, S3_REGION, S3_ENDPOINT (optional for AWS), S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY.
 */
export function s3Storage(): StorageAdapter {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) throw new Error("S3_BUCKET is not set");
  const region = process.env.S3_REGION || "us-east-1";
  const endpoint = (process.env.S3_ENDPOINT || `https://s3.${region}.amazonaws.com`).replace(/\/$/, "");
  const client = new AwsClient({
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
    region,
    service: "s3",
  });
  const url = (key: string) => `${endpoint}/${bucket}/${key.split("/").map(encodeURIComponent).join("/")}`;

  return {
    name: "s3",
    async put(key, body, contentType) {
      const res = await client.fetch(url(key), { method: "PUT", body: body as Uint8Array<ArrayBuffer>, headers: { "content-type": contentType } });
      if (!res.ok) throw new Error(`S3 upload failed: ${res.status}`);
    },
    async get(key, range) {
      const res = await client.fetch(url(key), range ? { headers: { range: `bytes=${range.start}-${range.end}` } } : undefined);
      if (res.status === 404) return null;
      if (!res.ok || !res.body) throw new Error(`S3 download failed: ${res.status}`);
      const size = Number(res.headers.get("content-length")) || undefined;
      return { body: res.body, size };
    },
    async delete(key) {
      const res = await client.fetch(url(key), { method: "DELETE" });
      if (!res.ok && res.status !== 404) throw new Error(`S3 delete failed: ${res.status}`);
    },
  };
}
