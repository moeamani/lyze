import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import { profileSchema, type ProfileInput } from "@/lib/validation";
import { isLocale, type Locale } from "@/i18n/config";
import { AppError } from "./errors";

export async function updateProfile(userId: string, raw: ProfileInput) {
  const input = profileSchema.parse(raw);
  await db.update(users).set({ name: input.name }).where(eq(users.id, userId));
}

export async function setUserLocale(userId: string, locale: Locale) {
  if (!isLocale(locale)) throw new AppError("invalid");
  await db.update(users).set({ locale }).where(eq(users.id, userId));
}
