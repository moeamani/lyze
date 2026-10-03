"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { FileTextIcon, Loader2Icon, MicIcon, SparklesIcon, UploadCloudIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useActionFeedback } from "@/components/common/use-action-feedback";
import { importTranscriptAction } from "@/server/actions/interviews";
import { generateAction } from "@/server/actions/create";
import { useCanPlaceholder } from "@/components/common/ai-mode";
import { cn } from "@/lib/utils";

type Scope = { workspaceId: string; slug: string; projectId: string; studyId: string };

/** Duration of a local media file, read by the browser before upload (0 when unknown). */
export function mediaDuration(file: Blob): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const el = document.createElement(file.type.startsWith("video/") ? "video" : "audio");
    el.preload = "metadata";
    const done = (ms: number) => {
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(ms) && ms > 0 ? ms : 0);
    };
    el.onloadedmetadata = () => {
      // MediaRecorder WebM files report Infinity until the browser scans to the end.
      if (el.duration === Infinity) {
        el.ontimeupdate = () => {
          el.ontimeupdate = null;
          done(el.duration * 1000);
        };
        el.currentTime = 1e9;
      } else done(el.duration * 1000);
    };
    el.onerror = () => done(0);
    setTimeout(() => done(0), 8000);
    el.src = url;
  });
}

/** Upload with progress (fetch has no upload progress). Resolves with the parsed JSON body. */
export function uploadMedia(sessionId: string, file: Blob, name: string, durationMs: number, onProgress: (fraction: number) => void) {
  return new Promise<{ ok: boolean; status: number; body: { error?: string; maxMb?: number } }>((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/sessions/${sessionId}/media`);
    xhr.setRequestHeader("content-type", file.type || "application/octet-stream");
    xhr.setRequestHeader("x-file-name", encodeURIComponent(name));
    xhr.setRequestHeader("x-duration-ms", String(Math.round(durationMs)));
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      let body = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {}
      resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, body });
    };
    xhr.onerror = () => resolve({ ok: false, status: 0, body: {} });
    xhr.send(file);
  });
}

export function useMediaUpload(sessionId: string) {
  const t = useTranslations("sessionPage.upload");
  const router = useRouter();
  const [progress, setProgress] = useState<number | null>(null);
  const upload = async (file: File | Blob, name: string) => {
    if (file.type && !/^(audio|video)\//.test(file.type)) {
      toast.error(t("wrongType"));
      return false;
    }
    setProgress(0);
    const duration = await mediaDuration(file);
    const res = await uploadMedia(sessionId, file, name, duration, setProgress);
    setProgress(null);
    if (!res.ok) {
      toast.error(res.status === 413 ? t("tooLarge", { mb: res.body.maxMb ?? 500 }) : res.body.error === "fileType" ? t("wrongType") : t("failed"));
      return false;
    }
    toast.success(t("done"));
    router.refresh();
    return true;
  };
  return { upload, progress };
}

/** What to do with a conversation that has no recording or transcript yet. */
export function MediaStart({ scope, sessionId, liveHref, canEdit }: { scope: Scope; sessionId: string; liveHref: string; canEdit: boolean }) {
  const t = useTranslations("sessionPage.upload");
  const { upload, progress } = useMediaUpload(sessionId);
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  if (!canEdit) return <p className="rounded-2xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">{t("nothingYet")}</p>;

  return (
    <div className="grid grid-cols-1 gap-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const file = e.dataTransfer.files[0];
          if (file) void upload(file, file.name);
        }}
        className={cn("grid place-items-center gap-3 rounded-2xl border-2 border-dashed bg-card/60 px-6 py-10 text-center transition-colors", over && "border-primary bg-accent-soft/40")}
      >
        {progress !== null ? (
          <div className="grid grid-cols-1 w-full max-w-xs gap-2" role="status" aria-live="polite">
            <p className="text-sm font-medium">{progress < 1 ? t("uploading", { percent: Math.round(progress * 100) }) : t("processing")}</p>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
          </div>
        ) : (
          <>
            <span className="grid grid-cols-1 size-12 place-items-center rounded-2xl bg-accent-soft text-accent-soft-foreground">
              <UploadCloudIcon className="size-6" aria-hidden />
            </span>
            <div className="grid grid-cols-1 gap-1">
              <p className="font-medium">{t("title")}</p>
              <p className="text-sm text-muted-foreground">{t("hint")}</p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={() => input.current?.click()}>
                <UploadCloudIcon />
                {t("choose")}
              </Button>
              <Button asChild variant="outline">
                <Link href={liveHref}>
                  <MicIcon />
                  {t("record")}
                </Link>
              </Button>
              <ImportTranscriptButton scope={scope} sessionId={sessionId} />
              <SampleTranscriptButton scope={scope} sessionId={sessionId} />
            </div>
            <input
              ref={input}
              type="file"
              accept="audio/*,video/*"
              className="sr-only"
              aria-label={t("choose")}
              data-testid="media-input"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void upload(file, file.name);
                e.target.value = "";
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}

export function ImportTranscriptButton({ scope, sessionId }: { scope: Scope; sessionId: string }) {
  const t = useTranslations("sessionPage.import");
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <FileTextIcon />
        {t("button")}
      </Button>
      <ImportTranscriptDialog scope={scope} sessionId={sessionId} open={open} onOpenChange={setOpen} />
    </>
  );
}

export function ImportTranscriptDialog({ scope, sessionId, open, onOpenChange }: { scope: Scope; sessionId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useTranslations("sessionPage.import");
  const tc = useTranslations("common");
  const feedback = useActionFeedback();
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={tc("close")} className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("hint")}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-2">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="transcript-text">{t("paste")}</Label>
            <Button asChild variant="ghost" size="sm">
              <label className="cursor-pointer">
                <UploadCloudIcon />
                {t("file")}
                <input
                  type="file"
                  accept=".vtt,.srt,.txt,text/vtt,text/plain"
                  className="sr-only"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (f) setText(await f.text());
                  }}
                />
              </label>
            </Button>
          </div>
          <Textarea id="transcript-text" rows={9} value={text} onChange={(e) => setText(e.target.value)} className="font-mono text-xs" placeholder={"WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nJane: Thanks for joining…"} />
          <p className="text-xs text-muted-foreground">{t("formats")}</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {tc("cancel")}
          </Button>
          <Button
            disabled={pending || !text.trim()}
            onClick={() =>
              startTransition(async () => {
                const result = await importTranscriptAction(scope, sessionId, text);
                if (feedback(result, result.ok ? t("done", { count: result.data.segments }) : undefined)) {
                  onOpenChange(false);
                  setText("");
                }
              })
            }
          >
            {pending && <Loader2Icon className="animate-spin" />}
            {t("submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** "Generate sample": a made-up transcript built from the guide, for trying coding before real interviews. */
function SampleTranscriptButton({ scope, sessionId }: { scope: Scope; sessionId: string }) {
  const t = useTranslations("create");
  const allowed = useCanPlaceholder();
  const feedback = useActionFeedback();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  if (!allowed) return null;
  return (
    <Button
      variant="ghost"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const r = await generateAction({ ...scope, sessionId }, "transcript");
          if (feedback(r, r.ok ? t("generated.transcript", { count: Number(r.data.count ?? 0) }) : undefined)) router.refresh();
        })
      }
    >
      {pending ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
      {t("sampleTranscript")}
    </Button>
  );
}
