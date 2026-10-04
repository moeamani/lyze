"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  AlertCircleIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  DownloadIcon,
  FileTextIcon,
  KeyboardIcon,
  Loader2Icon,
  LocateFixedIcon,
  MoreHorizontalIcon,
  PencilIcon,
  RefreshCwIcon,
  SearchIcon,
  StickyNoteIcon,
  UploadCloudIcon,
  UsersIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useActionFeedback } from "@/components/common/use-action-feedback";
import { retranscribeAction, updateSegmentAction } from "@/server/actions/interviews";
import { activeSegmentIndex } from "@/lib/interviews/transcript";
import { formatTimestamp } from "@/lib/interviews/time";
import type { Speakers, TranscriptStatus } from "@/lib/interviews/sessions";
import { cn } from "@/lib/utils";
import { ImportTranscriptButton, ImportTranscriptDialog, MediaStart, useMediaUpload } from "./media-upload";
import { NotesPanel, type NoteItem } from "./notes-panel";
import { SpeakersDialog } from "./speakers-dialog";

type Scope = { workspaceId: string; slug: string; projectId: string; studyId: string };
export type SegmentItem = { id: string; speaker: string | null; startMs: number | null; endMs: number | null; text: string };

export type WorkspaceProps = {
  scope: Scope;
  sessionId: string;
  liveHref: string;
  conversation: boolean;
  media: { url: string; mime: string; name: string } | null;
  transcript: { status: TranscriptStatus; provider: string; error: string | null; speakers: Speakers } | null;
  segments: SegmentItem[];
  notes: NoteItem[];
  participants: { id: string; code: string }[];
  canEdit: boolean;
  canAnalyze: boolean;
  currentUserId: string;
  /** Server-rendered sidebar tabs. */
  details: React.ReactNode;
  guide: React.ReactNode;
  /** Field notes / diary editor (written kinds). */
  editor?: React.ReactNode;
};

const RATES = [0.75, 1, 1.25, 1.5, 2];

export function SessionWorkspace(props: WorkspaceProps) {
  const { scope, sessionId, media, transcript, segments, canEdit } = props;
  const t = useTranslations("sessionPage");
  const router = useRouter();
  const mediaRef = useRef<HTMLMediaElement | null>(null);
  const [timeMs, setTimeMs] = useState(0);
  const [rate, setRate] = useState(1);
  const [notes, setNotes] = useState(props.notes);
  const [prevNotes, setPrevNotes] = useState(props.notes);
  // Server refreshes (after a delete, say) replace the local list.
  if (prevNotes !== props.notes) {
    setPrevNotes(props.notes);
    setNotes(props.notes);
  }

  const processing = transcript?.status === "processing";
  // While transcription runs, refresh until it finishes.
  useEffect(() => {
    if (!processing) return;
    const id = setInterval(() => router.refresh(), 2500);
    return () => clearInterval(id);
  }, [processing, router]);

  const seek = useCallback((ms: number, play = true) => {
    const el = mediaRef.current;
    if (!el) return;
    el.currentTime = ms / 1000;
    setTimeMs(ms);
    if (play) void el.play().catch(() => undefined);
  }, []);

  // Player shortcuts when not typing: k / space play-pause, j / l jump 5 s.
  useEffect(() => {
    if (!media) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || target.closest("input, textarea, select, [contenteditable], [role=dialog], [role=menu]")) return;
      const el = mediaRef.current;
      if (!el) return;
      if (e.key === "k" || (e.key === " " && !target.closest("button, a, audio, video"))) {
        e.preventDefault();
        if (el.paused) void el.play();
        else el.pause();
      } else if (e.key === "j") seek(Math.max(0, el.currentTime * 1000 - 5000), !el.paused);
      else if (e.key === "l") seek(el.currentTime * 1000 + 5000, !el.paused);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [media, seek]);

  const hasTranscript = !!transcript && transcript.status === "ready" && segments.length > 0;
  const showStart = props.conversation && !media && !transcript;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="grid grid-cols-1 min-w-0 content-start gap-4">
        {media && (
          <div className="sticky top-[calc(var(--header-height)+0.5rem)] z-10 grid gap-2 rounded-2xl border bg-card/95 p-3 shadow-soft backdrop-blur md:top-4">
            {media.mime.startsWith("video/") ? (
              <video
                ref={(el) => void (mediaRef.current = el)}
                src={media.url}
                controls
                preload="metadata"
                className="max-h-72 w-full rounded-xl bg-black"
                onTimeUpdate={(e) => setTimeMs(e.currentTarget.currentTime * 1000)}
                onSeeked={(e) => setTimeMs(e.currentTarget.currentTime * 1000)}
              />
            ) : (
              <audio
                ref={(el) => void (mediaRef.current = el)}
                src={media.url}
                controls
                preload="metadata"
                className="w-full"
                aria-label={t("player")}
                onTimeUpdate={(e) => setTimeMs(e.currentTarget.currentTime * 1000)}
                onSeeked={(e) => setTimeMs(e.currentTarget.currentTime * 1000)}
              />
            )}
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <KeyboardIcon className="size-3.5" aria-hidden />
                {t("shortcuts")}
              </span>
              <Select
                value={String(rate)}
                onValueChange={(v) => {
                  const r = Number(v);
                  setRate(r);
                  if (mediaRef.current) mediaRef.current.playbackRate = r;
                }}
              >
                <SelectTrigger size="sm" className="ms-auto h-8 w-24" aria-label={t("speed")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RATES.map((r) => (
                    <SelectItem key={r} value={String(r)}>
                      {r}×
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {canEdit && <ReplaceMedia sessionId={sessionId} />}
            </div>
          </div>
        )}

        {props.editor}

        {showStart && <MediaStart scope={scope} sessionId={sessionId} liveHref={props.liveHref} canEdit={canEdit} />}

        {transcript?.status === "processing" && (
          <div className="flex items-center gap-3 rounded-2xl border bg-card p-4 text-sm shadow-soft" role="status" aria-live="polite">
            <Loader2Icon className="size-5 animate-spin text-primary" aria-hidden />
            <div>
              <p className="font-medium">{t("transcribing")}</p>
              <p className="text-muted-foreground">{t("transcribingHint")}</p>
            </div>
          </div>
        )}
        {transcript?.status === "failed" && (
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm" role="alert">
            <AlertCircleIcon className="size-5 text-destructive" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="font-medium">{t("failed")}</p>
              {transcript.error && <p className="text-pretty text-muted-foreground">{transcript.error}</p>}
            </div>
            {canEdit && media && <RetryButton scope={scope} sessionId={sessionId} />}
            {canEdit && <ImportTranscriptButton scope={scope} sessionId={sessionId} />}
          </div>
        )}

        {hasTranscript && props.conversation && (
          <TranscriptView
            scope={scope}
            sessionId={sessionId}
            segments={segments}
            speakers={transcript!.speakers}
            notes={notes}
            participants={props.participants}
            timeMs={media ? timeMs : null}
            seek={media ? seek : null}
            canEdit={canEdit}
            provider={transcript!.provider}
          />
        )}
        {props.conversation && !media && transcript?.status === "ready" && canEdit && (
          <p className="text-xs text-muted-foreground">
            {t("noRecording")} <ReplaceMedia sessionId={sessionId} inline />
          </p>
        )}
      </div>

      <aside className="grid grid-cols-1 min-w-0 content-start" aria-label={t("sidebar")}>
        <Tabs defaultValue="notes">
          <TabsList className="w-full">
            <TabsTrigger value="notes">
              {t("notesTab")}
              {notes.length > 0 && <span className="text-xs text-muted-foreground tabular-nums">{notes.length}</span>}
            </TabsTrigger>
            <TabsTrigger value="details">{t("detailsTab")}</TabsTrigger>
            <TabsTrigger value="guide">{t("guideTab")}</TabsTrigger>
          </TabsList>
          <TabsContent value="notes">
            <NotesPanel
              scope={scope}
              sessionId={sessionId}
              notes={notes}
              onAdded={(n) => setNotes((prev) => [...prev, n].sort((a, b) => (a.atMs ?? Infinity) - (b.atMs ?? Infinity)))}
              timeMs={media ? timeMs : null}
              seek={media ? seek : null}
              canAnalyze={props.canAnalyze}
              canEdit={canEdit}
              currentUserId={props.currentUserId}
            />
          </TabsContent>
          <TabsContent value="details">{props.details}</TabsContent>
          <TabsContent value="guide">{props.guide}</TabsContent>
        </Tabs>
      </aside>
    </div>
  );
}

function RetryButton({ scope, sessionId }: { scope: Scope; sessionId: string }) {
  const t = useTranslations("sessionPage");
  const feedback = useActionFeedback();
  const [pending, startTransition] = useTransition();
  return (
    <Button variant="outline" size="sm" disabled={pending} onClick={() => startTransition(async () => void feedback(await retranscribeAction(scope, sessionId)))}>
      {pending ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />}
      {t("retry")}
    </Button>
  );
}

function ReplaceMedia({ sessionId, inline }: { sessionId: string; inline?: boolean }) {
  const t = useTranslations("sessionPage");
  const { upload, progress } = useMediaUpload(sessionId);
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      {progress !== null ? (
        <span className="inline-flex items-center gap-1" role="status">
          <Loader2Icon className="size-3.5 animate-spin" aria-hidden />
          {t("upload.uploading", { percent: Math.round(progress * 100) })}
        </span>
      ) : inline ? (
        <button type="button" className="font-medium text-primary hover:underline" onClick={() => input.current?.click()}>
          {t("addRecording")}
        </button>
      ) : (
        <Button variant="ghost" size="sm" className="h-8" onClick={() => input.current?.click()}>
          <UploadCloudIcon />
          {t("replace")}
        </Button>
      )}
      <input
        ref={input}
        type="file"
        accept="audio/*,video/*"
        className="sr-only"
        aria-label={t("replace")}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file, file.name);
          e.target.value = "";
        }}
      />
    </>
  );
}

// ── Transcript ─────────────────────────────────────────────────────────────

function speakerColor(key: string | null, speakers: Speakers): string {
  if (!key) return "var(--muted-foreground)";
  if (speakers[key]?.role === "interviewer") return "var(--muted-foreground)";
  const n = Number(key.replace(/\D/g, "")) || 1;
  return `var(--series-${((n - 1) % 8) + 1})`;
}

function TranscriptView({
  scope,
  sessionId,
  segments,
  speakers,
  notes,
  participants,
  timeMs,
  seek,
  canEdit,
  provider,
}: {
  scope: Scope;
  sessionId: string;
  segments: SegmentItem[];
  speakers: Speakers;
  notes: NoteItem[];
  participants: { id: string; code: string }[];
  timeMs: number | null;
  seek: ((ms: number, play?: boolean) => void) | null;
  canEdit: boolean;
  provider: string;
}) {
  const t = useTranslations("sessionPage.transcript");
  const [query, setQuery] = useState("");
  const [hit, setHit] = useState(0);
  const [follow, setFollow] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [speakersOpen, setSpeakersOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const listRef = useRef<HTMLOListElement>(null);

  const active = timeMs === null ? -1 : activeSegmentIndex(segments, timeMs);
  const q = query.trim().toLowerCase();
  const matches = useMemo(() => (q ? segments.map((s, i) => (s.text.toLowerCase().includes(q) ? i : -1)).filter((i) => i >= 0) : []), [segments, q]);
  const current = matches.length ? matches[Math.min(hit, matches.length - 1)]! : -1;

  // Keep the playing segment in view while following playback.
  useEffect(() => {
    if (!follow || active < 0 || editing) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.top < 140 || rect.bottom > window.innerHeight - 80) el.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [active, follow, editing]);

  useEffect(() => {
    if (current < 0) return;
    listRef.current?.querySelector<HTMLElement>(`[data-index="${current}"]`)?.scrollIntoView({ block: "center" });
  }, [current]);

  // Notes with a time are shown inline, after the segment they fall in.
  const notesAfter = useMemo(() => {
    const map = new Map<number, NoteItem[]>();
    for (const n of notes) {
      if (n.atMs === null) continue;
      const i = Math.max(0, activeSegmentIndex(segments, n.atMs));
      map.set(i, [...(map.get(i) ?? []), n]);
    }
    return map;
  }, [notes, segments]);

  const step = (d: number) => setHit((h) => (matches.length ? (h + d + matches.length) % matches.length : 0));

  return (
    <section aria-labelledby="transcript-title" className="grid grid-cols-1 gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="transcript-title" className="me-auto flex items-center gap-2 text-base font-semibold">
          {t("title")}
          {provider === "mock" && (
            <Badge variant="outline" title={t("mockHint")}>
              {t("mock")}
            </Badge>
          )}
        </h2>
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setHit(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                step(e.shiftKey ? -1 : 1);
              }
            }}
            placeholder={t("search")}
            aria-label={t("search")}
            className="h-9 w-44 ps-9 sm:w-56"
          />
        </div>
        {q && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground tabular-nums" aria-live="polite">
            {matches.length ? t("matchOf", { n: Math.min(hit, matches.length - 1) + 1, total: matches.length }) : t("noMatch")}
            <Button variant="ghost" size="icon-sm" aria-label={t("prevMatch")} onClick={() => step(-1)} disabled={!matches.length}>
              <ChevronUpIcon />
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label={t("nextMatch")} onClick={() => step(1)} disabled={!matches.length}>
              <ChevronDownIcon />
            </Button>
          </span>
        )}
        {seek && (
          <Button variant={follow ? "soft" : "ghost"} size="sm" aria-pressed={follow} onClick={() => setFollow((f) => !f)}>
            <LocateFixedIcon />
            {t("follow")}
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={t("more")}>
              <MoreHorizontalIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {canEdit && (
              <DropdownMenuItem onSelect={() => setSpeakersOpen(true)}>
                <UsersIcon />
                {t("speakers")}
              </DropdownMenuItem>
            )}
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">{t("download")}</DropdownMenuLabel>
            {(["txt", "vtt", "srt"] as const).map((f) => (
              <DropdownMenuItem key={f} asChild>
                <a href={`/api/sessions/${sessionId}/transcript?format=${f}`} download>
                  <DownloadIcon />
                  {t(`format_${f}`)}
                </a>
              </DropdownMenuItem>
            ))}
            {canEdit && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setImportOpen(true)}>
                  <FileTextIcon />
                  {t("replaceTranscript")}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex flex-wrap gap-2" aria-label={t("speakers")}>
        {Object.entries(speakers)
          .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
          .map(([key, s]) => (
            <span key={key} className="inline-flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 text-xs">
              <span className="size-2 rounded-full" style={{ background: speakerColor(key, speakers) }} aria-hidden />
              <span className="font-medium">{s.name}</span>
              <span className="text-muted-foreground">{t(`role_${s.role}`)}</span>
            </span>
          ))}
      </div>

      <ol ref={listRef} className="grid grid-cols-1 gap-1 rounded-2xl border bg-card p-2 shadow-soft sm:p-3">
        {segments.map((s, i) => {
          const speaker = s.speaker ? speakers[s.speaker] : undefined;
          const isActive = i === active;
          const showSpeaker = i === 0 || segments[i - 1]!.speaker !== s.speaker;
          return (
            <Fragment key={s.id}>
              <li
                data-index={i}
                aria-current={isActive ? "true" : undefined}
                className={cn(
                  "group relative grid grid-cols-[3.5rem_minmax(0,1fr)] gap-x-3 rounded-xl px-2 py-2 transition-colors",
                  isActive && "bg-accent-soft/70",
                  current === i && "ring-2 ring-primary/40",
                )}
              >
                <div className="pt-0.5">
                  {s.startMs !== null &&
                    (seek ? (
                      <button
                        type="button"
                        onClick={() => seek(s.startMs!)}
                        className="rounded-md px-1 text-xs text-muted-foreground tabular-nums outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40"
                        aria-label={t("playFrom", { time: formatTimestamp(s.startMs) })}
                      >
                        {formatTimestamp(s.startMs)}
                      </button>
                    ) : (
                      <span className="px-1 text-xs text-muted-foreground tabular-nums">{formatTimestamp(s.startMs)}</span>
                    ))}
                </div>
                <div className="grid grid-cols-1 min-w-0 gap-0.5">
                  {showSpeaker && (
                    <p className="flex items-center gap-1.5 text-xs font-medium">
                      <span className="size-2 rounded-full" style={{ background: speakerColor(s.speaker, speakers) }} aria-hidden />
                      {speaker?.name ?? t("unknownSpeaker")}
                    </p>
                  )}
                  {editing === s.id ? (
                    <SegmentEditor scope={scope} sessionId={sessionId} segment={s} speakers={speakers} onDone={() => setEditing(null)} />
                  ) : (
                    <p className="text-[0.95rem] leading-relaxed text-pretty">
                      <Highlight text={s.text} query={q} />
                    </p>
                  )}
                </div>
                {canEdit && editing !== s.id && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="absolute end-1 top-1 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100"
                    aria-label={t("edit", { n: i + 1 })}
                    onClick={() => setEditing(s.id)}
                  >
                    <PencilIcon />
                  </Button>
                )}
              </li>
              {notesAfter.get(i)?.map((n) => (
                <li key={n.id} className="ms-[4.25rem] flex items-start gap-2 rounded-lg border border-dashed bg-muted/40 px-2.5 py-1.5 text-xs">
                  <StickyNoteIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  <span>
                    <span className="text-muted-foreground tabular-nums">{formatTimestamp(n.atMs!)}</span>
                    {n.tag && <span className="ms-1.5 font-medium">#{n.tag}</span>} {n.text}
                  </span>
                </li>
              ))}
            </Fragment>
          );
        })}
      </ol>
      {canEdit && <ImportTranscriptDialog scope={scope} sessionId={sessionId} open={importOpen} onOpenChange={setImportOpen} />}
      {speakersOpen && <SpeakersDialog scope={scope} sessionId={sessionId} speakers={speakers} participants={participants} open={speakersOpen} onOpenChange={setSpeakersOpen} />}
    </section>
  );
}

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const parts: React.ReactNode[] = [];
  const lower = text.toLowerCase();
  let at = 0;
  for (let i = lower.indexOf(query); i >= 0; i = lower.indexOf(query, at)) {
    parts.push(text.slice(at, i), <mark key={i} className="rounded-sm bg-warning/40 text-foreground">{text.slice(i, i + query.length)}</mark>);
    at = i + query.length;
  }
  parts.push(text.slice(at));
  return <>{parts}</>;
}

function SegmentEditor({ scope, sessionId, segment, speakers, onDone }: { scope: Scope; sessionId: string; segment: SegmentItem; speakers: Speakers; onDone: () => void }) {
  const t = useTranslations("sessionPage.transcript");
  const tc = useTranslations("common");
  const feedback = useActionFeedback();
  const [text, setText] = useState(segment.text);
  const [speaker, setSpeaker] = useState(segment.speaker ?? "none");
  const [pending, startTransition] = useTransition();
  const save = () =>
    startTransition(async () => {
      if (feedback(await updateSegmentAction(scope, sessionId, segment.id, { text, speaker: speaker === "none" ? null : speaker }))) onDone();
    });
  return (
    <div className="grid grid-cols-1 gap-2 py-1">
      <Select value={speaker} onValueChange={setSpeaker}>
        <SelectTrigger size="sm" className="h-8 w-48" aria-label={t("speaker")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(speakers).map(([k, s]) => (
            <SelectItem key={k} value={k}>
              {s.name}
            </SelectItem>
          ))}
          <SelectItem value="none">{t("unknownSpeaker")}</SelectItem>
        </SelectContent>
      </Select>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        autoFocus
        aria-label={t("text")}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) save();
          if (e.key === "Escape") onDone();
        }}
      />
      <div className="flex gap-2">
        <Button size="sm" onClick={save} disabled={pending || !text.trim()}>
          {pending && <Loader2Icon className="animate-spin" />}
          {tc("save")}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>
          {tc("cancel")}
        </Button>
      </div>
    </div>
  );
}
