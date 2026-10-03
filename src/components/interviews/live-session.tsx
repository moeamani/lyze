"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeftIcon, CheckIcon, CircleIcon, Loader2Icon, MicIcon, MicOffIcon, PauseIcon, PlayIcon, ShieldAlertIcon, SquareIcon, TimerIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { useActionFeedback } from "@/components/common/use-action-feedback";
import { addNoteAction, setSessionStatusAction } from "@/server/actions/interviews";
import { sectionSchedule, type GuideDoc } from "@/lib/interviews/guide";
import { parseNote, QUICK_TAGS } from "@/lib/interviews/sessions";
import { formatTimestamp } from "@/lib/interviews/time";
import { cn } from "@/lib/utils";
import { mediaDuration, uploadMedia } from "./media-upload";
import { TAG_STYLE, TagChip } from "./notes-panel";

type Scope = { workspaceId: string; slug: string; projectId: string; studyId: string };
type LiveNote = { id: string; atMs: number | null; tag: string | null; text: string };
type Phase = "ready" | "running" | "paused" | "uploading" | "done";

/** Pick a recording format the browser supports (WebM/Opus in Chromium & Firefox, MP4/AAC in Safari). */
function recorderMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find((m) => MediaRecorder.isTypeSupported(m));
}

/**
 * The live view during a session: a timer (optionally recording audio in the browser), the guide
 * as a checklist with time budgets, and fast timestamped notes with quick tags.
 */
export function LiveSession({
  scope,
  sessionId,
  title,
  backHref,
  guide,
  initialNotes,
  missingConsent,
  canRecord,
  canEdit,
}: {
  scope: Scope;
  sessionId: string;
  title: string;
  backHref: string;
  guide: GuideDoc;
  initialNotes: LiveNote[];
  missingConsent: string[];
  canRecord: boolean;
  canEdit: boolean;
}) {
  const t = useTranslations("live");
  const tn = useTranslations("notes");
  const feedback = useActionFeedback();
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("ready");
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [progress, setProgress] = useState(0);
  const [notes, setNotes] = useState<LiveNote[]>(initialNotes);
  const [text, setText] = useState("");
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [pending, startTransition] = useTransition();

  // Timer: accumulated running time + the current run.
  const base = useRef(0);
  const runStart = useRef<number | null>(null);
  const now = useCallback(() => base.current + (runStart.current !== null ? performance.now() - runStart.current : 0), []);
  const typingAt = useRef<number | null>(null);

  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const stream = useRef<MediaStream | null>(null);
  const audioCtx = useRef<AudioContext | null>(null);

  // Checked-off guide questions survive a reload.
  const storageKey = `lyze:live:${sessionId}:checked`;
  const [checked, setChecked] = useState<Set<string>>(() => new Set());
  const restored = useRef(false);
  useEffect(() => {
    // Read after hydration so server and client render the same first frame.
    if (!restored.current) {
      restored.current = true;
      try {
        const saved = JSON.parse(localStorage.getItem(storageKey) ?? "[]") as string[];
        if (saved.length) queueMicrotask(() => setChecked(new Set(saved)));
      } catch {}
      return;
    }
    try {
      localStorage.setItem(storageKey, JSON.stringify([...checked]));
    } catch {}
  }, [checked, storageKey]);

  useEffect(() => {
    if (phase !== "running") return;
    const id = setInterval(() => setElapsed(now()), 250);
    return () => clearInterval(id);
  }, [phase, now]);

  // Leaving mid-recording would lose the audio.
  useEffect(() => {
    if (!recording) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [recording]);

  useEffect(
    () => () => {
      stream.current?.getTracks().forEach((tr) => tr.stop());
      void audioCtx.current?.close().catch(() => undefined);
    },
    [],
  );

  const meter = (s: MediaStream) => {
    try {
      const ctx = new AudioContext();
      audioCtx.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(s).connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      const tick = () => {
        if (ctx.state === "closed") return;
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (const v of data) sum += ((v - 128) / 128) ** 2;
        setLevel(Math.min(1, Math.sqrt(sum / data.length) * 4));
        requestAnimationFrame(tick);
      };
      tick();
    } catch {}
  };

  const markInProgress = () => startTransition(async () => void (await setSessionStatusAction(scope, sessionId, "in_progress")));

  const start = async (record: boolean) => {
    if (record) {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
        stream.current = s;
        const mimeType = recorderMime();
        const r = new MediaRecorder(s, mimeType ? { mimeType } : undefined);
        chunks.current = [];
        r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
        r.start(1000);
        recorder.current = r;
        setRecording(true);
        meter(s);
      } catch {
        toast.error(t("micDenied"));
        return;
      }
    }
    runStart.current = performance.now();
    setPhase("running");
    if (canEdit) markInProgress();
  };

  const pause = () => {
    base.current = now();
    runStart.current = null;
    setElapsed(base.current);
    if (recorder.current?.state === "recording") recorder.current.pause();
    setPhase("paused");
  };
  const resume = () => {
    runStart.current = performance.now();
    if (recorder.current?.state === "paused") recorder.current.resume();
    setPhase("running");
  };

  const finish = async () => {
    const total = now();
    base.current = total;
    runStart.current = null;
    setElapsed(total);
    const r = recorder.current;
    if (r && r.state !== "inactive") {
      setPhase("uploading");
      const stopped = new Promise<void>((resolve) => (r.onstop = () => resolve()));
      r.stop();
      await stopped;
      stream.current?.getTracks().forEach((tr) => tr.stop());
      void audioCtx.current?.close().catch(() => undefined);
      setRecording(false);
      const blob = new Blob(chunks.current, { type: r.mimeType || "audio/webm" });
      const ext = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm";
      const measured = await mediaDuration(blob);
      const res = await uploadMedia(sessionId, blob, `${title.replace(/[^\p{L}\p{N} _-]/gu, "").trim() || "session"}.${ext}`, measured || total, setProgress);
      if (!res.ok) {
        // Keep the audio: offer it as a download so nothing is lost.
        const url = URL.createObjectURL(blob);
        const a = Object.assign(document.createElement("a"), { href: url, download: `recording.${ext}` });
        a.click();
        toast.error(t("uploadFailed"));
        setPhase("paused");
        return;
      }
    }
    setPhase("done");
    if (canEdit) feedback(await setSessionStatusAction(scope, sessionId, "completed"), t("ended"));
    router.push(backHref);
  };

  const addNote = (quickTag?: string) => {
    const parsed = parseNote(text);
    const tag = quickTag ?? parsed.tag;
    if (!parsed.text && !tag) return;
    // Stamp the moment you started typing, not when you pressed Enter.
    const atMs = phase === "ready" ? null : Math.round(typingAt.current ?? now());
    const tempId = `tmp-${Math.random()}`;
    setNotes((prev) => [{ id: tempId, atMs, tag, text: parsed.text }, ...prev]);
    setText("");
    typingAt.current = null;
    void addNoteAction(scope, sessionId, { text: parsed.text, tag, atMs }).then((result) => {
      if (result.ok) setNotes((prev) => prev.map((n) => (n.id === tempId ? { ...n, id: result.data.id } : n)));
      else {
        setNotes((prev) => prev.filter((n) => n.id !== tempId));
        feedback(result);
      }
    });
  };

  // Alt+1…5 for quick tags, from anywhere on the page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey) return;
      const i = Number(e.key) - 1;
      const tag = QUICK_TAGS[i];
      if (tag) {
        e.preventDefault();
        addNote(tag);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const schedule = useMemo(() => sectionSchedule(guide), [guide]);
  const elapsedMin = elapsed / 60_000;
  const currentSection = phase === "ready" ? -1 : schedule.findIndex((s) => elapsedMin < s.endMin);
  const totalMin = schedule.at(-1)?.endMin ?? 0;

  const guidePanel = (
    <section aria-label={t("guide")} className="grid grid-cols-1 content-start gap-4">
      {guide.intro && <p className="rounded-xl bg-muted/50 p-3 text-sm whitespace-pre-line text-muted-foreground">{guide.intro}</p>}
      {guide.sections.length === 0 && <p className="rounded-2xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">{t("noGuide")}</p>}
      <ol className="grid grid-cols-1 gap-3">
        {guide.sections.map((s, si) => {
          const sch = schedule[si]!;
          const isCurrent = si === currentSection;
          const done = s.questions.length > 0 && s.questions.every((q) => checked.has(q.id));
          return (
            <li key={s.id} className={cn("grid gap-2 rounded-2xl border bg-card p-3 shadow-soft transition-colors", isCurrent && "border-primary/50 ring-2 ring-primary/15", done && "opacity-70")}>
              <div className="flex items-baseline gap-2">
                <h3 className="me-auto font-semibold">{s.title || t("topic", { n: si + 1 })}</h3>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {sch.startMin}–{sch.endMin} {t("min")}
                </span>
              </div>
              {isCurrent && <p className="text-xs font-medium text-primary">{t("now")}</p>}
              <ul className="grid grid-cols-1 gap-1">
                {s.questions.map((q) => {
                  const on = checked.has(q.id);
                  return (
                    <li key={q.id}>
                      <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl px-2 py-2 hover:bg-accent/50">
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() =>
                            setChecked((prev) => {
                              const next = new Set(prev);
                              if (on) next.delete(q.id);
                              else next.add(q.id);
                              return next;
                            })
                          }
                          className="peer sr-only"
                        />
                        <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/40" aria-hidden>
                          {on && <CheckIcon className="size-3.5" />}
                        </span>
                        <span className="grid grid-cols-1 gap-1">
                          <span className={cn("text-sm", on && "text-muted-foreground line-through decoration-muted-foreground/50")}>{q.text}</span>
                          {q.probes.filter(Boolean).length > 0 && !on && (
                            <span className="grid grid-cols-1 gap-0.5 text-xs text-muted-foreground">
                              {q.probes.filter(Boolean).map((p, i) => (
                                <span key={i}>↳ {p}</span>
                              ))}
                            </span>
                          )}
                          {q.note && !on && <span className="text-xs text-muted-foreground italic">{q.note}</span>}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ol>
      {guide.outro && <p className="rounded-xl bg-muted/50 p-3 text-sm whitespace-pre-line text-muted-foreground">{guide.outro}</p>}
    </section>
  );

  const notesPanel = (
    <section aria-label={t("notes")} className="grid grid-cols-1 content-start gap-3">
      <form
        className="grid grid-cols-1 gap-2 rounded-2xl border bg-card p-3 shadow-soft"
        onSubmit={(e) => {
          e.preventDefault();
          addNote();
        }}
      >
        <Input
          value={text}
          onChange={(e) => {
            if (!text && e.target.value && phase !== "ready") typingAt.current = now();
            if (!e.target.value) typingAt.current = null;
            setText(e.target.value);
          }}
          placeholder={t("notePlaceholder")}
          aria-label={tn("add")}
          className="h-11"
          autoComplete="off"
        />
        <div className="flex flex-wrap gap-1" role="group" aria-label={tn("quickTags")}>
          {QUICK_TAGS.map((tag, i) => (
            <button
              key={tag}
              type="button"
              onClick={() => addNote(tag)}
              className={cn("h-9 rounded-lg px-2.5 text-xs font-medium outline-none hover:brightness-95 focus-visible:ring-[3px] focus-visible:ring-ring/40", TAG_STYLE[tag])}
              aria-keyshortcuts={`Alt+${i + 1}`}
            >
              {tn(`tags.${tag}`)}
              <span className="ms-1 hidden text-muted-foreground lg:inline">⌥{i + 1}</span>
            </button>
          ))}
        </div>
      </form>
      <ol className="grid grid-cols-1 gap-2" aria-live="polite" aria-label={tn("list")}>
        {notes.map((n) => (
          <li key={n.id} className={cn("grid gap-1 rounded-xl border bg-card p-3 text-sm", n.id.startsWith("tmp-") && "opacity-60")}>
            <div className="flex items-center gap-2">
              {n.atMs !== null && <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs tabular-nums">{formatTimestamp(n.atMs)}</span>}
              {n.tag && <TagChip tag={n.tag} />}
            </div>
            {n.text && <p className="whitespace-pre-line">{n.text}</p>}
          </li>
        ))}
      </ol>
    </section>
  );

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-4 px-4 py-4 sm:px-6 lg:py-6">
      <header className="sticky top-[var(--header-height)] z-20 -mx-4 grid gap-3 border-b bg-background/90 px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6 md:top-0">
        <div className="flex flex-wrap items-center gap-3">
          <Link href={backHref} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground" aria-label={t("back")}>
            <ArrowLeftIcon className="size-4 rtl:rotate-180" aria-hidden />
            <span className="hidden sm:inline">{t("back")}</span>
          </Link>
          <h1 className="me-auto min-w-0 truncate text-base font-semibold">{title}</h1>
          <div className="flex items-center gap-2" role="timer" aria-label={t("elapsed")}>
            {recording && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-destructive">
                <CircleIcon className={cn("size-2.5 fill-current", phase === "running" && "motion-safe:animate-pulse")} aria-hidden />
                {t("rec")}
              </span>
            )}
            <span className="text-2xl font-semibold tabular-nums">{formatTimestamp(elapsed)}</span>
            {totalMin > 0 && <span className="text-sm text-muted-foreground tabular-nums">/ {t("planned", { minutes: totalMin })}</span>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {phase === "ready" && (
            <>
              {canRecord && canEdit && (
                <Button onClick={() => void start(true)}>
                  <MicIcon />
                  {t("startRecording")}
                </Button>
              )}
              <Button variant={canRecord && canEdit ? "outline" : "default"} onClick={() => void start(false)}>
                <TimerIcon />
                {t("startTimer")}
              </Button>
            </>
          )}
          {phase === "running" && (
            <Button variant="outline" onClick={pause}>
              <PauseIcon />
              {t("pause")}
            </Button>
          )}
          {phase === "paused" && (
            <Button variant="outline" onClick={resume}>
              <PlayIcon />
              {t("resume")}
            </Button>
          )}
          {(phase === "running" || phase === "paused") && (
            <Button onClick={() => setConfirmEnd(true)} disabled={pending}>
              <SquareIcon />
              {t("end")}
            </Button>
          )}
          {phase === "uploading" && (
            <span className="inline-flex items-center gap-2 text-sm" role="status" aria-live="polite">
              <Loader2Icon className="size-4 animate-spin" aria-hidden />
              {t("uploading", { percent: Math.round(progress * 100) })}
            </span>
          )}
          {recording && (
            <span className="ms-auto inline-flex items-center gap-2 text-xs text-muted-foreground" aria-hidden>
              {level > 0.02 ? <MicIcon className="size-4" /> : <MicOffIcon className="size-4" />}
              <span className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                <span className="block h-full rounded-full bg-success transition-[width] duration-100" style={{ width: `${Math.round(level * 100)}%` }} />
              </span>
            </span>
          )}
        </div>
        {missingConsent.length > 0 && (
          <p className="flex items-center gap-2 rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
            <ShieldAlertIcon className="size-4 shrink-0" aria-hidden />
            {t("consentMissing", { codes: missingConsent.join(", ") })}
          </p>
        )}
      </header>

      {/* Phones: notes first, guide one tap away. */}
      <Tabs defaultValue="notes" className="lg:hidden">
        <TabsList className="w-full">
          <TabsTrigger value="notes">{t("notes")}</TabsTrigger>
          <TabsTrigger value="guide">{t("guide")}</TabsTrigger>
        </TabsList>
        <TabsContent value="notes">{notesPanel}</TabsContent>
        <TabsContent value="guide">{guidePanel}</TabsContent>
      </Tabs>
      <div className="hidden gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_24rem]">
        {guidePanel}
        {notesPanel}
      </div>

      <ConfirmDialog
        open={confirmEnd}
        onOpenChange={setConfirmEnd}
        title={t("endTitle")}
        description={recording ? t("endBodyRecording") : t("endBody")}
        confirmLabel={t("end")}
        destructive={false}
        onConfirm={finish}
      />
    </div>
  );
}
