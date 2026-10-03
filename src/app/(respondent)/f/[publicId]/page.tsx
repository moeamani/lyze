import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { cache } from "react";
import { getPublicForm } from "@/server/services/respondent";
import { pickFormLanguage, respondentLabels } from "@/server/respondent-labels";
import { captchaSiteKey } from "@/server/captcha";
import { FormRunner } from "@/components/form-runner/form-runner";
import { FORM_LANGUAGES, languageDirection, localize } from "@/lib/forms/i18n";
import { Mascot } from "@/components/illustrations";

const load = cache(getPublicForm);

export async function generateMetadata({ params }: PageProps<"/f/[publicId]">): Promise<Metadata> {
  const form = await load((await params).publicId);
  if (!form) return { title: "Form not found", robots: { index: false } };
  return {
    title: form.doc.title,
    description: form.doc.description?.slice(0, 160),
    robots: { index: false, follow: false },
    openGraph: { title: form.doc.title, description: form.doc.description?.slice(0, 160) },
  };
}

function StatusPage({ title, message, lang }: { title: string; message: string; lang: string }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 px-4 text-center" lang={lang} dir={languageDirection(lang)}>
      <Mascot mood="sleepy" />
      <h1 className="text-2xl font-semibold text-balance">{title}</h1>
      <p className="max-w-md text-balance text-muted-foreground">{message}</p>
    </main>
  );
}

export default async function PublicFormPage({ params, searchParams }: PageProps<"/f/[publicId]">) {
  const { publicId } = await params;
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const form = await load(publicId);
  if (!form) notFound();

  const lang = pickFormLanguage(form.doc, str("lang"), (await headers()).get("accept-language"));
  const labels = await respondentLabels(form.doc, lang);
  const localized = localize(form.doc, lang);
  const invite = str("t");
  const embed = str("embed") === "1";

  if (!form.open) {
    return <StatusPage lang={lang} title={labels.closedTitle} message={form.doc.settings.closedMessage || labels.closedMessage} />;
  }
  if (form.doc.settings.oneResponse === "invite" && !invite && !str("resume")) {
    return <StatusPage lang={lang} title={labels.inviteTitle} message={labels.inviteMessage} />;
  }

  const languages = [form.doc.settings.defaultLanguage, ...form.doc.settings.languages].map((code) => ({
    code,
    label: FORM_LANGUAGES[code] ?? code,
  }));

  return (
    <FormRunner
      doc={form.doc}
      lang={lang}
      labels={labels}
      mode="live"
      publicId={publicId}
      inviteToken={invite}
      resumeToken={str("resume")}
      embed={embed}
      captchaSiteKey={captchaSiteKey()}
      languages={languages}
      className={embed ? "bg-transparent" : "min-h-dvh"}
      key={`${lang}:${localized.title}`}
    />
  );
}
