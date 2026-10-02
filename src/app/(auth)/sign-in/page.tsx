import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { currentUser, googleEnabled } from "@/server/auth";
import { SignInForm } from "@/components/auth/sign-in-form";
import { Mascot } from "@/components/illustrations";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth");
  return { title: t("signInTitle") };
}

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const params = await searchParams;
  const raw = typeof params.callbackUrl === "string" ? params.callbackUrl : "/";
  const callbackUrl = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";
  if (await currentUser()) redirect(callbackUrl);
  const t = await getTranslations("auth");

  return (
    <div className="w-full max-w-sm animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
      <div className="mb-8 flex flex-col items-center gap-3 text-center">
        <Mascot className="size-20" />
        <h1 className="text-2xl font-semibold">{t("signInTitle")}</h1>
        <p className="text-muted-foreground">{t("signInSubtitle")}</p>
      </div>
      <div className="rounded-2xl border bg-card p-5 shadow-soft sm:p-6">
        <SignInForm callbackUrl={callbackUrl} googleEnabled={googleEnabled} authError={typeof params.error === "string"} />
      </div>
      <p className="mt-6 text-center text-xs text-balance text-muted-foreground">{t("noPassword")}</p>
    </div>
  );
}
