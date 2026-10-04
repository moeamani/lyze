"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowDownIcon, ArrowUpIcon, CopyIcon, DownloadIcon, Link2Icon, Loader2Icon, PlusIcon, PrinterIcon, Trash2Icon, FileTextIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { useActionFeedback } from "@/components/common/use-action-feedback";
import { deleteReportAction, reportMarkdownAction, saveReportAction, shareReportAction } from "@/server/actions/reports";
import { BLOCK_TYPES, newBlockId, type Block, type BlockType } from "@/lib/reports/blocks";
import type { ResolvedReport } from "@/server/services/reports";
import { ReportBlock } from "./report-body";

type Scope = { workspaceId: string; slug: string; projectId: string };
type Sources = {
  questions: { studyId: string; study: string; questionId: string; title: string }[];
  quotes: { id: string; text: string; who: string | null; starred: boolean }[];
  themes: { id: string; name: string }[];
  writeups: { id: string; title: string }[];
};

/** Report builder: blocks in a column, each with move/remove; new blocks are picked from the project's data. */
export function ReportEditor({ scope, report, data, sources, back }: { scope: Scope; report: { id: string; title: string; blocks: Block[]; shareToken: string | null }; data: ResolvedReport; sources: Sources; back: string }) {
  const t = useTranslations("reportBuilder");
  const tc = useTranslations("common");
  const feedback = useActionFeedback();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState(report.title);
  const [blocks, setBlocks] = useState(report.blocks);
  const [dirty, setDirty] = useState(false);
  const [adding, setAdding] = useState<BlockType>("text");
  const [pick, setPick] = useState<string>("");
  const [confirm, setConfirm] = useState(false);
  const [token, setToken] = useState(report.shareToken);

  const change = (next: Block[]) => (setBlocks(next), setDirty(true));
  const move = (i: number, d: -1 | 1) => {
    const next = [...blocks];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j]!, next[i]!];
    change(next);
  };
  const save = (then?: () => void) =>
    startTransition(async () => {
      if (feedback(await saveReportAction(scope, report.id, { title, blocks }), t("saved"))) {
        setDirty(false);
        router.refresh();
        then?.();
      }
    });

  const options: { value: string; label: string }[] =
    adding === "question"
      ? sources.questions.map((q) => ({ value: `${q.studyId}:${q.questionId}`, label: `${q.study} · ${q.title}` }))
      : adding === "quote"
        ? sources.quotes.map((q) => ({ value: q.id, label: `${q.starred ? "★ " : ""}${q.who ? `${q.who}: ` : ""}${q.text.slice(0, 90)}` }))
        : adding === "theme"
          ? sources.themes.map((x) => ({ value: x.id, label: x.name }))
          : adding === "writeup"
            ? sources.writeups.map((w) => ({ value: w.id, label: w.title }))
            : [];
  const needsPick = ["question", "quote", "theme", "writeup"].includes(adding);

  const add = () => {
    const id = newBlockId();
    let b: Block | null = null;
    if (adding === "heading") b = { id, type: "heading", text: t("newHeading") };
    else if (adding === "text") b = { id, type: "text", text: "" };
    else if (adding === "joint") b = { id, type: "joint" };
    else if (pick) {
      if (adding === "question") {
        const [studyId, questionId] = pick.split(":") as [string, string];
        b = { id, type: "question", studyId, questionId, note: "" };
      } else if (adding === "quote") b = { id, type: "quote", codingId: pick };
      else if (adding === "theme") b = { id, type: "theme", themeId: pick };
      else if (adding === "writeup") b = { id, type: "writeup", writeupId: pick };
    }
    if (!b) return;
    const next = [...blocks, b];
    setBlocks(next);
    setPick("");
    // Data blocks need a save to be resolved and previewed.
    startTransition(async () => {
      if (feedback(await saveReportAction(scope, report.id, { title, blocks: next }))) {
        setDirty(false);
        router.refresh();
      }
    });
  };

  const shareUrl = token ? `${typeof window === "undefined" ? "" : window.location.origin}/r/${token}` : null;

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_17rem]">
      <div className="grid min-w-0 grid-cols-1 content-start gap-4">
        <Input value={title} onChange={(e) => (setTitle(e.target.value), setDirty(true))} aria-label={t("titleLabel")} className="h-12 text-xl font-semibold" />
        {blocks.length === 0 && <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">{t("emptyReport")}</p>}
        <ol className="grid grid-cols-1 gap-3">
          {blocks.map((b, i) => (
            <li key={b.id} className="group grid grid-cols-[minmax(0,1fr)_auto] gap-2 rounded-xl border border-transparent p-2 hover:border-border">
              <div className="min-w-0">
                {b.type === "heading" ? (
                  <Input value={b.text} onChange={(e) => change(blocks.map((x) => (x.id === b.id ? { ...b, text: e.target.value } : x)))} aria-label={t("headingN", { n: i + 1 })} className="text-lg font-semibold" />
                ) : b.type === "text" ? (
                  <Textarea rows={4} value={b.text} placeholder={t("textPlaceholder")} onChange={(e) => change(blocks.map((x) => (x.id === b.id ? { ...b, text: e.target.value } : x)))} aria-label={t("textN", { n: i + 1 })} />
                ) : (
                  <ReportBlock block={b} data={data} />
                )}
                {b.type === "question" && (
                  <Input className="mt-2" value={b.note} placeholder={t("notePlaceholder")} onChange={(e) => change(blocks.map((x) => (x.id === b.id ? { ...b, note: e.target.value } : x)))} aria-label={t("noteN", { n: i + 1 })} />
                )}
              </div>
              <div className="flex items-start gap-0.5">
                <Button variant="ghost" size="icon-sm" aria-label={t("moveUp")} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUpIcon /></Button>
                <Button variant="ghost" size="icon-sm" aria-label={t("moveDown")} disabled={i === blocks.length - 1} onClick={() => move(i, 1)}><ArrowDownIcon /></Button>
                <Button variant="ghost" size="icon-sm" aria-label={t("removeBlock")} onClick={() => change(blocks.filter((x) => x.id !== b.id))}><Trash2Icon /></Button>
              </div>
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed p-3">
          <Select value={adding} onValueChange={(v) => (setAdding(v as BlockType), setPick(""))}>
            <SelectTrigger size="sm" className="w-40" aria-label={t("blockType")}><SelectValue /></SelectTrigger>
            <SelectContent>
              {BLOCK_TYPES.map((k) => (
                <SelectItem key={k} value={k}>{t(`types.${k}`)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {needsPick && (
            <Select value={pick} onValueChange={setPick}>
              <SelectTrigger size="sm" className="w-full min-w-0 sm:w-80" aria-label={t("pickItem")}><SelectValue placeholder={options.length ? t("pickItem") : t("nothingToPick")} /></SelectTrigger>
              <SelectContent>
                {options.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button size="sm" variant="outline" disabled={pending || (needsPick && !pick)} onClick={add}>
            <PlusIcon /> {t("addBlock")}
          </Button>
        </div>
      </div>

      <aside className="grid content-start gap-3 lg:sticky lg:top-4">
        <Button disabled={pending || !dirty} onClick={() => save()}>
          {pending && <Loader2Icon className="animate-spin" />}
          {dirty ? tc("save") : t("savedState")}
        </Button>
        <div className="grid gap-2 rounded-xl border p-3">
          <label className="flex items-center justify-between gap-2 text-sm font-medium">
            <span className="inline-flex items-center gap-2"><Link2Icon className="size-4" aria-hidden />{t("shareLink")}</span>
            <Switch
              checked={!!token}
              disabled={pending}
              onCheckedChange={(on) =>
                startTransition(async () => {
                  const r = await shareReportAction(scope, report.id, on);
                  if (feedback(r, on ? t("sharedOn") : t("sharedOff")) && r.ok) setToken(r.data);
                })
              }
            />
          </label>
          <p className="text-xs text-muted-foreground">{t("shareHint")}</p>
          {shareUrl && (
            <div className="flex items-center gap-1">
              <Input readOnly value={shareUrl} className="h-8 text-xs" aria-label={t("shareLink")} onFocus={(e) => e.target.select()} />
              <Button variant="ghost" size="icon-sm" aria-label={t("copyLink")} onClick={async () => (await navigator.clipboard?.writeText(shareUrl), feedback({ ok: true, data: null }, t("copied")))}>
                <CopyIcon />
              </Button>
            </div>
          )}
        </div>
        <div className="grid gap-1">
          <Button asChild variant="ghost" className="justify-start">
            <Link href="?preview=pdf">
              <FileTextIcon /> {t("pdfPreview")}
            </Link>
          </Button>
          <Button variant="ghost" className="justify-start" onClick={() => window.print()}>
            <PrinterIcon /> {t("print")}
          </Button>
          <Button
            variant="ghost"
            className="justify-start"
            onClick={() =>
              startTransition(async () => {
                const r = await reportMarkdownAction(scope, report.id);
                if (feedback(r) && r.ok) {
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(new Blob([r.data], { type: "text/markdown;charset=utf-8" }));
                  a.download = `${title.replace(/[^\p{L}\p{N}]+/gu, "-").slice(0, 60) || "report"}.md`;
                  a.click();
                  URL.revokeObjectURL(a.href);
                }
              })
            }
          >
            <DownloadIcon /> {t("markdown")}
          </Button>
          <Button variant="ghost" className="justify-start text-destructive" onClick={() => setConfirm(true)}>
            <Trash2Icon /> {t("delete")}
          </Button>
        </div>
      </aside>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={t("deleteTitle")}
        description={t("deleteBody")}
        confirmLabel={tc("delete")}
        onConfirm={async () => {
          if (feedback(await deleteReportAction(scope, report.id))) router.push(back);
        }}
      />
    </div>
  );
}
