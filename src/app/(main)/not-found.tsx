import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Mascot } from "@/components/illustrations";

export default async function NotFound() {
  const t = await getTranslations("errors");
  return (
    <main id="main" className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <Mascot mood="sleepy" />
      <h1 className="text-2xl font-semibold">{t("notFoundTitle")}</h1>
      <p className="max-w-sm text-muted-foreground">{t("notFoundBody")}</p>
      <Button asChild variant="outline">
        <Link href="/">{t("goHome")}</Link>
      </Button>
    </main>
  );
}
