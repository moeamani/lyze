import "server-only";
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const N = 16384;
const KEYLEN = 64;

function derive(password: string, salt: Buffer, n: number) {
  return new Promise<Buffer>((resolve, reject) =>
    scrypt(password.normalize("NFKC"), salt, KEYLEN, { N: n, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

/** `scrypt$<N>$<salt>$<hash>`, base64url. */
export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const key = await derive(password, salt, N);
  return `scrypt$${N}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string | null | undefined) {
  const [scheme, n, salt, hash] = (stored ?? "").split("$");
  if (scheme !== "scrypt" || !n || !salt || !hash) {
    // Spend the same time as a real check, so a missing account can't be told apart by timing.
    await derive(password, randomBytes(16), N);
    return false;
  }
  const expected = Buffer.from(hash, "base64url");
  const key = await derive(password, Buffer.from(salt, "base64url"), Number(n));
  return key.length === expected.length && timingSafeEqual(key, expected);
}
