"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { FileTextIcon, Loader2Icon, UploadCloudIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useActionFeedback } from "@/components/common/use-action-feedback";
import { importTranscriptAction, importTranscriptSessionAction } from "@/server/actions/interviews";
import { docxText } from "@/lib/docx";
import { parseTranscript } from "@/lib/interviews/transcript";
import { SPEAKER_ROLES, type SpeakerRole } from "@/lib/interviews/sessions";
import { suggestRoles, suggestSpeakerNames } from "@/lib/interviews/speaker-names";

type Scope = { workspaceId: string; slug: string; projectId: string; studyId: string };
type Item = { file: string; title: string; text: string; segments: number; counts: Record<string, number> };

const ACCEPT = ".docx,.txt,.md,.vtt,.srt,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/vtt";

/** Text of a transcript file: Word documents are read in the browser; the rest are text already. */
async function readTranscriptFile(f: File): Promise<string> {
  if (/\.docx$/i.test(f.name)) return docxText(new Uint8Array(await f.arrayBuffer()));
  return f.text();
}

function toItem(file: string, text: string): Item {
  const parsed = parseTranscript(text);
  const counts: Record<string, number> = {};
  for (const s of parsed.segments) if (s.speaker) counts[s.speaker] = (counts[s.speaker] ?? 0) + 1;
  // The document's own heading if it has one, else the file name (without "Copy of").
  const fromFile = file.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").replace(/^copy of\s+/i, "").trim();
  return { file, title: parsed.title ?? fromFile, text, segments: parsed.segments.length, counts };
}

/**
 * Import transcripts you already have (Word, text, captions). With `sessionId` it fills that
 * session; without, every file becomes a new session. Before importing, people confirm who is who:
 * spelling variants are merged, roles set, and participant voices can become study participants.
 */
export function TranscriptImportDialog({ scope, sessionId, open, onOpenChange }: { scope: Scope; sessionId?: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useTranslations("sessionPage.import");
  const tr = useTranslations("sessionPage.speakers");
  const tc = useTranslations("common");
  const feedback = useActionFeedback();
  const router = useRouter();
  const bulk = !sessionId;
  const [items, setItems] = useState<Item[]>([]);
  const [paste, setPaste] = useState("");
  const [names, setNames] = useState<Record<string, string>>({});
  const [roles, setRoles] = useState<Record<string, SpeakerRole>>({});
  const [addParticipants, setAddParticipants] = useState(true);
  const [kind, setKind] = useState<"interview" | "focus_group">("interview");
  const [progress, setProgress] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [pending, startTransition] = useTransition();

  // Every label across the files, most frequent first.
  const counts = useMemo(() => {
    const all: Record<string, number> = {};
    for (const it of items) for (const [k, v] of Object.entries(it.counts)) all[k] = (all[k] ?? 0) + v;
    return all;
  }, [items]);
  const nameOf = (label: string) => names[label] ?? label;
  // Grouped by person (most turns first), so merged spellings sit under the name they join. Fixed
  // when the review opens, so rows don't jump while names are edited.
  const [labels, setLabels] = useState<string[]>([]);
  const finalNames = [...new Set(labels.map(nameOf))];

  const review = (next: Item[]) => {
    const all: Record<string, number> = {};
    for (const it of next) for (const [k, v] of Object.entries(it.counts)) all[k] = (all[k] ?? 0) + v;
    const merged = suggestSpeakerNames(all);
    setNames(merged);
    const total: Record<string, number> = {};
    for (const [label, n] of Object.entries(all)) total[merged[label]!] = (total[merged[label]!] ?? 0) + n;
    setLabels(
      Object.keys(all).sort((a, b) => {
        const na = merged[a]!;
        const nb = merged[b]!;
        return total[nb]! - total[na]! || na.localeCompare(nb) || Number(nb === b) - Number(na === a) || all[b]! - all[a]!;
      }),
    );
    // Roles follow the order people first speak in (the first voice usually leads).
    const order: string[] = [];
    for (const it of next) for (const k of Object.keys(it.counts)) if (!order.includes(merged[k]!)) order.push(merged[k]!);
    setRoles(suggestRoles(order));
    const voices = order.filter((n) => !/^(multiple|all|one of)/i.test(n)).length;
    setKind(voices > 2 ? "focus_group" : "interview");
    setItems(next);
  };

  const reset = () => {
    setItems([]);
    setPaste("");
    setNames({});
    setLabels([]);
    setRoles({});
    setProgress(null);
  };

  const pick = async (files: FileList | null) => {
    if (!files?.length) return;
    setReading(true);
    try {
      const read = await Promise.all([...files].slice(0, bulk ? 50 : 1).map(async (f) => toItem(f.name, await readTranscriptFile(f))));
      review(bulk ? [...items, ...read] : read);
    } catch {
      feedback({ ok: false, error: "invalid" });
    } finally {
      setReading(false);
    }
  };

  const plan = () => ({ names, roles: Object.fromEntries(finalNames.map((n) => [n, roles[n] ?? "participant"])), addParticipants });

  const submit = () =>
    startTransition(async () => {
      if (!bulk) {
        const result = await importTranscriptAction(scope, sessionId!, items[0]!.text, plan());
        if (feedback(result, result.ok ? t("done", { count: result.data.segments }) : undefined)) {
          onOpenChange(false);
          reset();
          router.refresh();
        }
        return;
      }
      let done = 0;
      for (const it of items) {
        setProgress(t("importing", { done: done + 1, total: items.length }));
        const result = await importTranscriptSessionAction(scope, { title: it.title, kind, text: it.text }, plan());
        if (!feedback(result)) {
          setProgress(null);
          router.refresh();
          return;
        }
        done++;
      }
      feedback({ ok: true, data: undefined }, t("doneSessions", { count: done }));
      onOpenChange(false);
      reset();
      router.refresh();
    });

  const reviewing = items.length > 0;
  const empty = reviewing && items.every((it) => it.segments === 0);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !pending) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent closeLabel={tc("close")} className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{bulk ? t("bulkTitle") : t("title")}</DialogTitle>
          <DialogDescription>{reviewing ? t("reviewHint") : bulk ? t("bulkHint") : t("hint")}</DialogDescription>
        </DialogHeader>

        {!reviewing ? (
          <div className="grid grid-cols-1 gap-3">
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed p-6 text-center text-sm hover:bg-muted/40">
              {reading ? <Loader2Icon className="size-6 animate-spin text-muted-foreground" /> : <UploadCloudIcon className="size-6 text-muted-foreground" />}
              <span className="font-medium">{bulk ? t("chooseFiles") : t("file")}</span>
              <span className="text-xs text-pretty text-muted-foreground">{t("formats")}</span>
              <input type="file" accept={ACCEPT} multiple={bulk} className="sr-only" aria-label={bulk ? t("chooseFiles") : t("file")} onChange={(e) => void pick(e.target.files)} />
            </label>
            {!bulk && (
              <div className="grid gap-2">
                <Label htmlFor="transcript-text">{t("paste")}</Label>
                <Textarea id="transcript-text" rows={7} value={paste} onChange={(e) => setPaste(e.target.value)} className="font-mono text-xs" placeholder={"12 (00:45:35) - Jane: Thanks for joining…\n13 (00:46:02) - Ali: Happy to be here."} />
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5">
            <ul className="grid gap-2">
              {items.map((it, i) => (
                <li key={`${it.file}-${i}`} className="flex flex-wrap items-center gap-2 rounded-lg border p-2">
                  <FileTextIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  {bulk ? (
                    <Input aria-label={t("sessionTitle")} className="h-8 min-w-0 flex-1 basis-48" value={it.title} onChange={(e) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
                  ) : (
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{it.file}</span>
                  )}
                  <span className="text-xs text-muted-foreground">{t("fileSummary", { segments: it.segments, speakers: Object.keys(it.counts).length })}</span>
                  {bulk && (
                    <Button variant="ghost" size="icon" className="size-8" aria-label={t("removeFile", { name: it.file })} onClick={() => review(items.filter((_, j) => j !== i))}>
                      <XIcon />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
            {bulk && (
              <label className="flex w-fit cursor-pointer items-center gap-1.5 text-sm font-medium text-primary underline-offset-2 hover:underline">
                <UploadCloudIcon className="size-4" /> {t("addMore")}
                <input type="file" accept={ACCEPT} multiple className="sr-only" onChange={(e) => void pick(e.target.files)} />
              </label>
            )}

            {empty && <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{t("nothingFound")}</p>}

            {labels.length > 0 && (
              <div className="grid gap-2">
                <div>
                  <h3 className="text-sm font-semibold">{t("speakersTitle")}</h3>
                  <p className="text-xs text-pretty text-muted-foreground">{t("speakersHint")}</p>
                </div>
                <ul className="grid gap-1.5">
                  {labels.map((label) => {
                    const name = nameOf(label);
                    const merged = name !== label;
                    return (
                      <li key={label} className="grid grid-cols-1 items-center gap-2 rounded-lg border p-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_9rem]">
                        <span className="min-w-0 truncate text-sm">
                          {label} <span className="text-xs text-muted-foreground">· {t("turns", { count: counts[label]! })}</span>
                          {merged && <span className="block text-xs text-section-coding">{t("mergedInto", { name })}</span>}
                        </span>
                        <Input aria-label={t("nameFor", { label })} className="h-8" value={name} onChange={(e) => setNames((m) => ({ ...m, [label]: e.target.value }))} />
                        <Select value={roles[name] ?? "participant"} onValueChange={(v) => setRoles((r) => ({ ...r, [name]: v as SpeakerRole }))}>
                          <SelectTrigger size="sm" className="h-8 w-full" aria-label={t("roleFor", { name })}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {SPEAKER_ROLES.map((r) => (
                              <SelectItem key={r} value={r}>
                                {tr(`role_${r}`)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            <div className="grid gap-3 rounded-lg bg-muted/40 p-3">
              {bulk && (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label htmlFor="import-kind">{t("kind")}</Label>
                  <Select value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
                    <SelectTrigger id="import-kind" size="sm" className="h-8 w-44">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="interview">{t("kindInterview")}</SelectItem>
                      <SelectItem value="focus_group">{t("kindFocusGroup")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="flex items-start justify-between gap-3">
                <div className="grid gap-0.5">
                  <Label htmlFor="add-participants">{t("addParticipants")}</Label>
                  <p className="text-xs text-pretty text-muted-foreground">{t("addParticipantsHint")}</p>
                </div>
                <Switch id="add-participants" checked={addParticipants} onCheckedChange={setAddParticipants} />
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="items-center gap-2">
          {progress && <span className="me-auto text-xs text-muted-foreground">{progress}</span>}
          {reviewing ? (
            <Button variant="outline" disabled={pending} onClick={reset}>
              {t("back")}
            </Button>
          ) : (
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {tc("cancel")}
            </Button>
          )}
          {reviewing ? (
            <Button disabled={pending || empty || items.some((it) => !it.segments)} onClick={submit}>
              {pending && <Loader2Icon className="animate-spin" />}
              {bulk ? t("submitBulk", { count: items.length }) : t("submit")}
            </Button>
          ) : (
            !bulk && (
              <Button disabled={!paste.trim()} onClick={() => review([toItem(t("pasted"), paste)])}>
                {t("next")}
              </Button>
            )
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
