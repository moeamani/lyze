import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { currentUser } from "@/server/auth";
import { getInviteByToken } from "@/server/services/members";
import { AcceptInviteButton } from "@/components/members/accept-invite-button";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/common/logo";
import { Mascot, PeopleIllustration } from "@/components/illustrations";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("invite");
  return { title: t("title"), robots: { index: false } };
}

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const t = await getTranslations("invite");
  const tr = await getTranslations("roles");
  const [invite, user] = await Promise.all([getInviteByToken(token), currentUser()]);

  let body: React.ReactNode;
  if (!invite) {
    body = (
      <>
        <Mascot mood="sleepy" />
        <h1 className="text-2xl font-semibold">{t("invalidTitle")}</h1>
        <p className="text-muted-foreground">{t("invalidBody")}</p>
        <Button asChild variant="outline">
          <Link href="/">{t("goHome")}</Link>
        </Button>
      </>
    );
  } else {
    const intro = (
      <>
        <PeopleIllustration />
        <h1 className="text-2xl font-semibold text-balance">{t("joinTitle", { workspace: invite.workspaceName })}</h1>
        <p className="text-muted-foreground">{t("joinBody", { role: tr(invite.invite.role), email: invite.invite.email })}</p>
      </>
    );
    if (!user) {
      body = (
        <>
          {intro}
          <Button asChild size="lg" className="w-full">
            <Link href={`/sign-in?callbackUrl=${encodeURIComponent(`/invite/${token}`)}`}>{t("signInToAccept")}</Link>
          </Button>
        </>
      );
    } else if (user.email?.toLowerCase() !== invite.invite.email) {
      body = (
        <>
          {intro}
          <p className="rounded-xl border border-dashed p-3 text-sm text-muted-foreground">
            {t("wrongAccount", { email: user.handle })}
          </p>
        </>
      );
    } else {
      body = (
        <>
          {intro}
          <AcceptInviteButton token={token} />
        </>
      );
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-[radial-gradient(ellipse_at_top,var(--accent-soft),transparent_60%)]">
      <header className="px-4 py-5 sm:px-8">
        <Logo />
      </header>
      <main id="main" className="flex flex-1 justify-center px-4 pt-6 pb-16 sm:pt-16">
        <div className="flex w-full max-w-sm flex-col items-center gap-4 text-center">{body}</div>
      </main>
    </div>
  );
}
