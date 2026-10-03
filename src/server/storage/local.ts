import fs from "node:fs/promises";
import path from "node:path";
import type { StorageAdapter } from "./index";

export function localStorage(): StorageAdapter {
  const root = path.resolve(/* turbopackIgnore: true */ process.env.UPLOADS_DIR || "./.data/uploads");
  const resolve = (key: string) => {
    const full = path.resolve(root, key);
    // Keys are generated server-side, but never let one escape the uploads folder.
    if (!full.startsWith(root + path.sep)) throw new Error("Invalid storage key");
    return full;
  };

  return {
    name: "local",
    async put(key, body) {
      const full = resolve(key);
      await fs.mkdir(path.dirname(full), { recursive: true });
      await fs.writeFile(full, body);
    },
    async get(key, range) {
      try {
        if (!range) {
          const body = await fs.readFile(resolve(key));
          return { body: new Uint8Array(body), size: body.byteLength };
        }
        const handle = await fs.open(resolve(key), "r");
        try {
          const length = range.end - range.start + 1;
          const buffer = new Uint8Array(length);
          const { bytesRead } = await handle.read(buffer, 0, length, range.start);
          return { body: buffer.subarray(0, bytesRead), size: bytesRead };
        } finally {
          await handle.close();
        }
      } catch {
        return null;
      }
    },
    async delete(key) {
      await fs.rm(resolve(key), { force: true });
    },
  };
}
