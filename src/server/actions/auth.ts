"use server";

import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn, signOut } from "@/server/auth";
import { signInSchema } from "@/lib/validation";

export type SignInState = { status: "idle" | "error"; error?: "email" | "unknown" };

function safeCallback(raw: FormDataEntryValue | null): string {
  const value = typeof raw === "string" ? raw : "";
  // Only allow same-origin relative paths.
  return value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export async function signInWithEmail(_prev: SignInState, formData: FormData): Promise<SignInState> {
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
