"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { currentUser, requireUser } from "@/server/auth";
import * as users from "@/server/services/users";
import { LOCALE_COOKIE, isLocale } from "@/i18n/config";
import type { ProfileInput } from "@/lib/validation";
import { attempt } from "./result";

export async function updateProfileAction(input: ProfileInput) {
  const user = await requireUser();
  const result = await attempt(() => users.updateProfile(user.id, input));
  if (result.ok) revalidatePath("/", "layout");
  return result;
}

/** Works signed in or out: always sets the cookie, and persists on the profile when signed in. */
export async function setLocaleAction(locale: string) {
  if (!isLocale(locale)) return;
  (await cookies()).set(LOCALE_COOKIE, locale, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  const user = await currentUser();
  if (user) await users.setUserLocale(user.id, locale);
  revalidatePath("/", "layout");
}

export async function deleteAccountAction(confirmEmail: string) {
  const user = await requireUser();
  const { deleteAccount } = await import("@/server/services/users");
  const result = await attempt(() => deleteAccount(user.id, confirmEmail));
  if (!result.ok) return result;
  const { signOut } = await import("@/server/auth");
  await signOut({ redirectTo: "/" });
  return result;
}
