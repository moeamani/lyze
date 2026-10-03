"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Loader2Icon, NotebookPenIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useActionFeedback } from "@/components/common/use-action-feedback";
import { LocalTime } from "@/components/common/local-time";
import { createMemoAction, deleteMemoAction, updateMemoAction } from "@/server/actions/coding";

type Scope = { workspaceId: string; slug: string; projectId: string };
export type MemoItem = { id: string; title: string | null; body: string; authorId: string | null; authorName: string | null; updatedAt: string; link?: { href: string; label: string } | null };
type Target = { targetType: "project" | "code" | "theme" | "segment" | "answer" | "session"; targetId?: string | null };

/** Memos attached to something (a code, a theme, the project), with an inline composer. */
export function MemoList({ scope, target, memos, canWrite, currentUserId, role, title, showTitles = false }: { scope: Scope; target: Target; memos: MemoItem[]; canWrite: boolean; currentUserId: string; role: string; title: string; showTitles?: boolean }) {
  const t = useTranslations("memos");
  const feedback = useActionFeedback();
  const [body, setBody] = useState("");
  const [heading, setHeading] = useState("");
  const [pending, startTransition] = useTransition();
  return (
    <section aria-label={title} className="grid gap-2">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold">
        <NotebookPenIcon className="size-4 text-muted-foreground" aria-hidden />
        {title}
      </h3>
      {canWrite && (
        <form
          className="grid gap-2 rounded-xl border bg-card p-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!body.trim()) return;
            startTransition(async () => {
              if (feedback(await createMemoAction(scope, { ...target, title: heading, body }), t("saved"))) {
                setBody("");
                setHeading("");
              }
            });
          }}
        >
          {showTitles && <Input value={heading} onChange={(e) => setHeading(e.target.value)} placeholder={t("titlePlaceholder")} aria-label={t("titleLabel")} className="h-9" />}
          <Textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder={t("placeholder")} aria-label={t("new")} />
          <Button type="submit" size="sm" className="w-fit" disabled={pending || !body.trim()}>
            {pending && <Loader2Icon className="animate-spin" />}
            {t("add")}
          </Button>
        </form>
      )}
      {memos.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("none")}</p>
      ) : (
        <ul className="grid gap-2">
          {memos.map((m) => (
            <MemoCard key={m.id} scope={scope} memo={m} canEdit={canWrite && (m.authorId === currentUserId || role === "owner" || role === "editor")} />
          ))}
        </ul>
      )}
    </section>
  );
}

function MemoCard({ scope, memo, canEdit }: { scope: Scope; memo: MemoItem; canEdit: boolean }) {
  const t = useTranslations("memos");
  const tc = useTranslations("common");
  const feedback = useActionFeedback();
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(memo.body);
  const [pending, startTransition] = useTransition();
  return (
    <li className="group grid gap-1.5 rounded-xl border bg-card p-3 text-sm">
      {memo.title && <p className="font-medium">{memo.title}</p>}
      {editing ? (
        <div className="grid gap-2">
          <Textarea autoFocus rows={4} value={body} onChange={(e) => setBody(e.target.value)} aria-label={t("edit")} />
          <div className="flex gap-2">
            <Button size="sm" disabled={pending || !body.trim()} onClick={() => startTransition(async () => void (feedback(await updateMemoAction(scope, memo.id, { title: memo.title, body })) && setEditing(false)))}>
              {tc("save")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              {tc("cancel")}
            </Button>
          </div>
        </div>
      ) : (
        <p className="whitespace-pre-line">{memo.body}</p>
      )}
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>{memo.authorName}</span>
        <span aria-hidden>·</span>
        <LocalTime date={memo.updatedAt} preset="date" />
        {memo.link && (
          <a href={memo.link.href} className="truncate hover:text-foreground hover:underline">
            {memo.link.label}
          </a>
        )}
        {canEdit && !editing && (
          <span className="ms-auto flex gap-1 opacity-60 group-hover:opacity-100">
            <Button variant="ghost" size="icon-sm" className="size-7" aria-label={t("edit")} onClick={() => setEditing(true)}>
              <PencilIcon />
            </Button>
            <Button variant="ghost" size="icon-sm" className="size-7" aria-label={t("delete")} disabled={pending} onClick={() => startTransition(async () => void feedback(await deleteMemoAction(scope, memo.id)))}>
              <Trash2Icon />
            </Button>
          </span>
        )}
      </div>
    </li>
  );
}
