"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Loader2Icon, StickyNoteIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useActionFeedback } from "@/components/common/use-action-feedback";
import { addNoteAction, deleteNoteAction } from "@/server/actions/interviews";
import { formatTimestamp } from "@/lib/interviews/time";
import { parseNote, QUICK_TAGS } from "@/lib/interviews/sessions";
import { cn } from "@/lib/utils";

type Scope = { workspaceId: string; slug: string; projectId: string; studyId: string };
export type NoteItem = { id: string; atMs: number | null; tag: string | null; text: string; authorName: string | null; authorId: string | null };

export const TAG_STYLE: Record<string, string> = {
  quote: "bg-[color-mix(in_oklab,var(--series-1)_14%,transparent)]",
  pain: "bg-[color-mix(in_oklab,var(--series-8)_14%,transparent)]",
  idea: "bg-[color-mix(in_oklab,var(--series-3)_14%,transparent)]",
  follow_up: "bg-[color-mix(in_oklab,var(--series-4)_16%,transparent)]",
  highlight: "bg-[color-mix(in_oklab,var(--series-7)_14%,transparent)]",
};

export function TagChip({ tag }: { tag: string }) {
  const t = useTranslations("notes.tags");
  const known = (QUICK_TAGS as readonly string[]).includes(tag);
  return <span className={cn("rounded-md px-1.5 py-0.5 text-xs font-medium", TAG_STYLE[tag] ?? "bg-muted")}>{known ? t(tag as (typeof QUICK_TAGS)[number]) : `#${tag}`}</span>;
}

/** Notes on a session: timestamped when there's a recording, with quick tags. */
export function NotesPanel({
  scope,
  sessionId,
  notes,
  onAdded,
  timeMs,
  seek,
  canAnalyze,
  canEdit,
  currentUserId,
}: {
  scope: Scope;
  sessionId: string;
  notes: NoteItem[];
  onAdded: (n: NoteItem) => void;
  timeMs: number | null;
  seek: ((ms: number) => void) | null;
  canAnalyze: boolean;
  canEdit: boolean;
  currentUserId: string;
}) {
  const t = useTranslations("notes");
  const feedback = useActionFeedback();
  const [text, setText] = useState("");
  const [stamp, setStamp] = useState(true);
  const [pending, startTransition] = useTransition();

  const add = (quickTag?: string) => {
    const parsed = parseNote(text);
    const tag = quickTag ?? parsed.tag;
    if (!parsed.text && !tag) return;
    const atMs = timeMs !== null && stamp ? Math.round(timeMs) : null;
    startTransition(async () => {
      const result = await addNoteAction(scope, sessionId, { text: parsed.text, tag, atMs });
      if (feedback(result) && result.ok) {
        onAdded({ ...result.data, authorName: t("you"), authorId: currentUserId });
        setText("");
      }
    });
  };

  return (
    <div className="grid grid-cols-1 gap-3">
      {canAnalyze && (
        <form
          className="grid grid-cols-1 gap-2 rounded-2xl border bg-card p-3 shadow-soft"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                add();
              }
            }}
            placeholder={t("placeholder")}
            aria-label={t("add")}
            rows={2}
            className="min-h-16"
          />
          <div className="flex flex-wrap gap-1" role="group" aria-label={t("quickTags")}>
            {QUICK_TAGS.map((tag) => (
              <button
                key={tag}
                type="button"
                disabled={pending}
                onClick={() => add(tag)}
                className={cn("h-8 rounded-lg px-2.5 text-xs font-medium outline-none hover:brightness-95 focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:opacity-50", TAG_STYLE[tag])}
              >
                {t(`tags.${tag}`)}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            {timeMs !== null && (
              <label className="me-auto flex items-center gap-2 text-xs text-muted-foreground">
                <input type="checkbox" checked={stamp} onChange={(e) => setStamp(e.target.checked)} className="size-4 accent-primary" />
                {t("atTime", { time: formatTimestamp(timeMs) })}
              </label>
            )}
            <Button type="submit" size="sm" className="ms-auto" disabled={pending || !text.trim()}>
              {pending && <Loader2Icon className="animate-spin" />}
              {t("add")}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{t("hint")}</p>
        </form>
      )}
      {notes.length === 0 ? (
        <p className="flex items-center justify-center gap-2 rounded-2xl border border-dashed px-4 py-8 text-sm text-muted-foreground">
          <StickyNoteIcon className="size-4" aria-hidden />
          {t("empty")}
        </p>
      ) : (
        <ol className="grid grid-cols-1 gap-2" aria-label={t("list")}>
          {notes.map((n) => (
            <NoteRow key={n.id} note={n} scope={scope} sessionId={sessionId} seek={seek} canDelete={canEdit || (canAnalyze && n.authorId === currentUserId)} />
          ))}
        </ol>
      )}
    </div>
  );
}

function NoteRow({ note, scope, sessionId, seek, canDelete }: { note: NoteItem; scope: Scope; sessionId: string; seek: ((ms: number) => void) | null; canDelete: boolean }) {
  const t = useTranslations("notes");
  const feedback = useActionFeedback();
  const [pending, startTransition] = useTransition();
  return (
    <li className={cn("group grid gap-1 rounded-xl border bg-card p-3 text-sm", pending && "opacity-50")}>
      <div className="flex items-center gap-2">
        {note.atMs !== null &&
          (seek ? (
            <button type="button" onClick={() => seek(note.atMs!)} className="rounded-md bg-muted px-1.5 py-0.5 text-xs tabular-nums outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/40" aria-label={t("jump", { time: formatTimestamp(note.atMs) })}>
              {formatTimestamp(note.atMs)}
            </button>
          ) : (
            <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs tabular-nums">{formatTimestamp(note.atMs)}</span>
          ))}
        {note.tag && <TagChip tag={note.tag} />}
        <span className="ms-auto truncate text-xs text-muted-foreground">{note.authorName}</span>
        {canDelete && (
          <Button
            variant="ghost"
            size="icon-sm"
            className="size-7 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100"
            aria-label={t("delete")}
            disabled={pending}
            onClick={() => startTransition(async () => void feedback(await deleteNoteAction(scope, sessionId, note.id)))}
          >
            <Trash2Icon />
          </Button>
        )}
      </div>
      {note.text && <p className="whitespace-pre-line">{note.text}</p>}
    </li>
  );
}
