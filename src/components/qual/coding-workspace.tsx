"use client";

import { AiModeSelect, useAiMode } from "@/components/common/ai-mode";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  BookOpenTextIcon,
  CheckIcon,
  ExternalLinkIcon,
  HighlighterIcon,
  Loader2Icon,
  MessagesSquareIcon,
  NotebookPenIcon,
  SparklesIcon,
  StarIcon,
  Trash2Icon,
  UsersRoundIcon,
  XIcon,
  ListTodoIcon,
  TagIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useActionFeedback } from "@/components/common/use-action-feedback";
import {
  applyCodeAction,
  applyNewCodeAction,
  createMemoAction,
  deleteMemoAction,
  removeCodingAction,
  reviewSuggestionsAction,
  starCodingAction,
  suggestCodingsAction,
} from "@/server/actions/coding";
import { spans, type Marked } from "@/lib/qual/ranges";
import { codeColorVar } from "@/lib/qual/codes";
import { formatTimestamp } from "@/lib/interviews/time";
import { cn } from "@/lib/utils";
import { CodePicker, type PickerCode } from "./code-picker";
import { ClusterButton, SummarizeButton } from "./assist-dialogs";

type Scope = { workspaceId: string; slug: string; projectId: string };
type DocKind = "interview" | "focus_group" | "field_notes" | "diary" | "question";
export type WorkspaceDoc = { key: string; title: string; subtitle: string; studyName: string; kind: DocKind; units: number; codings: number; pending: number };
type Unit = { id: string; kind: "segment" | "answer"; text: string; label: string; role: string; participantId: string | null; startMs: number | null };
type Coding = { id: string; codeId: string; unitId: string; start: number; end: number; quote: string; pending: boolean; reason: string | null; starred: boolean; authorName: string | null };
type Code = PickerCode & { parentId: string | null; count: number; definition: string | null };
type Memo = { id: string; targetId: string; body: string; authorName: string | null };
type Target = { unitKind: "segment" | "answer"; unitId: string; start: number; end: number };

const KIND_ICON: Record<DocKind, React.ComponentType<{ className?: string }>> = {
  interview: MessagesSquareIcon,
  focus_group: UsersRoundIcon,
  field_notes: NotebookPenIcon,
  diary: BookOpenTextIcon,
  question: ListTodoIcon,
};

/** Characters offset of (node, offset) from the start of `container`'s text. */
function textOffset(container: Node, node: Node, offset: number) {
  const r = document.createRange();
  r.selectNodeContents(container);
  r.setEnd(node, offset);
  return r.toString().length;
}

export function CodingWorkspace({
  scope,
  base,
  canCode,
  canEditStudy,
  assistant,
  docs,
  doc,
  codings,
  codes,
  memos,
}: {
  scope: Scope;
  base: string;
  canCode: boolean;
  canEditStudy: boolean;
  assistant: string;
  docs: WorkspaceDoc[];
  doc: { key: string; title: string; kind: DocKind; studyName: string; studyId: string; sessionId: string | null; questionId: string | null; href: string; units: Unit[] };
  codings: Coding[];
  codes: Code[];
  memos: Memo[];
}) {
  const t = useTranslations("coding");
  const router = useRouter();
  const feedback = useActionFeedback();
  const viewer = useRef<HTMLDivElement>(null);
  const [focusCode, setFocusCode] = useState<string | null>(null);
  const [picker, setPicker] = useState<{ targets: Target[]; x: number; y: number; memo?: boolean } | null>(null);
  const [markMenu, setMarkMenu] = useState<{ unitId: string; at: number; x: number; y: number } | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const codeById = useMemo(() => new Map(codes.map((c) => [c.id, c])), [codes]);
  const byUnit = useMemo(() => {
    const m = new Map<string, Coding[]>();
    for (const c of codings) m.set(c.unitId, [...(m.get(c.unitId) ?? []), c]);
    return m;
  }, [codings]);
  const memosByUnit = useMemo(() => {
    const m = new Map<string, Memo[]>();
    for (const x of memos) m.set(x.targetId, [...(m.get(x.targetId) ?? []), x]);
    return m;
  }, [memos]);
  const docCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of codings) if (!c.pending) m.set(c.codeId, (m.get(c.codeId) ?? 0) + 1);
    return m;
  }, [codings]);
  const suggestions = codings.filter((c) => c.pending);

  // ── Selecting text opens the code picker ────────────────────────────────
  const readSelection = useCallback((): { targets: Target[]; rect: DOMRect } | null => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount || !viewer.current) return null;
    const range = sel.getRangeAt(0);
    if (!viewer.current.contains(range.commonAncestorContainer)) return null;
    const targets: Target[] = [];
    viewer.current.querySelectorAll<HTMLElement>("[data-unit-id]").forEach((el) => {
      if (!range.intersectsNode(el)) return;
      const len = el.textContent?.length ?? 0;
      const start = el.contains(range.startContainer) ? textOffset(el, range.startContainer, range.startOffset) : 0;
      const end = el.contains(range.endContainer) ? textOffset(el, range.endContainer, range.endOffset) : len;
      if (end > start) targets.push({ unitKind: el.dataset.unitKind as "segment" | "answer", unitId: el.dataset.unitId!, start, end });
    });
    return targets.length ? { targets, rect: range.getBoundingClientRect() } : null;
  }, []);

  const openFromSelection = useCallback(() => {
    if (!canCode) return;
    const s = readSelection();
    if (!s) return;
    setMarkMenu(null);
    setPicker({ targets: s.targets, x: s.rect.left + s.rect.width / 2, y: s.rect.bottom });
  }, [canCode, readSelection]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPicker(null);
        setMarkMenu(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const finish = (codeId: string) => {
    setRecent((r) => [codeId, ...r.filter((x) => x !== codeId)].slice(0, 8));
    setPicker(null);
    window.getSelection()?.removeAllRanges();
  };

  const apply = (codeId: string) => {
    const targets = picker?.targets ?? [];
    startTransition(async () => {
      for (const target of targets) {
        if (!feedback(await applyCodeAction(scope, { ...target, codeId }))) return;
      }
      finish(codeId);
    });
  };

  const createAndApply = (name: string, color: string) => {
    const [first, ...rest] = picker?.targets ?? [];
    if (!first) return;
    startTransition(async () => {
      const result = await applyNewCodeAction(scope, { name, color: color as "1" }, first);
      if (!feedback(result) || !result.ok) return;
      for (const target of rest) await applyCodeAction(scope, { ...target, codeId: result.data });
      finish(result.data);
    });
  };

  const currentIndex = docs.findIndex((d) => d.key === doc.key);
  const go = (key: string) => router.push(`${base}/coding?doc=${encodeURIComponent(key)}`);

  const docList = (
    <nav aria-label={t("documents")} className="grid content-start gap-3">
      {[...new Set(docs.map((d) => d.studyName))].map((study) => (
        <div key={study} className="grid gap-1">
          <p className="px-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">{study}</p>
          <ul className="grid gap-0.5">
            {docs
              .filter((d) => d.studyName === study)
              .map((d) => {
                const Icon = KIND_ICON[d.kind];
                const active = d.key === doc.key;
                return (
                  <li key={d.key}>
                    <Link
                      href={`${base}/coding?doc=${encodeURIComponent(d.key)}`}
                      aria-current={active ? "page" : undefined}
                      className={cn("flex items-start gap-2 rounded-lg px-2 py-2 text-sm outline-none hover:bg-accent/60 focus-visible:ring-[3px] focus-visible:ring-ring/40", active && "bg-accent-soft/70 font-medium")}
                    >
                      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="grid min-w-0 flex-1">
                        <span className="truncate">{d.title}</span>
                        <span className="truncate text-xs font-normal text-muted-foreground">
                          {t("docMeta", { codings: d.codings, units: d.units })}
                          {d.pending > 0 && ` · ${t("pendingCount", { count: d.pending })}`}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
          </ul>
        </div>
      ))}
    </nav>
  );

  const codesPanel = (
    <CodesPanel
      scope={scope}
      base={base}
      codes={codes}
      docCounts={docCounts}
      focusCode={focusCode}
      setFocusCode={setFocusCode}
      suggestions={suggestions}
      codeById={codeById}
      canCode={canCode}
    />
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem] 2xl:grid-cols-[15rem_minmax(0,1fr)_17rem]">
      <aside className="hidden 2xl:block">
        <div className="sticky top-4 max-h-[calc(100dvh-2rem)] overflow-y-auto pe-1">{docList}</div>
      </aside>

      <section aria-labelledby="doc-title" className="grid min-w-0 content-start gap-3">
        {/* Narrower screens: pick a document from a list. */}
        <div className="2xl:hidden">
          <Select value={doc.key} onValueChange={go}>
            <SelectTrigger className="w-full" aria-label={t("documents")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[...new Set(docs.map((d) => d.studyName))].map((study) => (
                <SelectGroup key={study}>
                  <SelectLabel>{study}</SelectLabel>
                  {docs
                    .filter((d) => d.studyName === study)
                    .map((d) => (
                      <SelectItem key={d.key} value={d.key}>
                        {d.title}
                      </SelectItem>
                    ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        </div>

        <header className="flex flex-wrap items-start gap-2">
          <div className="grid min-w-0 flex-1 gap-0.5">
            <p className="text-xs text-muted-foreground">
              {doc.studyName} · {t(`kinds.${doc.kind}`)}
            </p>
            <h2 id="doc-title" className="text-lg font-semibold text-balance">
              {doc.title}
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canCode && <SuggestButton scope={scope} docKey={doc.key} hasCodes={codes.length > 0} assistant={assistant} />}
            {canCode && doc.sessionId && <SummarizeButton scope={scope} sessionId={doc.sessionId} studyId={doc.studyId} canSave={canEditStudy} assistant={assistant} />}
            {canCode && doc.questionId && <ClusterButton scope={scope} studyId={doc.studyId} questionId={doc.questionId} assistant={assistant} codesCount={codes.length} />}
            <Button asChild variant="ghost" size="sm">
              <Link href={doc.href}>
                <ExternalLinkIcon />
                {doc.sessionId ? t("openSession") : t("openResults")}
              </Link>
            </Button>
            <Button variant="outline" size="sm" className="lg:hidden" onClick={() => setPanelOpen(true)}>
              <TagIcon />
              {t("codes")}
              {suggestions.length > 0 && <Badge variant="soft">{suggestions.length}</Badge>}
            </Button>
          </div>
        </header>

        {canCode && <p className="text-xs text-muted-foreground">{t("howTo")}</p>}

        <div ref={viewer} onMouseUp={openFromSelection} onKeyUp={(e) => e.shiftKey && openFromSelection()} onTouchEnd={() => setTimeout(openFromSelection, 50)} className="grid gap-1 rounded-2xl border bg-card p-2 shadow-soft sm:p-3">
          {doc.units.map((u) => {
            const own = byUnit.get(u.id) ?? [];
            const unitMemos = memosByUnit.get(u.id) ?? [];
            const codeIds = [...new Set(own.filter((c) => !c.pending).map((c) => c.codeId))];
            const interviewer = u.role === "interviewer";
            return (
              <article key={u.id} id={`u-${u.id}`} className={cn("group grid scroll-mt-24 gap-1 rounded-xl px-2 py-2 sm:grid-cols-[minmax(0,1fr)_11rem] sm:gap-3", interviewer && "text-muted-foreground")}>
                <div className="grid min-w-0 gap-0.5">
                  {(u.label || u.startMs !== null) && (
                    <p className="flex items-center gap-2 text-xs font-medium">
                      {u.startMs !== null && <span className="text-muted-foreground tabular-nums">{formatTimestamp(u.startMs)}</span>}
                      <span>{u.label}</span>
                    </p>
                  )}
                  <UnitText unit={u} codings={own} codeById={codeById} focusCode={focusCode} onMark={(at, rect) => setMarkMenu({ unitId: u.id, at, x: rect.left + rect.width / 2, y: rect.bottom })} />
                </div>
                <div className="flex flex-wrap content-start items-start gap-1">
                  {codeIds.map((id) => {
                    const c = codeById.get(id);
                    if (!c) return null;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setFocusCode((f) => (f === id ? null : id))}
                        className={cn("inline-flex max-w-full items-center gap-1 rounded-md border bg-background px-1.5 py-0.5 text-xs", focusCode === id && "border-foreground/40")}
                        title={c.path.join(" › ")}
                      >
                        <span className="size-2 shrink-0 rounded-full" style={{ background: codeColorVar(c.color) }} aria-hidden />
                        <span className="truncate">{c.name}</span>
                      </button>
                    );
                  })}
                  {own.some((c) => c.pending) && (
                    <span className="inline-flex items-center gap-1 rounded-md border border-dashed px-1.5 py-0.5 text-xs text-muted-foreground">
                      <SparklesIcon className="size-3" aria-hidden />
                      {t("suggestedCount", { count: own.filter((c) => c.pending).length })}
                    </span>
                  )}
                  {unitMemos.length > 0 && <UnitMemos scope={scope} memos={unitMemos} canCode={canCode} />}
                  {canCode && (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100 max-sm:opacity-100"
                      onClick={(e) => {
                        const r = e.currentTarget.getBoundingClientRect();
                        setPicker({ targets: [{ unitKind: u.kind, unitId: u.id, start: 0, end: u.text.length }], x: r.left, y: r.bottom });
                      }}
                      aria-label={t("codePassage", { n: doc.units.indexOf(u) + 1 })}
                    >
                      <HighlighterIcon className="size-3.5" aria-hidden />
                      {t("code")}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>

        <nav className="flex items-center justify-between gap-2" aria-label={t("pager")}>
          <Button variant="ghost" size="sm" disabled={currentIndex <= 0} onClick={() => go(docs[currentIndex - 1]!.key)}>
            ← {t("previous")}
          </Button>
          <span className="text-xs text-muted-foreground tabular-nums">{t("position", { n: currentIndex + 1, total: docs.length })}</span>
          <Button variant="ghost" size="sm" disabled={currentIndex >= docs.length - 1} onClick={() => go(docs[currentIndex + 1]!.key)}>
            {t("next")} →
          </Button>
        </nav>
      </section>

      <aside className="hidden lg:block">
        <div className="sticky top-4 max-h-[calc(100dvh-2rem)] overflow-y-auto">{codesPanel}</div>
      </aside>
      <Sheet open={panelOpen} onOpenChange={setPanelOpen}>
        <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto" closeLabel={t("close")}>
          <SheetHeader>
            <SheetTitle>{t("codes")}</SheetTitle>
            <SheetDescription>{t("codesHint")}</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-6">{codesPanel}</div>
        </SheetContent>
      </Sheet>

      {picker && (
        <Floating x={picker.x} y={picker.y} onClose={() => setPicker(null)} label={t("picker.title")}>
          {picker.memo ? (
            <MemoForm
              busy={pending}
              onCancel={() => setPicker(null)}
              onSave={(body) =>
                startTransition(async () => {
                  const target = picker.targets[0]!;
                  if (feedback(await createMemoAction(scope, { targetType: target.unitKind, targetId: target.unitId, body }), t("memoSaved"))) setPicker(null);
                })
              }
            />
          ) : (
            <>
              <p className="mb-2 line-clamp-2 text-xs text-muted-foreground">
                “{picker.targets.map((tg) => doc.units.find((u) => u.id === tg.unitId)?.text.slice(tg.start, tg.end) ?? "").join(" … ")}”
              </p>
              <CodePicker codes={codes} recent={recent} busy={pending} onPick={apply} onCreate={createAndApply} onMemo={picker.targets.length === 1 ? () => setPicker({ ...picker, memo: true }) : undefined} />
            </>
          )}
        </Floating>
      )}
      {markMenu && (
        <Floating x={markMenu.x} y={markMenu.y} onClose={() => setMarkMenu(null)} label={t("onPassage")}>
          <MarkMenu
            scope={scope}
            codings={(byUnit.get(markMenu.unitId) ?? []).filter((c) => c.start <= markMenu.at && c.end >= markMenu.at)}
            codeById={codeById}
            canCode={canCode}
            onDone={() => setMarkMenu(null)}
          />
        </Floating>
      )}
    </div>
  );
}

/** Text with coded passages highlighted (overlaps split into flat spans). */
function UnitText({ unit, codings, codeById, focusCode, onMark }: { unit: Unit; codings: Coding[]; codeById: Map<string, Code>; focusCode: string | null; onMark: (at: number, rect: DOMRect) => void }) {
  const marks: Marked[] = codings.map((c) => ({ id: c.id, codeId: c.codeId, start: c.start, end: c.end, pending: c.pending }));
  const parts = spans(unit.text.length, marks);
  return (
    <p data-unit-id={unit.id} data-unit-kind={unit.kind} className="text-[0.95rem] leading-relaxed whitespace-pre-wrap text-foreground/95 selection:bg-primary/25">
      {parts.map((p) => {
        const text = unit.text.slice(p.start, p.end);
        if (!p.marks.length) return <span key={p.start}>{text}</span>;
        const confirmed = p.marks.filter((m) => !m.pending);
        const lead = (focusCode && confirmed.find((m) => m.codeId === focusCode)) || confirmed[0];
        const dim = focusCode && !p.marks.some((m) => m.codeId === focusCode);
        const color = lead ? codeColorVar(codeById.get(lead.codeId)?.color ?? "1") : null;
        const suggested = p.marks.find((m) => m.pending);
        const sColor = suggested ? codeColorVar(codeById.get(suggested.codeId)?.color ?? "1") : null;
        return (
          <mark
            key={p.start}
            onClick={(e) => {
              if (window.getSelection()?.isCollapsed === false) return;
              onMark(p.start, e.currentTarget.getBoundingClientRect());
            }}
            className="cursor-pointer rounded-[3px] text-inherit"
            style={{
              background: color && !dim ? `color-mix(in oklab, ${color} ${focusCode ? 34 : 22}%, transparent)` : "transparent",
              boxShadow: confirmed.length > 1 && !dim ? `inset 0 -2px 0 ${codeColorVar(codeById.get(confirmed[1]!.codeId)?.color ?? "1")}` : undefined,
              textDecoration: !lead && sColor ? `underline dashed ${sColor} 2px` : undefined,
              textUnderlineOffset: "4px",
            }}
          >
            {text}
          </mark>
        );
      })}
    </p>
  );
}

/** A small fixed-position panel near the selection; a bottom sheet on phones. */
function Floating({ x, y, onClose, label, children }: { x: number; y: number; onClose: () => void; label: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const id = setTimeout(() => window.addEventListener("pointerdown", onDown), 0);
    return () => {
      clearTimeout(id);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [onClose]);
  const width = 288;
  const left = typeof window === "undefined" ? x : Math.max(12, Math.min(window.innerWidth - width - 12, x - width / 2));
  const top = typeof window === "undefined" ? y : Math.min(window.innerHeight - 340, y + 8);
  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={label}
      className="fixed z-50 w-72 rounded-2xl border bg-popover p-3 text-popover-foreground shadow-lift animate-in fade-in-0 zoom-in-95 duration-150 max-sm:inset-x-3 max-sm:top-auto max-sm:bottom-[calc(var(--tabbar-height)+0.75rem)] max-sm:w-auto"
      style={{ left, top }}
    >
      {children}
    </div>
  );
}

function MarkMenu({ scope, codings, codeById, canCode, onDone }: { scope: Scope; codings: Coding[]; codeById: Map<string, Code>; canCode: boolean; onDone: () => void }) {
  const t = useTranslations("coding");
  const feedback = useActionFeedback();
  const [pending, startTransition] = useTransition();
  if (!codings.length) return <p className="text-sm text-muted-foreground">{t("nothingHere")}</p>;
  return (
    <ul className="grid gap-2" aria-busy={pending}>
      {codings.map((c) => {
        const code = codeById.get(c.codeId);
        return (
          <li key={c.id} className="grid gap-1 rounded-lg bg-muted/50 p-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: codeColorVar(code?.color ?? "1") }} aria-hidden />
              <span className="min-w-0 flex-1 truncate font-medium">{code?.name}</span>
              {c.pending ? (
                <Badge variant="outline" className="gap-1">
                  <SparklesIcon className="size-3" aria-hidden />
                  {t("suggested")}
                </Badge>
              ) : (
                c.authorName && <span className="truncate text-xs text-muted-foreground">{c.authorName}</span>
              )}
            </div>
            {c.reason && c.pending && <p className="text-xs text-muted-foreground">{t("because", { reason: c.reason })}</p>}
            {canCode && (
              <div className="flex gap-1">
                {c.pending ? (
                  <>
                    <Button size="sm" variant="secondary" disabled={pending} onClick={() => startTransition(async () => void (feedback(await reviewSuggestionsAction(scope, [c.id], true)) && onDone()))}>
                      <CheckIcon />
                      {t("accept")}
                    </Button>
                    <Button size="sm" variant="ghost" disabled={pending} onClick={() => startTransition(async () => void (feedback(await reviewSuggestionsAction(scope, [c.id], false)) && onDone()))}>
                      <XIcon />
                      {t("reject")}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button size="sm" variant="ghost" aria-pressed={c.starred} disabled={pending} onClick={() => startTransition(async () => void (feedback(await starCodingAction(scope, c.id, !c.starred)) && onDone()))}>
                      <StarIcon className={cn(c.starred && "fill-current text-warning")} />
                      {c.starred ? t("unstar") : t("star")}
                    </Button>
                    <Button size="sm" variant="ghost" disabled={pending} onClick={() => startTransition(async () => void (feedback(await removeCodingAction(scope, c.id)) && onDone()))}>
                      <Trash2Icon />
                      {t("uncode")}
                    </Button>
                  </>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function MemoForm({ busy, onSave, onCancel }: { busy: boolean; onSave: (body: string) => void; onCancel: () => void }) {
  const t = useTranslations("coding");
  const [body, setBody] = useState("");
  return (
    <form
      className="grid gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (body.trim()) onSave(body);
      }}
    >
      <Textarea autoFocus rows={4} value={body} onChange={(e) => setBody(e.target.value)} placeholder={t("memoPlaceholder")} aria-label={t("memo")} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          {t("cancel")}
        </Button>
        <Button type="submit" size="sm" disabled={busy || !body.trim()}>
          {busy && <Loader2Icon className="animate-spin" />}
          {t("saveMemo")}
        </Button>
      </div>
    </form>
  );
}

function UnitMemos({ scope, memos, canCode }: { scope: Scope; memos: Memo[]; canCode: boolean }) {
  const t = useTranslations("coding");
  const feedback = useActionFeedback();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <div className="w-full">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-xs">
        <NotebookPenIcon className="size-3" aria-hidden />
        {t("memoCount", { count: memos.length })}
      </button>
      {open && (
        <ul className="mt-1 grid gap-1">
          {memos.map((m) => (
            <li key={m.id} className="rounded-lg bg-muted/60 p-2 text-xs">
              <p className="whitespace-pre-line text-foreground">{m.body}</p>
              <div className="mt-1 flex items-center justify-between text-muted-foreground">
                <span>{m.authorName}</span>
                {canCode && (
                  <button type="button" disabled={pending} className="hover:text-destructive" onClick={() => startTransition(async () => void feedback(await deleteMemoAction(scope, m.id)))} aria-label={t("deleteMemo")}>
                    <Trash2Icon className="size-3.5" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SuggestButton({ scope, docKey, hasCodes, assistant }: { scope: Scope; docKey: string; hasCodes: boolean; assistant: string }) {
  const t = useTranslations("coding.assist");
  const feedback = useActionFeedback();
  const [pending, startTransition] = useTransition();
  const [mode] = useAiMode();
  return (
    <>
    <AiModeSelect />
    <Button
      variant="outline"
      size="sm"
      disabled={pending || !hasCodes}
      title={hasCodes ? t(assistant !== "builtin" ? "suggestHintClaude" : "suggestHint") : t("needCodes")}
      onClick={() =>
        startTransition(async () => {
          const result = await suggestCodingsAction(scope, docKey, mode);
          if (result.ok) feedback(result, result.data.created ? t("suggested", { count: result.data.created }) : t("noSuggestions"));
          else feedback(result);
        })
      }
    >
      {pending ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
      {t("suggest")}
    </Button>
    </>
  );
}

function CodesPanel({
  scope,
  base,
  codes,
  docCounts,
  focusCode,
  setFocusCode,
  suggestions,
  codeById,
  canCode,
}: {
  scope: Scope;
  base: string;
  codes: Code[];
  docCounts: Map<string, number>;
  focusCode: string | null;
  setFocusCode: (id: string | null) => void;
  suggestions: Coding[];
  codeById: Map<string, Code>;
  canCode: boolean;
}) {
  const t = useTranslations("coding");
  const feedback = useActionFeedback();
  const [filter, setFilter] = useState("");
  const [pending, startTransition] = useTransition();
  const q = filter.trim().toLowerCase();
  const shown = q ? codes.filter((c) => c.path.join(" ").toLowerCase().includes(q)) : codes;
  return (
    <div className="grid gap-4">
      {suggestions.length > 0 && (
        <section aria-labelledby="sugg-title" className="grid gap-2 rounded-2xl border border-dashed bg-card p-3">
          <h3 id="sugg-title" className="flex items-center gap-1.5 text-sm font-semibold">
            <SparklesIcon className="size-4 text-primary" aria-hidden />
            {t("suggestionsTitle", { count: suggestions.length })}
          </h3>
          <p className="text-xs text-muted-foreground">{t("suggestionsHint")}</p>
          <ul className="grid max-h-72 gap-1.5 overflow-y-auto">
            {suggestions.map((s) => {
              const code = codeById.get(s.codeId);
              return (
                <li key={s.id} className="grid gap-1 rounded-lg bg-muted/50 p-2 text-xs">
                  <a href={`#u-${s.unitId}`} className="line-clamp-2 hover:underline">
                    “{s.quote}”
                  </a>
                  <div className="flex items-center gap-1.5">
                    <span className="size-2 shrink-0 rounded-full" style={{ background: codeColorVar(code?.color ?? "1") }} aria-hidden />
                    <span className="min-w-0 flex-1 truncate font-medium">{code?.name}</span>
                    {canCode && (
                      <>
                        <Button size="icon-sm" variant="ghost" className="size-7" aria-label={t("acceptOne", { code: code?.name ?? "" })} disabled={pending} onClick={() => startTransition(async () => void feedback(await reviewSuggestionsAction(scope, [s.id], true)))}>
                          <CheckIcon />
                        </Button>
                        <Button size="icon-sm" variant="ghost" className="size-7" aria-label={t("rejectOne", { code: code?.name ?? "" })} disabled={pending} onClick={() => startTransition(async () => void feedback(await reviewSuggestionsAction(scope, [s.id], false)))}>
                          <XIcon />
                        </Button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          {canCode && (
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" disabled={pending} onClick={() => startTransition(async () => void feedback(await reviewSuggestionsAction(scope, suggestions.map((s) => s.id), true), t("acceptedAll")))}>
                {t("acceptAll")}
              </Button>
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => startTransition(async () => void feedback(await reviewSuggestionsAction(scope, suggestions.map((s) => s.id), false)))}>
                {t("rejectAll")}
              </Button>
            </div>
          )}
        </section>
      )}

      <section aria-labelledby="codes-title" className="grid gap-2">
        <div className="flex items-center justify-between gap-2">
          <h3 id="codes-title" className="text-sm font-semibold">
            {t("codes")}
          </h3>
          <Link href={`${base}/codebook`} className="text-xs text-muted-foreground hover:text-foreground hover:underline">
            {t("manage")}
          </Link>
        </div>
        {codes.length > 6 && <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t("filterCodes")} aria-label={t("filterCodes")} className="h-9" />}
        {codes.length === 0 ? (
          <p className="rounded-xl border border-dashed p-3 text-xs text-muted-foreground">{t("noCodesYet")}</p>
        ) : (
          <ul className="grid gap-0.5">
            {shown.map((c) => {
              const n = docCounts.get(c.id) ?? 0;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setFocusCode(focusCode === c.id ? null : c.id)}
                    aria-pressed={focusCode === c.id}
                    className={cn("flex min-h-9 w-full items-center gap-2 rounded-lg px-2 text-start text-sm hover:bg-accent/60", focusCode === c.id && "bg-accent")}
                    style={{ paddingInlineStart: `${0.5 + (q ? 0 : c.depth) * 0.9}rem` }}
                    title={c.definition ?? undefined}
                  >
                    <span className="size-2.5 shrink-0 rounded-full" style={{ background: codeColorVar(c.color) }} aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{c.name}</span>
                    <span className={cn("text-xs tabular-nums", n ? "text-foreground" : "text-muted-foreground")} title={t("inDoc")}>
                      {n}
                    </span>
                    <span className="w-8 text-end text-xs text-muted-foreground tabular-nums" title={t("inProject")}>
                      {c.count}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {codes.length > 0 && <p className="text-xs text-muted-foreground">{t("countsLegend")}</p>}
      </section>
    </div>
  );
}
