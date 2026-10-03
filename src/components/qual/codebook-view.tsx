"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { unzipSync, strFromU8 } from "fflate";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  DownloadIcon,
  FileUpIcon,
  GitMergeIcon,
  Loader2Icon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  ScissorsIcon,
  StarIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { useActionFeedback } from "@/components/common/use-action-feedback";
import { deleteCodeAction, importCodebookAction, mergeCodesAction, reorderCodeAction, splitCodeAction } from "@/server/actions/coding";
import { codeColorVar, CODE_COLORS } from "@/lib/qual/codes";
import { cn } from "@/lib/utils";
import { CodeDialog, type TreeCode } from "./code-dialog";
import { MemoList, type MemoItem } from "./memo-list";

type Scope = { workspaceId: string; slug: string; projectId: string };
type Passage = { id: string; quote: string; starred: boolean; unitId: string; docKey: string; source: string | null; who: string | null };

export function CodebookView({
  scope,
  base,
  projectId,
  codes,
  selected,
  passages,
  memos,
  canEdit,
  currentUserId,
  role,
}: {
  scope: Scope;
  base: string;
  projectId: string;
  codes: TreeCode[];
  selected: TreeCode | null;
  passages: Passage[];
  memos: MemoItem[];
  canEdit: boolean;
  currentUserId: string;
  role: string;
}) {
  const t = useTranslations("codebook");
  const router = useRouter();
  const feedback = useActionFeedback();
  const [dialog, setDialog] = useState<{ code?: TreeCode; parentId?: string | null } | null>(null);
  const [merging, setMerging] = useState<TreeCode | null>(null);
  const [deleting, setDeleting] = useState<TreeCode | null>(null);
  const [importing, setImporting] = useState(false);
  const [pending, startTransition] = useTransition();
  const total = codes.reduce((s, c) => s + c.count, 0);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <section aria-labelledby="codebook-title" className="grid content-start gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="codebook-title" className="me-auto text-base font-semibold">
            {t("title")} <span className="font-normal text-muted-foreground tabular-nums">{t("summary", { codes: codes.length, passages: total })}</span>
          </h2>
          {canEdit && (
            <Button size="sm" onClick={() => setDialog({})}>
              <PlusIcon />
              {t("new")}
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline">
                <DownloadIcon />
                {t("exchange")}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">{t("exchangeHint")}</DropdownMenuLabel>
              {canEdit && (
                <DropdownMenuItem onSelect={() => setImporting(true)}>
                  <FileUpIcon />
                  {t("import")}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem asChild>
                <a href={`/api/projects/${projectId}/export?format=qdc`} download>
                  <DownloadIcon />
                  {t("exportQdc")}
                </a>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <a href={`/api/projects/${projectId}/export?format=qdpx`} download>
                  <DownloadIcon />
                  {t("exportQdpx")}
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href={`/api/projects/${projectId}/export?format=qdpx-maxqda`} download>
                  <DownloadIcon />
                  {t("exportMaxqda")}
                </a>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {codes.length === 0 ? (
          <div className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            <p className="font-medium text-foreground">{t("emptyTitle")}</p>
            <p className="mt-1">{t("emptyBody")}</p>
          </div>
        ) : (
          <ul className="grid gap-0.5 rounded-2xl border bg-card p-2 shadow-soft" aria-label={t("tree")}>
            {codes.map((c) => {
              const siblings = codes.filter((x) => x.parentId === c.parentId);
              const sibIndex = siblings.indexOf(c);
              return (
                <li key={c.id} className={cn("group flex items-center gap-1 rounded-lg", selected?.id === c.id && "bg-accent-soft/70")} style={{ paddingInlineStart: `${c.depth * 1.1}rem` }}>
                  <Link href={`${base}/codebook?code=${c.id}`} scroll={false} className="flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-lg px-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40" aria-current={selected?.id === c.id ? "true" : undefined}>
                    <span className="size-3 shrink-0 rounded-full" style={{ background: codeColorVar(c.color) }} aria-hidden />
                    <span className="grid min-w-0 flex-1">
                      <span className="truncate font-medium">{c.name}</span>
                      {c.definition && <span className="truncate text-xs text-muted-foreground">{c.definition}</span>}
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">{c.count}</span>
                  </Link>
                  {canEdit && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" className="opacity-60 group-hover:opacity-100" aria-label={t("actionsFor", { name: c.name })}>
                          <MoreHorizontalIcon />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setDialog({ code: c })}>
                          <PencilIcon />
                          {t("edit")}
                        </DropdownMenuItem>
                        {c.depth < 3 && (
                          <DropdownMenuItem onSelect={() => setDialog({ parentId: c.id })}>
                            <PlusIcon />
                            {t("addChild")}
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem disabled={sibIndex <= 0 || pending} onSelect={() => startTransition(async () => void feedback(await reorderCodeAction(scope, c.id, "up")))}>
                          <ArrowUpIcon />
                          {t("moveUp")}
                        </DropdownMenuItem>
                        <DropdownMenuItem disabled={sibIndex >= siblings.length - 1 || pending} onSelect={() => startTransition(async () => void feedback(await reorderCodeAction(scope, c.id, "down")))}>
                          <ArrowDownIcon />
                          {t("moveDown")}
                        </DropdownMenuItem>
                        <DropdownMenuItem disabled={codes.length < 2} onSelect={() => setMerging(c)}>
                          <GitMergeIcon />
                          {t("merge")}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(c)}>
                          <Trash2Icon />
                          {t("delete")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-label={t("detail")} className="grid content-start gap-4">
        {selected ? (
          <CodeDetail scope={scope} base={base} code={selected} passages={passages} memos={memos} canEdit={canEdit} currentUserId={currentUserId} role={role} codesCount={codes.length} />
        ) : (
          <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">{codes.length ? t("pickOne") : t("howItWorks")}</p>
        )}
      </section>

      {dialog && <CodeDialog scope={scope} open onOpenChange={(o) => !o && setDialog(null)} codes={codes} code={dialog.code} parentId={dialog.parentId} />}
      {merging && <MergeDialog scope={scope} code={merging} codes={codes} onClose={() => setMerging(null)} onMerged={(target) => router.push(`${base}/codebook?code=${target}`)} />}
      {importing && <ImportDialog scope={scope} onClose={() => setImporting(false)} />}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={t("deleteTitle", { name: deleting?.name ?? "" })}
        description={t("deleteBody", { count: deleting?.count ?? 0 })}
        confirmLabel={t("delete")}
        onConfirm={async () => {
          if (deleting && feedback(await deleteCodeAction(scope, deleting.id), t("deleted"))) router.push(`${base}/codebook`);
        }}
      />
    </div>
  );
}

function CodeDetail({ scope, base, code, passages, memos, canEdit, currentUserId, role, codesCount }: { scope: Scope; base: string; code: TreeCode; passages: Passage[]; memos: MemoItem[]; canEdit: boolean; currentUserId: string; role: string; codesCount: number }) {
  const t = useTranslations("codebook");
  const router = useRouter();
  const feedback = useActionFeedback();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [splitName, setSplitName] = useState("");
  const [pending, startTransition] = useTransition();
  return (
    <>
      <div className="grid gap-2 rounded-2xl border bg-card p-4 shadow-soft">
        <div className="flex items-center gap-2">
          <span className="size-3.5 rounded-full" style={{ background: codeColorVar(code.color) }} aria-hidden />
          <h3 className="text-lg font-semibold">{code.name}</h3>
        </div>
        {code.path.length > 1 && <p className="text-xs text-muted-foreground">{code.path.join(" › ")}</p>}
        <p className={cn("text-sm", !code.definition && "text-muted-foreground")}>{code.definition ?? t("noDefinition")}</p>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button asChild size="sm" variant="outline">
            <Link href={`${base}/quotes?code=${code.id}`}>{t("seeQuotes", { count: code.count })}</Link>
          </Button>
          <Button asChild size="sm" variant="ghost">
            <Link href={`${base}/search?code=${code.id}`}>{t("searchIn")}</Link>
          </Button>
        </div>
      </div>

      <section aria-labelledby="passages-title" className="grid gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 id="passages-title" className="me-auto text-sm font-semibold">
            {t("passages", { count: passages.length })}
          </h3>
          {canEdit && picked.size > 0 && (
            <form
              className="flex flex-wrap items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!splitName.trim()) return;
                startTransition(async () => {
                  const result = await splitCodeAction(scope, code.id, [...picked], { name: splitName, color: CODE_COLORS[codesCount % CODE_COLORS.length] });
                  if (feedback(result, t("split", { count: picked.size })) && result.ok) {
                    setPicked(new Set());
                    setSplitName("");
                    router.push(`${base}/codebook?code=${result.data}`);
                  }
                });
              }}
            >
              <Input value={splitName} onChange={(e) => setSplitName(e.target.value)} placeholder={t("splitName")} aria-label={t("splitName")} className="h-9 w-44" />
              <Button size="sm" type="submit" disabled={pending || !splitName.trim()}>
                {pending ? <Loader2Icon className="animate-spin" /> : <ScissorsIcon />}
                {t("splitButton", { count: picked.size })}
              </Button>
            </form>
          )}
        </div>
        {canEdit && passages.length > 1 && picked.size === 0 && <p className="text-xs text-muted-foreground">{t("splitHint")}</p>}
        {passages.length === 0 ? (
          <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">{t("noPassages")}</p>
        ) : (
          <ul className="grid gap-2">
            {passages.map((p) => (
              <li key={p.id} className="flex gap-3 rounded-xl border bg-card p-3 text-sm">
                {canEdit && (
                  <input
                    type="checkbox"
                    className="mt-1 size-4 shrink-0 accent-primary"
                    checked={picked.has(p.id)}
                    aria-label={t("pick")}
                    onChange={() =>
                      setPicked((s) => {
                        const n = new Set(s);
                        if (n.has(p.id)) n.delete(p.id);
                        else n.add(p.id);
                        return n;
                      })
                    }
                  />
                )}
                <div className="grid min-w-0 gap-1">
                  <p className="text-pretty">“{p.quote}”</p>
                  <Link href={`${base}/coding?doc=${encodeURIComponent(p.docKey)}#u-${p.unitId}`} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline">
                    {p.starred && <StarIcon className="size-3 fill-current text-warning" aria-hidden />}
                    {[p.who, p.source ?? t("surveyAnswer")].filter(Boolean).join(" · ")}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <MemoList scope={scope} target={{ targetType: "code", targetId: code.id }} memos={memos} canWrite={canEdit} currentUserId={currentUserId} role={role} title={t("memos")} />
    </>
  );
}

function MergeDialog({ scope, code, codes, onClose, onMerged }: { scope: Scope; code: TreeCode; codes: TreeCode[]; onClose: () => void; onMerged: (target: string) => void }) {
  const t = useTranslations("codebook");
  const tc = useTranslations("common");
  const feedback = useActionFeedback();
  const [target, setTarget] = useState("");
  const [pending, startTransition] = useTransition();
  // Can't merge into its own children.
  const options = codes.filter((c) => c.id !== code.id && !(c.path.length > code.path.length && c.path.slice(0, code.path.length).join("\u0000") === code.path.join("\u0000")));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent closeLabel={tc("close")} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("mergeTitle", { name: code.name })}</DialogTitle>
          <DialogDescription>{t("mergeHint")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="merge-target">{t("mergeInto")}</Label>
          <Select value={target} onValueChange={setTarget}>
            <SelectTrigger id="merge-target" className="w-full">
              <SelectValue placeholder={t("chooseCode")} />
            </SelectTrigger>
            <SelectContent>
              {options.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.path.join(" › ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {tc("cancel")}
          </Button>
          <Button
            disabled={!target || pending}
            onClick={() =>
              startTransition(async () => {
                if (feedback(await mergeCodesAction(scope, [code.id], target), t("merged"))) {
                  onClose();
                  onMerged(target);
                }
              })
            }
          >
            {pending && <Loader2Icon className="animate-spin" />}
            {t("merge")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Import a REFI-QDA codebook: .qdc, a project.qde, or a whole .qdpx (the codebook part is used). */
function ImportDialog({ scope, onClose }: { scope: Scope; onClose: () => void }) {
  const t = useTranslations("codebook");
  const tc = useTranslations("common");
  const feedback = useActionFeedback();
  const [xml, setXml] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [pending, startTransition] = useTransition();
  const read = async (file: File | undefined) => {
    if (!file) return;
    setFileName(file.name);
    try {
      if (/\.qdpx$/i.test(file.name)) {
        const files = unzipSync(new Uint8Array(await file.arrayBuffer()));
        const qde = Object.keys(files).find((f) => /\.qde$/i.test(f));
        if (!qde) throw new Error("no project.qde");
        setXml(strFromU8(files[qde]!));
      } else setXml(await file.text());
    } catch {
      toast.error(t("importUnreadable"));
      setXml(null);
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent closeLabel={tc("close")} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("importTitle")}</DialogTitle>
          <DialogDescription>{t("importHint")}</DialogDescription>
        </DialogHeader>
        <label className="grid cursor-pointer place-items-center gap-2 rounded-2xl border-2 border-dashed p-6 text-center text-sm hover:bg-accent/40">
          <FileUpIcon className="size-6 text-muted-foreground" aria-hidden />
          <span>{fileName || t("chooseFile")}</span>
          <input type="file" accept=".qdc,.qde,.qdpx,.xml" className="sr-only" onChange={(e) => void read(e.target.files?.[0])} />
        </label>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {tc("cancel")}
          </Button>
          <Button
            disabled={!xml || pending}
            onClick={() =>
              startTransition(async () => {
                const result = await importCodebookAction(scope, xml!);
                if (feedback(result, result.ok ? t("imported", { created: result.data.created, total: result.data.total }) : undefined)) onClose();
              })
            }
          >
            {pending && <Loader2Icon className="animate-spin" />}
            {t("import")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
