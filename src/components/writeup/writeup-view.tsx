"use client";

import { providerLabel } from "@/lib/ai-providers";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeftIcon, CopyIcon, DownloadIcon, Loader2Icon, PencilIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useActionFeedback } from "@/components/common/use-action-feedback";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { deleteWriteupAction, updateWriteupAction } from "@/server/actions/writeup";
import { Markdown } from "./markdown";

type Scope = { workspaceId: string; slug: string; projectId: string };

export function WriteupView({ scope, back, writeup, canEdit }: { scope: Scope; back: string; writeup: { id: string; title: string; body: string; provider: string; createdAt: string }; canEdit: boolean }) {
  const t = useTranslations("writeup");
  const tc = useTranslations("common");
  const feedback = useActionFeedback();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(writeup.title);
  const [body, setBody] = useState(writeup.body);
  const [confirm, setConfirm] = useState(false);

  const download = () => {
    const blob = new Blob([`# ${title}\n\n${body}\n`], { type: "text/markdown;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${title.replace(/[^\p{L}\p{N}]+/gu, "-").slice(0, 60) || "writeup"}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <article className="mx-auto grid w-full max-w-3xl grid-cols-1 gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href={back}>
            <ArrowLeftIcon className="rtl:rotate-180" /> {t("backToBrief")}
          </Link>
        </Button>
        <div className="ms-auto flex flex-wrap gap-1">
          <Button variant="ghost" size="sm" onClick={async () => (await navigator.clipboard?.writeText(`# ${title}\n\n${body}`), feedback({ ok: true, data: null }, t("copied")))}>
            <CopyIcon /> {t("copy")}
          </Button>
          <Button variant="ghost" size="sm" onClick={download}>
            <DownloadIcon /> {t("download")}
          </Button>
          {canEdit && !editing && (
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <PencilIcon /> {tc("edit")}
            </Button>
          )}
          {canEdit && (
            <Button variant="ghost" size="icon-sm" aria-label={tc("delete")} onClick={() => setConfirm(true)}>
              <Trash2Icon />
            </Button>
          )}
        </div>
      </div>
      <p className="rounded-lg border border-dashed border-section-writeup/50 px-3 py-2 text-xs text-pretty text-muted-foreground">
        {writeup.provider !== "builtin" ? t("draftNoticeClaude", { name: providerLabel(writeup.provider) }) : t("draftNoticeBuiltin")}
      </p>
      {editing ? (
        <div className="grid gap-3">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} aria-label={t("titleLabel")} className="text-lg font-semibold" />
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={28} aria-label={t("bodyLabel")} className="font-mono text-sm leading-relaxed" />
          <div className="flex gap-2">
            <Button
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  if (feedback(await updateWriteupAction(scope, writeup.id, { title, body }), t("saved"))) setEditing(false);
                })
              }
            >
              {pending && <Loader2Icon className="animate-spin" />}
              {tc("save")}
            </Button>
            <Button variant="ghost" onClick={() => (setEditing(false), setTitle(writeup.title), setBody(writeup.body))}>
              {tc("cancel")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border bg-card px-5 py-6 sm:px-10 sm:py-10">
          <h1 className="mb-6 text-2xl font-semibold text-balance">{title}</h1>
          <Markdown source={body} />
        </div>
      )}
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={t("deleteTitle")}
        description={t("deleteBody")}
        confirmLabel={tc("delete")}
        destructive
        onConfirm={async () => {
          if (feedback(await deleteWriteupAction(scope, writeup.id))) router.push(back);
        }}
      />
    </article>
  );
}
