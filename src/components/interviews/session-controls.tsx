"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { CalendarPlusIcon, CheckCircle2Icon, CircleSlashIcon, Loader2Icon, MoreHorizontalIcon, PencilIcon, PlayIcon, RotateCcwIcon, Trash2Icon, UserXIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { useActionFeedback } from "@/components/common/use-action-feedback";
import { deleteSessionAction, saveSummaryAction, saveTextEntryAction, setSessionStatusAction } from "@/server/actions/interviews";
import { isConversation, type SessionKind, type SessionStatus } from "@/lib/interviews/sessions";
import { SessionDialog, type MemberOption, type PersonOption, type SessionFormValues } from "./session-dialog";

type Scope = { workspaceId: string; slug: string; projectId: string; studyId: string };

export function SessionActions({
  scope,
  base,
  sessionId,
  kind,
  status,
  scheduled,
  values,
  kinds,
  people,
  members,
}: {
  scope: Scope;
  base: string;
  sessionId: string;
  kind: SessionKind;
  status: SessionStatus;
  scheduled: boolean;
  values: SessionFormValues;
  kinds: SessionKind[];
  people: PersonOption[];
  members: MemberOption[];
}) {
  const t = useTranslations("sessionPage.actions");
  const feedback = useActionFeedback();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pending, startTransition] = useTransition();
  const setStatus = (s: SessionStatus) => startTransition(async () => void feedback(await setSessionStatusAction(scope, sessionId, s)));

  return (
    <div className="flex flex-wrap items-center gap-2">
      {isConversation(kind) && status !== "completed" && status !== "cancelled" && (
        <Button asChild>
          <Link href={`${base}/sessions/${sessionId}/live`}>
            <PlayIcon />
            {status === "in_progress" ? t("resume") : t("start")}
          </Link>
        </Button>
      )}
      {status !== "completed" && (
        <Button variant="outline" disabled={pending} onClick={() => setStatus("completed")}>
          {pending ? <Loader2Icon className="animate-spin" /> : <CheckCircle2Icon />}
          {t("complete")}
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={t("more")}>
            <MoreHorizontalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setEditing(true)}>
            <PencilIcon />
            {t("edit")}
          </DropdownMenuItem>
          {scheduled && (
            <DropdownMenuItem asChild>
              <a href={`/api/sessions/${sessionId}/calendar`} download>
                <CalendarPlusIcon />
                {t("calendar")}
              </a>
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          {status !== "scheduled" && (
            <DropdownMenuItem onSelect={() => setStatus("scheduled")}>
              <RotateCcwIcon />
              {t("reopen")}
            </DropdownMenuItem>
          )}
          {status !== "no_show" && isConversation(kind) && (
            <DropdownMenuItem onSelect={() => setStatus("no_show")}>
              <UserXIcon />
              {t("noShow")}
            </DropdownMenuItem>
          )}
          {status !== "cancelled" && (
            <DropdownMenuItem onSelect={() => setStatus("cancelled")}>
              <CircleSlashIcon />
              {t("cancel")}
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(true)}>
            <Trash2Icon />
            {t("delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {editing && <SessionDialog scope={scope} base={base} open={editing} onOpenChange={setEditing} kinds={kinds} people={people} members={members} sessionId={sessionId} initial={values} />}
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={t("deleteTitle")}
        description={t("deleteBody")}
        confirmLabel={t("delete")}
        onConfirm={async () => {
          if (feedback(await deleteSessionAction(scope, sessionId), t("deleted"))) router.push(`${base}/sessions`);
        }}
      />
    </div>
  );
}

/** Field notes and diary entries are written here; paragraphs become the units of analysis. */
export function TextEntryEditor({ scope, sessionId, kind, initial, canEdit }: { scope: Scope; sessionId: string; kind: SessionKind; initial: string; canEdit: boolean }) {
  const t = useTranslations("sessionPage.entry");
  const feedback = useActionFeedback();
  const [text, setText] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [pending, startTransition] = useTransition();
  if (!canEdit) {
    return initial ? (
      <article className="grid grid-cols-1 gap-3 rounded-2xl border bg-card p-4 text-[0.95rem] leading-relaxed shadow-soft sm:p-6">
        {initial.split(/\n\s*\n/).map((p, i) => (
          <p key={i} className="whitespace-pre-line">
            {p}
          </p>
        ))}
      </article>
    ) : (
      <p className="rounded-2xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">{t("empty")}</p>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-2 rounded-2xl border bg-card p-3 shadow-soft sm:p-4">
      <Label htmlFor="entry-text">{kind === "diary" ? t("diary") : t("fieldNotes")}</Label>
      <Textarea id="entry-text" rows={14} value={text} onChange={(e) => setText(e.target.value)} placeholder={t("placeholder")} className="min-h-64 text-[0.95rem] leading-relaxed" />
      <div className="flex flex-wrap items-center gap-2">
        <p className="me-auto text-xs text-muted-foreground">{t("hint")}</p>
        <Button
          disabled={pending || text === saved}
          onClick={() =>
            startTransition(async () => {
              if (feedback(await saveTextEntryAction(scope, sessionId, text), t("saved"))) setSaved(text);
            })
          }
        >
          {pending && <Loader2Icon className="animate-spin" />}
          {t("save")}
        </Button>
      </div>
    </div>
  );
}

export function SummaryEditor({ scope, sessionId, initial, canEdit }: { scope: Scope; sessionId: string; initial: string; canEdit: boolean }) {
  const t = useTranslations("sessionPage.summary");
  const feedback = useActionFeedback();
  const [text, setText] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [pending, startTransition] = useTransition();
  if (!canEdit) return initial ? <p className="text-sm whitespace-pre-line">{initial}</p> : <p className="text-sm text-muted-foreground">{t("none")}</p>;
  return (
    <div className="grid grid-cols-1 gap-2">
      <Label htmlFor="session-summary">{t("label")}</Label>
      <Textarea id="session-summary" rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder={t("placeholder")} />
      <Button
        size="sm"
        variant="secondary"
        className="w-fit"
        disabled={pending || text === saved}
        onClick={() =>
          startTransition(async () => {
            if (feedback(await saveSummaryAction(scope, sessionId, text), t("saved"))) setSaved(text);
          })
        }
      >
        {pending && <Loader2Icon className="animate-spin" />}
        {t("save")}
      </Button>
    </div>
  );
}
