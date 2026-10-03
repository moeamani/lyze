"use client";

import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { FileUpIcon, Loader2Icon, UploadIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useActionFeedback } from "@/components/common/use-action-feedback";
import { importParticipantsAction } from "@/server/actions/interviews";
import { parseParticipantCsv } from "@/lib/interviews/participants";

type Scope = { workspaceId: string; slug: string; projectId: string; studyId: string };

/** Paste or upload a spreadsheet of people (CSV / TSV); previewed before anything is saved. */
export function ImportParticipantsButton({ scope }: { scope: Scope }) {
  const t = useTranslations("participants.import");
  const tc = useTranslations("common");
  const feedback = useActionFeedback();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();
  const preview = useMemo(() => (text.trim() ? parseParticipantCsv(text) : null), [text]);
  const attributeKeys = useMemo(() => [...new Set(preview?.rows.flatMap((r) => Object.keys(r.attributes)) ?? [])], [preview]);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 2_000_000) {
      toast.error(t("tooLarge"));
      return;
    }
    setText(await file.text());
  };

  const submit = () =>
    startTransition(async () => {
      const result = await importParticipantsAction(scope, text);
      if (result.ok) {
        toast.success(t("done", { created: result.data.created, duplicates: result.data.duplicates }));
        setOpen(false);
        setText("");
      } else feedback(result);
    });

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <FileUpIcon />
        {t("button")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent closeLabel={tc("close")} className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{t("title")}</DialogTitle>
            <DialogDescription>{t("hint")}</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="import-text">{t("paste")}</Label>
              <Button asChild variant="ghost" size="sm">
                <label className="cursor-pointer">
                  <UploadIcon />
                  {t("chooseFile")}
                  <input type="file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values" className="sr-only" onChange={(e) => void onFile(e.target.files?.[0])} />
                </label>
              </Button>
            </div>
            <Textarea id="import-text" rows={7} value={text} onChange={(e) => setText(e.target.value)} placeholder={"Name,Email,Age group,Segment\nAda Lovelace,ada@example.com,35-44,Heavy drinker"} className="font-mono text-xs" />
            <p className="text-xs text-muted-foreground">{t("columns")}</p>
            {preview && (
              <div className="rounded-xl bg-muted/60 px-3 py-2 text-sm" role="status" aria-live="polite">
                {preview.rows.length ? t("preview", { count: preview.rows.length }) : t("nothing")}
                {preview.skipped > 0 && <span className="text-muted-foreground"> · {t("skipped", { count: preview.skipped })}</span>}
                {attributeKeys.length > 0 && <p className="mt-1 text-xs text-muted-foreground">{t("attributes", { list: attributeKeys.slice(0, 6).join(", ") })}</p>}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {tc("cancel")}
            </Button>
            <Button onClick={submit} disabled={pending || !preview?.rows.length}>
              {pending && <Loader2Icon className="animate-spin" />}
              {t("submit", { count: preview?.rows.length ?? 0 })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
