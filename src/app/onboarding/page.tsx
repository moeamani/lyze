import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/server/auth";
import { listUserWorkspaces } from "@/server/services/workspaces";
import { CreateWorkspaceForm } from "@/components/workspace/create-workspace-form";
import { Logo } from "@/components/common/logo";
import { Mascot } from "@/components/illustrations";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("onboarding");
  return { title: t("title") };
}

export default async function OnboardingPage() {
  const user = await requireUser("/onboarding");
  const t = await getTranslations("onboarding");
  const workspaces = await listUserWorkspaces(user.id);
  const first = workspaces.length === 0;
  const firstName = user.name?.split(" ")[0];
  const suggested = first ? t("suggestedName", { name: firstName ?? user.email.split("@")[0]! }) : "";

  return (
    <div className="flex min-h-dvh flex-col bg-[radial-gradient(ellipse_at_top,var(--accent-soft),transparent_60%)]">
      <header className="flex items-center justify-between px-4 py-5 sm:px-8">
        <Logo />
        {!first && (
          <Link href="/" className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
            {t("cancel")}
          </Link>
        )}
      </header>
      <main id="main" className="flex flex-1 justify-center px-4 pt-6 pb-16 sm:pt-16">
        <div className="w-full max-w-md animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
          <div className="mb-8 flex flex-col items-center gap-3 text-center">
            <Mascot className="size-20" />
            <h1 className="text-2xl font-semibold">{first ? t("welcome") : t("title")}</h1>
            <p className="text-balance text-muted-foreground">{first ? t("welcomeBody") : t("body")}</p>
          </div>
          <div className="rounded-2xl border bg-card p-5 shadow-soft sm:p-6">
            <CreateWorkspaceForm suggestedName={suggested} offerDemo={first} />
          </div>
        </div>
      </main>
    </div>
  );
}
