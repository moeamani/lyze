import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { LOCALE_COOKIE, isLocale, negotiateLocale, type Locale } from "./config";
import { loadMessages } from "./messages";

export async function resolveLocale(): Promise<Locale> {
  const fromCookie = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(fromCookie)) return fromCookie;
  return negotiateLocale((await headers()).get("accept-language"));
}

export default getRequestConfig(async () => {
  const locale = await resolveLocale();
  return { locale, messages: await loadMessages(locale), timeZone: "UTC" };
});
