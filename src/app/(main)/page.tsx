import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowRightIcon, BarChart3Icon, ClipboardListIcon, HighlighterIcon, LayersIcon } from "lucide-react";
import { currentUser } from "@/server/auth";
import { listUserWorkspaces } from "@/server/services/workspaces";
import { lastWorkspaceSlug } from "@/server/preferences";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/common/logo";
import { Mascot } from "@/components/illustrations";

export default async function Home() {
  const user = await currentUser();
  if (user) {
    const workspaces = await listUserWorkspaces(user.id);
    if (workspaces.length === 0) redirect("/onboarding");
    const last = await lastWorkspaceSlug();
    redirect(`/w/${workspaces.find((w) => w.slug === last)?.slug ?? workspaces[0]!.slug}`);
  }

  const t = await getTranslations("landing");
  const features = [
    { icon: ClipboardListIcon, key: "collect" },
    { icon: BarChart3Icon, key: "quant" },
    { icon: HighlighterIcon, key: "qual" },
    { icon: LayersIcon, key: "mixed" },
  ] as const;

  return (
    <div className="flex min-h-dvh flex-col bg-[radial-gradient(ellipse_at_top,var(--accent-soft),transparent_55%)]">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-5 sm:px-8">
        <Logo />
        <Button asChild variant="ghost">
          <Link href="/sign-in">{t("signIn")}</Link>
        </Button>
      </header>
      <main id="main" className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center px-4 pt-10 pb-20 text-center sm:px-8 sm:pt-20">
        <Mascot className="size-24 animate-in fade-in-0 zoom-in-90 duration-500" />
        <h1 className="mt-6 max-w-2xl text-3xl font-semibold text-balance sm:text-[2.75rem] sm:leading-[1.1]">{t("headline")}</h1>
        <p className="mt-4 max-w-xl text-lg text-balance text-muted-foreground">{t("subhead")}</p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button asChild size="lg">
            <Link href="/sign-in">
              {t("cta")}
              <ArrowRightIcon className="rtl:rotate-180" />
            </Link>
          </Button>
        </div>
        <ul className="mt-16 grid w-full gap-3 text-start sm:grid-cols-2 lg:grid-cols-4">
          {features.map(({ icon: Icon, key }) => (
            <li key={key} className="rounded-2xl border bg-card p-5 shadow-soft">
              <span className="mb-3 grid size-10 place-items-center rounded-xl bg-accent-soft text-accent-soft-foreground">
                <Icon className="size-5" aria-hidden />
              </span>
              <h2 className="font-semibold">{t(`features.${key}.title`)}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t(`features.${key}.body`)}</p>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
