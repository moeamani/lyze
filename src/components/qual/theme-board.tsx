"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowLeftIcon, ArrowRightIcon, Loader2Icon, MoreHorizontalIcon, PencilIcon, PlusIcon, QuoteIcon, SparklesIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import type { ActionResult } from "@/server/actions/result";
import { useActionFeedback } from "@/components/common/use-action-feedback";
import { createThemeAction, deleteThemeAction, draftThemeAction, placeCodeAction, reorderThemesAction, updateThemeAction } from "@/server/actions/coding";
import { codeColorVar, CODE_COLORS, type CodeColor } from "@/lib/qual/codes";
import { cn } from "@/lib/utils";
import { ColorSwatches } from "./code-dialog";
import { SuggestionBadge } from "./assist-dialogs";

type Scope = { workspaceId: string; slug: string; projectId: string };
type BoardCode = { id: string; name: string; color: string; count: number; themeId: string | null; themePosition: number; path: string[] };
type BoardTheme = { id: string; name: string; description: string | null; color: string };

const UNSORTED = "unsorted";

/** Themes as columns, codes as cards: drag codes into the theme they belong to. */
export function ThemeBoard({ scope, base, themes, codes, canEdit, assistant }: { scope: Scope; base: string; themes: BoardTheme[]; codes: BoardCode[]; canEdit: boolean; assistant: "builtin" | "claude" }) {
  const t = useTranslations("themes");
  const feedback = useActionFeedback();
  const [pending, startTransition] = useTransition();
  const [dialog, setDialog] = useState<{ theme?: BoardTheme } | null>(null);
  const [deleting, setDeleting] = useState<BoardTheme | null>(null);

  const serverColumns = useMemo(() => {
    const cols: Record<string, string[]> = { [UNSORTED]: [] };
    for (const th of themes) cols[th.id] = [];
    for (const c of [...codes].sort((a, b) => a.themePosition - b.themePosition || a.name.localeCompare(b.name))) {
      (cols[c.themeId && cols[c.themeId] ? c.themeId : UNSORTED] ??= []).push(c.id);
    }
    return cols;
  }, [themes, codes]);
  const [dragging, setDragging] = useState<Record<string, string[]> | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const columns = dragging ?? serverColumns;
  const byId = useMemo(() => new Map(codes.map((c) => [c.id, c])), [codes]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const columnOf = (cols: Record<string, string[]>, id: string) => (id in cols ? id : Object.keys(cols).find((k) => cols[k]!.includes(id)));

  const onStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id));
    setDragging(structuredClone(serverColumns));
  };
  const onOver = ({ active, over }: DragOverEvent) => {
    if (!over || !dragging) return;
    const from = columnOf(dragging, String(active.id));
    const to = columnOf(dragging, String(over.id));
    if (!from || !to || from === to) return;
    setDragging((prev) => {
      if (!prev) return prev;
      const source = prev[from]!.filter((id) => id !== active.id);
      const target = [...prev[to]!];
      const i = target.indexOf(String(over.id));
      target.splice(i >= 0 ? i : target.length, 0, String(active.id));
      return { ...prev, [from]: source, [to]: target };
    });
  };
  const onEnd = ({ active, over }: DragEndEvent) => {
    const cols = dragging;
    setActiveId(null);
    if (!cols || !over) {
      setDragging(null);
      return;
    }
    const id = String(active.id);
    const col = columnOf(cols, id)!;
    const list = [...cols[col]!];
    const overIndex = list.indexOf(String(over.id));
    const from = list.indexOf(id);
    if (overIndex >= 0 && from >= 0 && overIndex !== from) {
      list.splice(from, 1);
      list.splice(overIndex, 0, id);
    }
    const index = list.indexOf(id);
    const before = serverColumns[columnOf(serverColumns, id)!]!;
    if (columnOf(serverColumns, id) === col && before.indexOf(id) === index) {
      setDragging(null);
      return;
    }
    setDragging({ ...cols, [col]: list });
    startTransition(async () => {
      feedback(await placeCodeAction(scope, id, col === UNSORTED ? null : col, index));
      setDragging(null);
    });
  };

  const moveTheme = (id: string, dir: -1 | 1) => {
    const ids = themes.map((th) => th.id);
    const i = ids.indexOf(id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    startTransition(async () => void feedback(await reorderThemesAction(scope, ids)));
  };

  const active = activeId ? byId.get(activeId) : undefined;
  const columnList: { id: string; theme?: BoardTheme }[] = [{ id: UNSORTED }, ...themes.map((th) => ({ id: th.id, theme: th }))];

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="me-auto text-sm text-muted-foreground">{t("intro")}</p>
        {pending && <Loader2Icon className="size-4 animate-spin text-muted-foreground" aria-label={t("saving")} />}
        {canEdit && (
          <Button size="sm" onClick={() => setDialog({})}>
            <PlusIcon />
            {t("new")}
          </Button>
        )}
      </div>
      {codes.length === 0 ? (
        <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">{t("noCodes")}</p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onStart} onDragOver={onOver} onDragEnd={onEnd} onDragCancel={() => (setDragging(null), setActiveId(null))}>
          <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-3 sm:mx-0 sm:px-0">
            {columnList.map(({ id, theme }, ci) => {
              const ids = columns[id] ?? [];
              const total = ids.reduce((s, cid) => s + (byId.get(cid)?.count ?? 0), 0);
              return (
                <Column key={id} id={id} label={theme?.name ?? t("unsorted")}>
                  <div className="grid gap-1 px-1">
                    <div className="flex items-center gap-2">
                      {theme && <span className="size-3 shrink-0 rounded-full" style={{ background: codeColorVar(theme.color) }} aria-hidden />}
                      <h3 className={cn("min-w-0 flex-1 truncate text-sm font-semibold", !theme && "text-muted-foreground")}>{theme?.name ?? t("unsorted")}</h3>
                      <span className="text-xs text-muted-foreground tabular-nums">{t("columnCount", { codes: ids.length, passages: total })}</span>
                      {theme && canEdit && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon-sm" className="size-7" aria-label={t("actionsFor", { name: theme.name })}>
                              <MoreHorizontalIcon />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => setDialog({ theme })}>
                              <PencilIcon />
                              {t("edit")}
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link href={`${base}/quotes?theme=${theme.id}`}>
                                <QuoteIcon />
                                {t("quotes")}
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem disabled={ci <= 1} onSelect={() => moveTheme(theme.id, -1)}>
                              <ArrowLeftIcon className="rtl:rotate-180" />
                              {t("moveLeft")}
                            </DropdownMenuItem>
                            <DropdownMenuItem disabled={ci >= columnList.length - 1} onSelect={() => moveTheme(theme.id, 1)}>
                              <ArrowRightIcon className="rtl:rotate-180" />
                              {t("moveRight")}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(theme)}>
                              <Trash2Icon />
                              {t("delete")}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                    {theme?.description && <p className="line-clamp-4 text-xs text-muted-foreground">{theme.description}</p>}
                    {!theme && <p className="text-xs text-muted-foreground">{t("unsortedHint")}</p>}
                  </div>
                  <SortableContext id={id} items={ids} strategy={verticalListSortingStrategy}>
                    <ul className="grid min-h-16 content-start gap-1.5" aria-label={theme?.name ?? t("unsorted")}>
                      {ids.map((cid) => {
                        const c = byId.get(cid);
                        return c ? <CodeCard key={cid} code={c} disabled={!canEdit} /> : null;
                      })}
                      {ids.length === 0 && <li className="rounded-xl border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">{t("dropHere")}</li>}
                    </ul>
                  </SortableContext>
                </Column>
              );
            })}
            {canEdit && (
              <button type="button" onClick={() => setDialog({})} className="grid w-64 shrink-0 place-items-center rounded-2xl border-2 border-dashed text-sm text-muted-foreground hover:bg-accent/40 hover:text-foreground">
                <span className="inline-flex items-center gap-2">
                  <PlusIcon className="size-4" aria-hidden />
                  {t("new")}
                </span>
              </button>
            )}
          </div>
          <DragOverlay dropAnimation={null}>{active ? <CardBody code={active} overlay /> : null}</DragOverlay>
        </DndContext>
      )}
      {canEdit && <p className="text-xs text-muted-foreground">{t("keyboardHint")}</p>}
      {dialog && <ThemeDialog scope={scope} theme={dialog.theme} count={themes.length} onClose={() => setDialog(null)} assistant={assistant} />}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={t("deleteTitle", { name: deleting?.name ?? "" })}
        description={t("deleteBody")}
        confirmLabel={t("delete")}
        onConfirm={async () => {
          if (deleting) feedback(await deleteThemeAction(scope, deleting.id), t("deleted"));
        }}
      />
    </div>
  );
}

function Column({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <section ref={setNodeRef} aria-label={label} className={cn("grid w-64 shrink-0 snap-start content-start gap-3 rounded-2xl border bg-muted/40 p-2.5 transition-colors", isOver && "border-primary/50 bg-accent-soft/40")}>
      {children}
    </section>
  );
}

function CodeCard({ code, disabled }: { code: BoardCode; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: code.id, disabled });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }} className={cn(isDragging && "opacity-40")} {...attributes} {...listeners}>
      <CardBody code={code} />
    </li>
  );
}

function CardBody({ code, overlay }: { code: BoardCode; overlay?: boolean }) {
  return (
    <div className={cn("flex cursor-grab items-center gap-2 rounded-xl border bg-card px-3 py-2 text-sm shadow-soft select-none", overlay && "shadow-lift")}>
      <span className="size-2.5 shrink-0 rounded-full" style={{ background: codeColorVar(code.color) }} aria-hidden />
      <span className="min-w-0 flex-1 truncate" title={code.path.join(" › ")}>
        {code.name}
      </span>
      <span className="text-xs text-muted-foreground tabular-nums">{code.count}</span>
    </div>
  );
}

function ThemeDialog({ scope, theme, count, onClose, assistant }: { scope: Scope; theme?: BoardTheme; count: number; onClose: () => void; assistant: "builtin" | "claude" }) {
  const t = useTranslations("themes");
  const tc = useTranslations("common");
  const feedback = useActionFeedback();
  const [name, setName] = useState(theme?.name ?? "");
  const [color, setColor] = useState<CodeColor>((theme?.color as CodeColor) ?? CODE_COLORS[(count + 2) % CODE_COLORS.length]!);
  const [description, setDescription] = useState(theme?.description ?? "");
  const [drafted, setDrafted] = useState(false);
  const [pending, startTransition] = useTransition();
  const [drafting, startDraft] = useTransition();
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent closeLabel={tc("close")} className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{theme ? t("editTitle") : t("newTitle")}</DialogTitle>
          <DialogDescription>{t("dialogHint")}</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            startTransition(async () => {
              const input = { name, color, description };
              const result: ActionResult<unknown> = theme ? await updateThemeAction(scope, theme.id, input) : await createThemeAction(scope, input);
              if (feedback(result, theme ? t("updated") : t("created"))) onClose();
            });
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor="theme-name">{t("name")}</Label>
            <Input id="theme-name" autoFocus value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label asChild>
              <span>{t("color")}</span>
            </Label>
            <ColorSwatches value={color} onChange={setColor} label={t("color")} />
          </div>
          <div className="grid gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Label htmlFor="theme-desc" className="me-auto">
                {t("description")}
              </Label>
              {drafted && <SuggestionBadge assistant={assistant} />}
              {theme && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={drafting}
                  onClick={() =>
                    startDraft(async () => {
                      const result = await draftThemeAction(scope, theme.id);
                      if (feedback(result) && result.ok) {
                        setDescription(result.data.text);
                        setDrafted(true);
                      }
                    })
                  }
                >
                  {drafting ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
                  {t("draft")}
                </Button>
              )}
            </div>
            <Textarea id="theme-desc" rows={5} value={description} onChange={(e) => (setDescription(e.target.value), setDrafted(false))} placeholder={t("descriptionPlaceholder")} />
            {drafted && <p className="text-xs text-muted-foreground">{t("draftNote")}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {tc("cancel")}
            </Button>
            <Button type="submit" disabled={pending || !name.trim()}>
              {pending && <Loader2Icon className="animate-spin" />}
              {theme ? tc("save") : t("create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
