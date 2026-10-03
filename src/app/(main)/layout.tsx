import type { Metadata, Viewport } from "next";
import { peyda } from "@/app/fonts";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { Providers } from "@/components/providers";
import { direction, type Locale } from "@/i18n/config";
import { setupProblems } from "@/server/setup";
import { SetupNeeded } from "@/components/setup-needed";
import "../globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return {
    title: { default: "Lyze", template: "%s · Lyze" },
    description: t("description"),
    applicationName: "Lyze",
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#191919" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = (await getLocale()) as Locale;
  const dir = direction(locale);
  const problems = setupProblems();
  return (
    <html lang={locale} dir={dir} suppressHydrationWarning className={`${GeistSans.variable} ${GeistMono.variable} ${peyda.variable}`}>
      <body className="min-h-dvh font-sans">
        {problems.length ? (
          <SetupNeeded problems={problems} />
        ) : (
          <NextIntlClientProvider>
            <Providers dir={dir}>{children}</Providers>
          </NextIntlClientProvider>
        )}
      </body>
    </html>
  );
}
