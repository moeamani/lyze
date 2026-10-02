import "server-only";
import { localStorage } from "./local";
import { s3Storage } from "./s3";

export interface StorageAdapter {
  readonly name: "local" | "s3";
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<{ body: ReadableStream<Uint8Array> | Uint8Array; size?: number } | null>;
  delete(key: string): Promise<void>;
}

let adapter: StorageAdapter | undefined;

/** S3-compatible storage when S3_BUCKET is set, otherwise files on local disk (dev). */
export function storage(): StorageAdapter {
  adapter ??= process.env.S3_BUCKET ? s3Storage() : localStorage();
  return adapter;
}

export function storageFor(name: string): StorageAdapter {
  if (name === "s3") return s3Storage();
  return localStorage();
}
