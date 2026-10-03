"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { emailSignInEnabled, signIn, signOut, startSession } from "@/server/auth";
import { signInSchema, signUpSchema } from "@/lib/validation";
import { clientKey, rateLimit } from "@/server/rate-limit";
import { checkPassword, signUpWithPassword } from "@/server/services/password-accounts";
import { AppError } from "@/server/services/errors";

export type SignInState = { status: "idle" | "error"; error?: "email" | "unknown" };

export type PasswordState = {
  status: "idle" | "error";
  error?: "credentials" | "taken" | "username" | "usernameShort" | "passwordShort" | "tooMany" | "unknown";
  /** Echoed back so the form keeps what was typed (never the password). */
  username?: string;
  name?: string;
};

function safeCallback(raw: FormDataEntryValue | null): string {
  const value = typeof raw === "string" ? raw : "";
  // Only allow same-origin relative paths.
  return value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export async function signInWithEmail(_prev: SignInState, formData: FormData): Promise<SignInState> {
  if (!emailSignInEnabled) return { status: "error", error: "unknown" };
  const parsed = signInSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { status: "error", error: "email" };
  try {
    // `redirect: false` sends the email without bouncing through /api/auth/verify-request,
    // so the browser lands directly on our own page with a clean URL.
    await signIn("email", {
      email: parsed.data.email,
      redirectTo: safeCallback(formData.get("callbackUrl")),
      redirect: false,
    });
  } catch (error) {
    if (error instanceof AuthError) return { status: "error", error: "unknown" };
    throw error;
  }
  redirect("/sign-in/check-email");
}

export async function signInWithGoogle(formData: FormData) {
  await signIn("google", { redirectTo: safeCallback(formData.get("callbackUrl")) });
}

export async function signOutAction() {
  await signOut({ redirectTo: "/sign-in" });
}

const str = (v: FormDataEntryValue | null) => (typeof v === "string" ? v : "");

/**
 * The visitor's hashed IP, or null when the server only sees itself (a loopback address, i.e. no
 * proxy telling it who's calling). Every visitor would share that one bucket, so per-IP limits are
 * skipped then and only the per-account limit applies.
 */
async function visitor() {
  const h = await headers();
  const ip = (h.get("x-forwarded-for")?.split(",")[0] || h.get("x-real-ip") || "").trim();
  return !ip || /^(127\.|::1$|::ffff:127\.)/.test(ip) ? null : clientKey(h);
}

/** Sign in with a username and password. */
export async function signInWithPassword(_prev: PasswordState, formData: FormData): Promise<PasswordState> {
  const username = str(formData.get("username")).trim().toLowerCase();
  const ip = await visitor();
  // Per account (guessing one password) and per visitor (trying many accounts).
  if (!rateLimit(`signin:user:${username}`, 10, 15 * 60_000).ok || (ip && !rateLimit(`signin:ip:${ip}`, 30, 15 * 60_000).ok)) return { status: "error", error: "tooMany", username };
  const userId = await checkPassword({ username, password: str(formData.get("password")) });
  if (!userId) return { status: "error", error: "credentials", username };
  await startSession(userId);
  redirect(safeCallback(formData.get("callbackUrl")));
}

/** Create a username/password account and sign in. */
export async function signUpWithPasswordAction(_prev: PasswordState, formData: FormData): Promise<PasswordState> {
  const raw = { name: str(formData.get("name")), username: str(formData.get("username")), password: str(formData.get("password")) };
  const echo = { username: raw.username.trim(), name: raw.name };
  const ip = await visitor();
  if (ip && !rateLimit(`signup:${ip}`, 10, 60 * 60_000).ok) return { status: "error", error: "tooMany", ...echo };
  const parsed = signUpSchema.safeParse(raw);
  if (!parsed.success) {
    const code = parsed.error.issues[0]?.message;
    const error = code === "usernameShort" || code === "username" || code === "passwordShort" ? code : "username";
    return { status: "error", error, ...echo };
  }
  let userId: string;
  try {
    userId = (await signUpWithPassword(parsed.data)).id;
  } catch (e) {
    if (e instanceof AppError && e.code === "conflict") return { status: "error", error: "taken", ...echo };
    return { status: "error", error: "unknown", ...echo };
  }
  await startSession(userId);
  redirect(safeCallback(formData.get("callbackUrl")));
}
