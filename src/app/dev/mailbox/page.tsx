import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { desc } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { InboxIcon } from "lucide-react";
import { db } from "@/server/db";
import { devMailbox } from "@/server/db/schema";
import { devMailboxEnabled } from "@/server/mail";
import { Logo } from "@/components/common/logo";
import { EmptyState } from "@/components/common/empty-state";
import { RelativeTime } from "@/components/common/relative-time";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Dev mailbox", robots: { index: false } };

export default async function DevMailboxPage() {
  if (!devMailboxEnabled()) notFound();
  const t = await getTranslations("devMailbox");
  const mails = await db.select().from(devMailbox).orderBy(desc(devMailbox.createdAt)).limit(20);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8">
      <Logo />
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("description")}</p>
      </div>
      {mails.length === 0 ? (
        <EmptyState illustration={<InboxIcon className="size-10 text-muted-foreground" />} title={t("emptyTitle")} description={t("emptyBody")} />
      ) : (
        <ul className="flex flex-col gap-3" data-testid="dev-mailbox">
          {mails.map((mail) => (
            <li key={mail.id} className="rounded-2xl border bg-card p-4 shadow-soft">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-medium">{mail.subject}</p>
                <span className="text-xs text-muted-foreground">
                  <RelativeTime date={mail.createdAt} />
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                {t("to")} <span data-testid="mail-to">{mail.to}</span>
              </p>
              {mail.url && (
                <Button asChild size="sm" className="mt-3">
                  <a href={mail.url} data-testid="mail-link">
                    {t("openLink")}
                  </a>
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <Link href="/sign-in" className="text-sm text-primary underline-offset-4 hover:underline">
        {t("back")}
      </Link>
    </div>
  );
}
