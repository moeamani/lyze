"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { FileTextIcon, Loader2Icon, PlusIcon, Trash2Icon, UploadIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useActionFeedback } from "@/components/common/use-action-feedback";
import { directUpload } from "@/lib/direct-upload";
import { attachProposalAction, removeProposalAction, saveBriefAction } from "@/server/actions/writeup";

type Scope = { workspaceId: string; slug: string; projectId: string };
type Kind = "hypothesis" | "proposition" | "assumption";
type Brief = { aim: string; questions: { id: string; text: string }[]; statements: { id: string; text: string; kind: Kind }[]; proposalName: string | null; proposalReadable: boolean };

let tmp = 0;
const tempId = () => `new-${++tmp}`;

/** The research brief: what the project wants to learn. Write-ups are framed by it. */
export function BriefEditor({ scope, brief, canEdit }: { scope: Scope; brief: Brief; canEdit: boolean }) {
  const t = useTranslations("writeup.brief");
  const tc = useTranslations("common");
  const feedback = useActionFeedback();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [aim, setAim] = useState(brief.aim);
  const [questions, setQuestions] = useState(brief.questions);
  const [statements, setStatements] = useState(brief.statements);
  const [dirty, setDirty] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const touch = () => setDirty(true);

  const save = () =>
    startTransition(async () => {
      const clean = <T extends { id: string; text: string }>(xs: T[]) => xs.filter((x) => x.text.trim()).map((x) => ({ ...x, id: x.id.startsWith("new-") ? undefined : x.id }));
      if (feedback(await saveBriefAction(scope, { aim, questions: clean(questions), statements: clean(statements) }), t("saved"))) setDirty(false);
    });

  const upload = (f: File) =>
    startTransition(async () => {
      const form = new FormData();
      // On Vercel the file goes straight to Blob storage first; the server then reads it from there.
      const pathname = await directUpload(f, f.name, { kind: "proposal", workspaceId: scope.workspaceId, projectId: scope.projectId }).catch(() => undefined);
      if (pathname === undefined) return void feedback({ ok: false, error: "unknown" });
      if (pathname) {
        form.set("blob", pathname);
        form.set("name", f.name);
      } else form.set("file", f);
      const result = await attachProposalAction(scope, form);
      const found = result.ok ? result.data.found : null;
      const message = !result.ok ? undefined : !result.data.readable ? t("unreadable") : found && (found.aim || found.questions || found.statements) ? t("foundInFile", { questions: found.questions, statements: found.statements, aim: found.aim ? "yes" : "no" }) : t("foundNothing");
      if (feedback(result, message)) router.refresh();
    });

  return (
    <section aria-labelledby="brief-title" className="grid grid-cols-1 gap-5 rounded-xl border bg-card p-4 sm:p-5">
      <div>
        <h3 id="brief-title" className="font-semibold">{t("title")}</h3>
        <p className="text-sm text-muted-foreground">{t("hint")}</p>
      </div>

      <div className="grid gap-2 rounded-lg border border-dashed border-section-writeup/50 bg-section-writeup/5 p-3">
        <p className="text-sm font-medium">{t("proposal")}</p>
        <p className="-mt-1 text-xs text-pretty text-muted-foreground">{t("proposalAuto")}</p>
        {brief.proposalName ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
            <FileTextIcon className="size-4 text-section-writeup" aria-hidden />
            <span className="min-w-0 flex-1 truncate">{brief.proposalName}</span>
            <span className="text-xs text-muted-foreground">{brief.proposalReadable ? t("readable") : t("pdfOnlyAi")}</span>
            {canEdit && (
              <Button variant="ghost" size="icon-sm" aria-label={t("removeProposal")} disabled={pending} onClick={() => startTransition(async () => void feedback(await removeProposalAction(scope)))}>
                <Trash2Icon />
              </Button>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("noProposal")}</p>
        )}
        {canEdit && (
          <>
            <input ref={file} type="file" hidden accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
            <Button variant="outline" size="sm" className="w-fit" disabled={pending} onClick={() => file.current?.click()}>
              <UploadIcon /> {brief.proposalName ? t("replaceProposal") : t("uploadProposal")}
            </Button>
            <p className="text-xs text-muted-foreground">{t("proposalHint")}</p>
          </>
        )}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="brief-aim">{t("aim")}</Label>
        <Textarea id="brief-aim" rows={3} value={aim} disabled={!canEdit} onChange={(e) => (setAim(e.target.value), touch())} placeholder={t("aimPlaceholder")} />
      </div>

      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">{t("questions")}</legend>
        {questions.map((q, i) => (
          <div key={q.id} className="flex items-start gap-2">
            <span className="mt-2.5 w-8 shrink-0 text-xs font-semibold text-muted-foreground">RQ{i + 1}</span>
            <Textarea rows={1} className="min-h-10" aria-label={t("questionN", { n: i + 1 })} value={q.text} disabled={!canEdit} onChange={(e) => (setQuestions((xs) => xs.map((x) => (x.id === q.id ? { ...x, text: e.target.value } : x))), touch())} />
            {canEdit && (
              <Button variant="ghost" size="icon-sm" className="mt-1" aria-label={t("removeQuestion", { n: i + 1 })} onClick={() => (setQuestions((xs) => xs.filter((x) => x.id !== q.id)), touch())}>
                <XIcon />
              </Button>
            )}
          </div>
        ))}
        {canEdit && (
          <Button variant="ghost" size="sm" className="w-fit" onClick={() => (setQuestions((xs) => [...xs, { id: tempId(), text: "" }]), touch())}>
            <PlusIcon /> {t("addQuestion")}
          </Button>
        )}
      </fieldset>

      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">{t("statements")}</legend>
        <p className="-mt-1 text-xs text-muted-foreground">{t("statementsHint")}</p>
        {statements.map((s, i) => (
          <div key={s.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 sm:grid-cols-[9.5rem_minmax(0,1fr)_auto]">
            <Select value={s.kind} disabled={!canEdit} onValueChange={(v) => (setStatements((xs) => xs.map((x) => (x.id === s.id ? { ...x, kind: v as Kind } : x))), touch())}>
              <SelectTrigger className="w-full max-sm:col-span-2" aria-label={t("kindFor", { n: i + 1 })}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["hypothesis", "proposition", "assumption"] as const).map((k) => (
                  <SelectItem key={k} value={k}>{t(`kind.${k}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Textarea rows={1} className="min-h-10" aria-label={t("statementN", { n: i + 1 })} value={s.text} disabled={!canEdit} onChange={(e) => (setStatements((xs) => xs.map((x) => (x.id === s.id ? { ...x, text: e.target.value } : x))), touch())} />
            {canEdit && (
              <Button variant="ghost" size="icon-sm" className="mt-1" aria-label={t("removeStatement", { n: i + 1 })} onClick={() => (setStatements((xs) => xs.filter((x) => x.id !== s.id)), touch())}>
                <XIcon />
              </Button>
            )}
          </div>
        ))}
        {canEdit && (
          <Button variant="ghost" size="sm" className="w-fit" onClick={() => (setStatements((xs) => [...xs, { id: tempId(), text: "", kind: "hypothesis" }]), touch())}>
            <PlusIcon /> {t("addStatement")}
          </Button>
        )}
      </fieldset>

      {canEdit && (
        <div className="flex items-center gap-3 border-t pt-4">
          <Button onClick={save} disabled={pending || !dirty}>
            {pending && <Loader2Icon className="animate-spin" />}
            {tc("save")}
          </Button>
          {dirty && <span className="text-xs text-muted-foreground">{t("unsaved")}</span>}
        </div>
      )}
    </section>
  );
}
