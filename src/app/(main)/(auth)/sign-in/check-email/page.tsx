import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { MailCheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { devMailboxEnabled } from "@/server/mail";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth");
  return { title: t("checkEmailTitle") };
}

export default async function CheckEmailPage() {
  const t = await getTranslations("auth");
  const showMailbox = devMailboxEnabled() && !process.env.EMAIL_SERVER;
  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-4 text-center animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
      <span className="grid size-16 place-items-center rounded-2xl bg-accent-soft text-accent-soft-foreground">
        <MailCheckIcon className="size-7" />
      </span>
      <h1 className="text-2xl font-semibold">{t("checkEmailTitle")}</h1>
      <p className="text-muted-foreground">{t("checkEmailBody")}</p>
      {showMailbox && (
        <div className="mt-2 w-full rounded-2xl border border-dashed bg-card p-4 text-sm">
          <p className="mb-3 text-muted-foreground">{t("devMailboxHint")}</p>
          <Button asChild variant="soft" className="w-full">
            <Link href="/dev/mailbox">{t("openDevMailbox")}</Link>
          </Button>
        </div>
      )}
      <Button asChild variant="ghost">
        <Link href="/sign-in">{t("useDifferentEmail")}</Link>
      </Button>
    </div>
  );
}
