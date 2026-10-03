import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import { hashPassword, verifyPassword } from "@/server/password";
import { passwordSignInSchema, signUpSchema, type SignUpInput } from "@/lib/validation";
import { AppError } from "./errors";

/** Create an account with a username and password. Fails with "conflict" when the name is taken. */
export async function signUpWithPassword(raw: SignUpInput) {
  const input = signUpSchema.parse(raw);
  const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.username, input.username)).limit(1);
  if (taken) throw new AppError("conflict");
  const passwordHash = await hashPassword(input.password);
  try {
    const [user] = await db.insert(users).values({ username: input.username, name: input.name ?? null, passwordHash }).returning({ id: users.id });
    return user!;
  } catch {
    // Two sign-ups racing for the same name: the unique index decides.
    throw new AppError("conflict");
  }
}

/** The user id for a correct username and password, or null. */
export async function checkPassword(raw: { username: string; password: string }) {
  const parsed = passwordSignInSchema.safeParse(raw);
  if (!parsed.success) return null;
  const [user] = await db.select({ id: users.id, passwordHash: users.passwordHash }).from(users).where(eq(users.username, parsed.data.username)).limit(1);
  const ok = await verifyPassword(parsed.data.password, user?.passwordHash);
  return ok && user ? user.id : null;
}
