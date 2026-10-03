import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { getConsentByToken } from "@/server/services/guides";
import { Mascot } from "@/components/illustrations";
import { ConsentForm } from "@/components/interviews/consent-form";
import { languageDirection } from "@/lib/forms/i18n";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("consentPage");
  return { title: t("metaTitle"), robots: { index: false, follow: false } };
}

/** A participant's personal consent page (link sent by the researcher). */
export default async function ConsentPage({ params }: PageProps<"/consent/[token]">) {
  const { token } = await params;
  const data = await getConsentByToken(token);
  if (!data) notFound();
  const t = await getTranslations("consentPage");
  const locale = await getLocale();

  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-xl content-start gap-6 px-4 py-10 sm:py-16" lang={locale} dir={languageDirection(locale)}>
      <header className="grid gap-2">
        <p className="text-sm text-muted-foreground">{t("study", { name: data.studyName })}</p>
        <h1 className="text-2xl font-semibold text-balance">{data.consent.title}</h1>
      </header>
      <article className="grid gap-4 text-[0.95rem] leading-relaxed">
        {data.consent.body.split(/\n\s*\n/).map((p, i) => (
          <p key={i} className="whitespace-pre-line">
            {p}
          </p>
        ))}
      </article>
      {data.signedCurrent ? (
        <div className="grid justify-items-center gap-3 rounded-2xl border bg-card p-6 text-center shadow-soft">
          <Mascot />
          <p className="font-medium">{t("alreadySigned")}</p>
          <p className="text-sm text-muted-foreground">{t("alreadySignedHint")}</p>
        </div>
      ) : (
        <ConsentForm
          token={token}
          version={data.consent.version}
          statements={data.consent.statements}
          defaultName={data.name ?? ""}
          labels={{
            name: t("name"),
            nameHint: t("nameHint"),
            sign: t("sign"),
            signing: t("signing"),
            doneTitle: t("doneTitle"),
            doneBody: t("doneBody"),
            tickAll: t("tickAll"),
            nameRequired: t("nameRequired"),
            changed: t("changed"),
            failed: t("failed"),
            statements: t("statements"),
          }}
        />
      )}
      <p className="text-xs text-muted-foreground">{t("footer")}</p>
    </main>
  );
}
