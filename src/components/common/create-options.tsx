"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { DownloadIcon, Loader2Icon, PencilLineIcon, SparklesIcon, UploadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useActionFeedback } from "@/components/common/use-action-feedback";
import { AiModeSelect, useAiMode, useCanPlaceholder } from "@/components/common/ai-mode";
import { deleteGeneratedAction, generateAction, responsesTemplateAction, uploadAction, type CreateKind, type CreateScope } from "@/server/actions/create";
import { FORM_CSV_EXAMPLE } from "@/lib/create/form";
import { CODEBOOK_CSV_EXAMPLE, GUIDE_CSV_EXAMPLE, PEOPLE_CSV_EXAMPLE } from "@/lib/create/misc";
import { cn } from "@/lib/utils";

const EXAMPLES: Partial<Record<CreateKind, string>> = { questionnaire: FORM_CSV_EXAMPLE, guide: GUIDE_CSV_EXAMPLE, participants: PEOPLE_CSV_EXAMPLE, codebook: CODEBOOK_CSV_EXAMPLE };
const COUNTED: CreateKind[] = ["responses", "participants"];

function save(name: string, text: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

/**
 * The three ways to get anything into Lyze: generate it (from the brief, or as test data), upload a
 * CSV (with an example file to start from), or enter it by hand. Used for questionnaires, guides,
 * responses, participants, codebooks and transcripts.
 */
export function CreateOptions({
  scope,
  kind,
  manual,
  hide = [],
  compact = false,
  className,
}: {
  scope: CreateScope;
  kind: CreateKind;
  /** Where "enter manually" goes: a link, or an in-page anchor. */
  manual?: { href: string; newTab?: boolean } | null;
  hide?: ("generate" | "upload")[];
  compact?: boolean;
  className?: string;
}) {
  const t = useTranslations("create");
  const feedback = useActionFeedback();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<"generate" | "upload" | null>(null);
  const [count, setCount] = useState(kind === "participants" ? 8 : 40);
  const file = useRef<HTMLInputElement>(null);
  const [mode] = useAiMode();
  const canPlaceholder = useCanPlaceholder();
  // Made-up data is a placeholder tool: hidden from people who can't use it.
  const generateHidden = hide.includes("generate") || (COUNTED.includes(kind) && !canPlaceholder);

  const run = (which: "generate" | "upload", fn: () => Promise<boolean>) => {
    setBusy(which);
    startTransition(async () => {
      if (await fn()) router.refresh();
      setBusy(null);
    });
  };

  const generate = () =>
    run("generate", async () => {
      const r = await generateAction(scope, kind, count, mode);
      return feedback(r, r.ok ? t(`generated.${kind}`, { count: Number(r.data.count ?? 0) }) : undefined);
    });

  const upload = (f: File) =>
    run("upload", async () => {
      const r = await uploadAction(scope, kind, await f.text());
      if (file.current) file.current.value = "";
      return feedback(r, r.ok ? (r.data.errors ? t("uploadedWithErrors", { count: r.data.count, errors: r.data.errors }) : t("uploaded", { count: r.data.count })) : undefined);
    });

  const example = async () => {
    if (kind === "responses") {
      const r = await responsesTemplateAction(scope);
      if (feedback(r) && r.ok) save("responses-template.csv", r.data);
    } else if (EXAMPLES[kind]) save(`${kind}-example.csv`, EXAMPLES[kind]!);
  };

  const card = "flex flex-col gap-2 rounded-xl border bg-card p-4";
  return (
    <div className={cn("grid grid-cols-1 gap-3", compact ? "sm:grid-cols-3" : "md:grid-cols-3", className)}>
      {!generateHidden && (
        <div className={card}>
          <p className="flex items-center gap-2 font-semibold">
            <SparklesIcon className="size-4 text-section-coding" aria-hidden />
            {t(`generate.${kind}`)}
          </p>
          <p className="flex-1 text-sm text-pretty text-muted-foreground">{t(`generateHint.${kind}`)}</p>
          <div className="flex flex-wrap items-center gap-2">
            {COUNTED.includes(kind) && (
              <Input type="number" min={1} max={kind === "participants" ? 100 : 500} value={count} onChange={(e) => setCount(Number(e.target.value) || 1)} className="h-9 w-20" aria-label={t("howMany")} />
            )}
            <Button size="sm" disabled={pending} onClick={generate}>
              {busy === "generate" ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
              {t("generateButton")}
            </Button>
            {!COUNTED.includes(kind) && <AiModeSelect />}
          </div>
        </div>
      )}
      {!hide.includes("upload") && (
        <div className={card}>
          <p className="flex items-center gap-2 font-semibold">
            <UploadIcon className="size-4 text-section-forms" aria-hidden />
            {t("upload")}
          </p>
          <p className="flex-1 text-sm text-pretty text-muted-foreground">{t(`uploadHint.${kind}`)}</p>
          <input ref={file} type="file" accept=".csv,.tsv,.txt,text/csv" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" disabled={pending} onClick={() => file.current?.click()}>
              {busy === "upload" ? <Loader2Icon className="animate-spin" /> : <UploadIcon />}
              {t("chooseCsv")}
            </Button>
            <Button size="sm" variant="ghost" onClick={example}>
              <DownloadIcon /> {t("example")}
            </Button>
          </div>
        </div>
      )}
      {manual && (
        <div className={card}>
          <p className="flex items-center gap-2 font-semibold">
            <PencilLineIcon className="size-4 text-section-interviews" aria-hidden />
            {t("manual")}
          </p>
          <p className="flex-1 text-sm text-pretty text-muted-foreground">{t(`manualHint.${kind}`)}</p>
          <Button size="sm" variant="outline" className="w-fit" asChild>
            <a href={manual.href} target={manual.newTab ? "_blank" : undefined} rel={manual.newTab ? "noreferrer" : undefined}>
              <PencilLineIcon /> {t(`manualButton.${kind}`)}
            </a>
          </Button>
        </div>
      )}
    </div>
  );
}

/** The same three options, folded away under one line for pages that already have content. */
export function CreatePanel(props: React.ComponentProps<typeof CreateOptions> & { open?: boolean }) {
  const t = useTranslations("create");
  const { open, ...rest } = props;
  return (
    <details open={open} className="group rounded-xl border bg-muted/30 px-3 py-2 [&[open]]:pb-3">
      <summary className="flex min-h-9 cursor-pointer list-none items-center gap-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
        <SparklesIcon className="size-4 text-section-coding" aria-hidden />
        {t(`panel.${props.kind}`)}
        <span className="ms-auto text-xs text-muted-foreground group-open:hidden">{t("show")}</span>
      </summary>
      <CreateOptions {...rest} compact className="mt-2" />
    </details>
  );
}

/** Shown wherever generated test responses are mixed into the data, with a one-click clean-up. */
export function GeneratedBanner({ scope, count }: { scope: CreateScope; count: number }) {
  const t = useTranslations("create");
  const feedback = useActionFeedback();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <div role="status" className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-warning/60 bg-warning/10 px-3 py-2 text-sm">
      <SparklesIcon className="size-4 text-warning" aria-hidden />
      <span className="min-w-0 flex-1">{t("generatedBanner", { count })}</span>
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const r = await deleteGeneratedAction(scope);
            if (feedback(r, r.ok ? t("deletedGenerated", { count: r.data.count }) : undefined)) router.refresh();
          })
        }
      >
        {t("deleteGenerated")}
      </Button>
    </div>
  );
}
