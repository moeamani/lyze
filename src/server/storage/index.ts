import "server-only";
import { localStorage } from "./local";
import { s3Storage } from "./s3";
import { blobStorage } from "./blob";

export interface StorageAdapter {
  readonly name: "local" | "s3" | "blob";
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  /** Whole object, or bytes `start..end` (inclusive) when a range is given. */
  get(key: string, range?: ByteRange): Promise<{ body: ReadableStream<Uint8Array> | Uint8Array; size?: number } | null>;
  delete(key: string): Promise<void>;
}

export type ByteRange = { start: number; end: number };

let adapter: StorageAdapter | undefined;

/**
 * Where new uploads go: Vercel Blob when BLOB_READ_WRITE_TOKEN is set, S3-compatible storage when
 * S3_BUCKET is set, otherwise files on local disk (dev and single-server hosting).
 */
export function storage(): StorageAdapter {
  adapter ??= process.env.BLOB_READ_WRITE_TOKEN ? blobStorage() : process.env.S3_BUCKET ? s3Storage() : localStorage();
  return adapter;
}

/** The adapter a stored file was written with (files remember it, so switching later still works). */
export function storageFor(name: string): StorageAdapter {
  if (name === "blob") return blobStorage();
  if (name === "s3") return s3Storage();
  return localStorage();
}

/** Whether uploads would land on a disk that serverless hosts throw away (or can't write). */
export function storageIsEphemeral() {
  return !!process.env.VERCEL && !process.env.BLOB_READ_WRITE_TOKEN && !process.env.S3_BUCKET;
}
