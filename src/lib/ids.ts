import { customAlphabet } from "nanoid";

const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
const id = customAlphabet(alphabet, 16);
const token = customAlphabet(alphabet + "ABCDEFGHIJKLMNOPQRSTUVWXYZ", 32);

/** Prefixed, URL-safe id, e.g. `prj_3k9x0c…`. */
export function newId(prefix: string): string {
  return `${prefix}_${id()}`;
}

/** Unguessable token for invites, share links and resume links. */
export function newToken(): string {
  return token();
}
