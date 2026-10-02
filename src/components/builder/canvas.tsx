"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CopyIcon,
  FileStackIcon,
  GitBranchIcon,
  GripVerticalIcon,
  MoreHorizontalIcon,
  SettingsIcon,
  ShuffleIcon,
  Trash2Icon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { createQuestion, duplicateQuestion, newPageId } from "@/lib/forms/questions";
import type { Page, Question, QuestionType } from "@/lib/forms/schema";
import { cn } from "@/lib/utils";
import { AddQuestionButton } from "./add-question-menu";
import { removeQuestionEverywhere, useBuilder } from "./context";
import { QuestionTypeIcon } from "./question-icon";
import { useDefaultCopy } from "./use-copy";

type Arrangement = Record<string, string[]>;

function arrangementOf(pages: Page[]): Arrangement {
  return Object.fromEntries(pages.map((p) => [p.id, p.questions.map((q) => q.id)]));
}

function containerOf(arr: Arrangement, id: string): string | undefined {
  if (id in arr) return id;
  if (id.startsWith("page:")) return id.slice(5);
  return Object.keys(arr).find((pageId) => arr[pageId]!.includes(id));
}

export function Canvas() {
  const t = useTranslations("builder");
  const { doc, update, select, canEdit } = useBuilder();
  const copy = useDefaultCopy();
  const [dragging, setDragging] = useState<Arrangement | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const byId = useMemo(() => new Map(doc.pages.flatMap((p) => p.questions.map((q) => [q.id, q] as const))), [doc]);
  const view = dragging ?? arrangementOf(doc.pages);

  // Question numbers follow the (live) arrangement.
  const numbers = useMemo(() => {
    const m = new Map<string, number>();
    let n = 0;
    for (const p of doc.pages) for (const id of view[p.id] ?? []) m.set(id, ++n);
    return m;
  }, [doc.pages, view]);

  const onDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id));
    setDragging(arrangementOf(doc.pages));
  };

  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over || !dragging) return;
    const from = containerOf(dragging, String(active.id));
    const to = containerOf(dragging, String(over.id));
    if (!from || !to || from === to) return;
    setDragging((prev) => {
      if (!prev) return prev;
      const source = prev[from]!.filter((id) => id !== active.id);
      const target = [...prev[to]!];
      const overIndex = target.indexOf(String(over.id));
      target.splice(overIndex >= 0 ? overIndex : target.length, 0, String(active.id));
      return { ...prev, [from]: source, [to]: target };
    });
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const arr = dragging;
    setDragging(null);
    setActiveId(null);
    if (!arr || !over) return;
    const container = containerOf(arr, String(active.id));
    const overContainer = containerOf(arr, String(over.id));
    let final = arr;
    if (container && container === overContainer) {
      const items = arr[container]!;
      const from = items.indexOf(String(active.id));
      const to = items.indexOf(String(over.id));
      if (from >= 0 && to >= 0 && from !== to) final = { ...arr, [container]: arrayMove(items, from, to) };
    }
    const before = arrangementOf(doc.pages);
    if (JSON.stringify(before) === JSON.stringify(final)) return;
    update("reorder", (d) => {
      const all = new Map(d.pages.flatMap((p) => p.questions.map((q) => [q.id, q] as const)));
      for (const page of d.pages) page.questions = (final[page.id] ?? []).map((id) => all.get(id)!).filter(Boolean);
    });
  };

  const addQuestion = (pageId: string, type: QuestionType) => {
    const q = createQuestion(type, copy);
    update("add", (d) => d.pages.find((p) => p.id === pageId)?.questions.push(q));
    select({ kind: "question", id: q.id });
    requestAnimationFrame(() => document.getElementById(`card-${q.id}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  };

  const addPage = () => {
    const id = newPageId();
    update("addPage", (d) => d.pages.push({ id, shuffleQuestions: false, questions: [] }));
    select({ kind: "page", id });
  };

  const active = activeId ? byId.get(activeId) : undefined;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setDragging(null);
        setActiveId(null);
      }}
    >
      <div className="flex flex-col gap-6">
        {doc.pages.map((page, index) => (
          <PageSection
            key={page.id}
            page={page}
            index={index}
            questions={(view[page.id] ?? []).map((id) => byId.get(id)!).filter(Boolean)}
            numbers={numbers}
            onAdd={(type) => addQuestion(page.id, type)}
          />
        ))}
        {canEdit && (
          <Button variant="ghost" className="mx-auto border border-dashed" onClick={addPage}>
            <FileStackIcon />
            {t("addPage")}
          </Button>
        )}
      </div>
      <DragOverlay dropAnimation={null}>{active ? <QuestionCardBody question={active} number={numbers.get(active.id)} overlay /> : null}</DragOverlay>
    </DndContext>
  );
}

function PageSection({
  page,
  index,
  questions,
  numbers,
  onAdd,
}: {
  page: Page;
  index: number;
  questions: Question[];
  numbers: Map<string, number>;
  onAdd: (type: QuestionType) => void;
}) {
  const t = useTranslations("builder");
  const { doc, update, selection, select, canEdit } = useBuilder();
  const { setNodeRef, isOver } = useDroppable({ id: `page:${page.id}` });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const selected = selection?.kind === "page" && selection.id === page.id;
  const pageCount = doc.pages.length;
  const hasSkip = doc.logic.some((r) => (r.action === "skip_to_page" || r.action === "end_form") && r.when.conditions.some((c) => page.questions.some((q) => q.id === c.questionId)));

  const move = (delta: number) =>
    update("movePage", (d) => {
      const [p] = d.pages.splice(index, 1);
      d.pages.splice(index + delta, 0, p!);
    });

  const remove = () =>
    update("deletePage", (d) => {
      for (const q of d.pages[index]!.questions) removeQuestionEverywhere(d, q.id);
      d.pages.splice(index, 1);
      d.logic = d.logic.filter((r) => !(r.action === "skip_to_page" && r.target === page.id));
    });

  return (
    <section aria-label={t("page", { n: index + 1 })} className={cn("rounded-2xl border bg-card/60 p-3 shadow-soft transition-colors sm:p-4", selected && "border-primary/50 ring-[3px] ring-ring/15")}>
      {(pageCount > 1 || page.title || page.description) && (
        <div className="mb-3 flex items-start gap-2">
          <button
            type="button"
            onClick={() => select({ kind: "page", id: page.id })}
            className="min-w-0 flex-1 rounded-lg px-1.5 py-1 text-start outline-none hover:bg-accent/60 focus-visible:ring-[3px] focus-visible:ring-ring/40"
          >
            <span className="flex items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {t("page", { n: index + 1 })}
              {page.shuffleQuestions && <ShuffleIcon className="size-3.5" aria-label={t("shuffleQuestions")} />}
              {hasSkip && <GitBranchIcon className="size-3.5" aria-label={t("logic")} />}
            </span>
            <span className={cn("block truncate font-medium", !page.title && "text-muted-foreground")}>{page.title || t("untitledPage")}</span>
          </button>
          {canEdit && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={t("pageSettings")}>
                  <MoreHorizontalIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => select({ kind: "page", id: page.id })}>
                  <SettingsIcon />
                  {t("pageSettings")}
                </DropdownMenuItem>
                <DropdownMenuItem disabled={index === 0} onSelect={() => move(-1)}>
                  <ArrowUpIcon />
                  {t("moveUp")}
                </DropdownMenuItem>
                <DropdownMenuItem disabled={index === pageCount - 1} onSelect={() => move(1)}>
                  <ArrowDownIcon />
                  {t("moveDown")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" disabled={pageCount === 1} onSelect={() => (page.questions.length ? setConfirmDelete(true) : remove())}>
                  <Trash2Icon />
                  {t("deletePage")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      )}

      <SortableContext id={page.id} items={questions.map((q) => q.id)} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className={cn("flex min-h-16 flex-col gap-2 rounded-xl transition-colors", isOver && questions.length === 0 && "bg-accent-soft/50")}>
          {questions.length === 0 && (
            <p className="grid min-h-16 place-items-center rounded-xl border border-dashed px-4 text-center text-sm text-muted-foreground">{t("emptyPage")}</p>
          )}
          {questions.map((q) => (
            <SortableQuestion key={q.id} question={q} number={numbers.get(q.id)} pageIndex={index} />
          ))}
        </div>
      </SortableContext>

      {canEdit && <AddQuestionButton onPick={onAdd} variant="ghost" className="mt-2 w-full border border-dashed text-muted-foreground hover:text-foreground" />}

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t("deletePage")}
        description={t("deletePageBody", { count: page.questions.length })}
        confirmLabel={t("deletePage")}
        onConfirm={async () => remove()}
      />
    </section>
  );
}

function SortableQuestion({ question, number, pageIndex }: { question: Question; number?: number; pageIndex: number }) {
  const t = useTranslations("builder");
  const { doc, update, selection, select, canEdit } = useBuilder();
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: question.id, disabled: !canEdit });
  const selected = selection?.kind === "question" && selection.id === question.id;
  const title = question.title || t("untitledQuestion");

  const duplicate = () => {
    const copy = duplicateQuestion(question);
    update("duplicate", (d) => {
      for (const page of d.pages) {
        const i = page.questions.findIndex((q) => q.id === question.id);
        if (i >= 0) page.questions.splice(i + 1, 0, copy);
      }
    });
    select({ kind: "question", id: copy.id });
  };

  const moveTo = (target: number) =>
    update("moveQuestion", (d) => {
      const q = d.pages[pageIndex]!.questions.find((x) => x.id === question.id)!;
      d.pages[pageIndex]!.questions = d.pages[pageIndex]!.questions.filter((x) => x.id !== question.id);
      d.pages[target]!.questions.push(q);
    });

  const remove = () => {
    update("delete", (d) => removeQuestionEverywhere(d, question.id));
    if (selected) select(null);
  };

  return (
    <div
      ref={setNodeRef}
      id={`card-${question.id}`}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        "group relative flex items-stretch rounded-xl border bg-card shadow-soft transition-[border-color,box-shadow,opacity]",
        selected && "border-primary/60 ring-[3px] ring-ring/20",
        isDragging && "opacity-40",
      )}
    >
      {canEdit && (
        <button
          ref={setActivatorNodeRef}
          type="button"
          {...attributes}
          {...listeners}
          aria-label={t("dragHandle", { title })}
          className="flex w-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-s-xl text-muted-foreground/60 outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40 active:cursor-grabbing sm:w-7"
        >
          <GripVerticalIcon className="size-4" />
        </button>
      )}
      <button
        type="button"
        onClick={() => select({ kind: "question", id: question.id })}
        aria-pressed={selected}
        className={cn("min-w-0 flex-1 rounded-xl py-3 text-start outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40", canEdit ? "ps-1 pe-2" : "px-3")}
      >
        <QuestionCardBody question={question} number={number} logic={doc.logic.some((r) => r.target === question.id)} />
      </button>
      {canEdit && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" className="m-1.5 shrink-0" aria-label={`${t("moveToPage")}, ${t("duplicate")}, ${t("delete")}`}>
              <MoreHorizontalIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={duplicate}>
              <CopyIcon />
              {t("duplicate")}
            </DropdownMenuItem>
            {doc.pages.length > 1 && (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <FileStackIcon />
                  {t("moveToPage")}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {doc.pages.map((p, i) => (
                    <DropdownMenuItem key={p.id} disabled={i === pageIndex} onSelect={() => moveTo(i)}>
                      {t("page", { n: i + 1 })}
                      {p.title ? ` · ${p.title}` : ""}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={remove}>
              <Trash2Icon />
              {t("delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

function QuestionCardBody({ question, number, overlay, logic }: { question: Question; number?: number; overlay?: boolean; logic?: boolean }) {
  const t = useTranslations("builder");
  const tt = useTranslations("questionTypes");
  return (
    <div className={cn("flex min-w-0 items-start gap-3", overlay && "rounded-xl border bg-card p-3 shadow-lift")}>
      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent-soft-foreground">
        <QuestionTypeIcon type={question.type} className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("block font-medium text-pretty break-words", !question.title && "text-muted-foreground italic")}>
          {number !== undefined && <span className="me-1 text-muted-foreground tabular-nums">{number}.</span>}
          {question.title || t("untitledQuestion")}
          {question.required && (
            <span className="ms-0.5 text-destructive" aria-label={t("required")}>
              *
            </span>
          )}
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <span>{tt(question.type)}</span>
          <span aria-hidden>·</span>
          <span>{t(question.dataKind)}</span>
          {logic && (
            <span className="inline-flex items-center gap-1 text-primary">
              <GitBranchIcon className="size-3" aria-hidden />
              {t("logic")}
            </span>
          )}
        </span>
        <Summary question={question} />
      </span>
    </div>
  );
}

function Summary({ question }: { question: Question }) {
  const t = useTranslations("builder");
  const chips = (labels: string[]) => (
    <span className="mt-2 flex flex-wrap gap-1">
      {labels.slice(0, 4).map((l, i) => (
        <span key={i} className="max-w-40 truncate rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
          {l || "—"}
        </span>
      ))}
      {labels.length > 4 && <span className="px-1 text-xs text-muted-foreground">+{labels.length - 4}</span>}
    </span>
  );
  switch (question.type) {
    case "single_choice":
    case "multiple_choice":
    case "dropdown":
    case "ranking":
      return chips(question.config.options.map((o) => o.label));
    case "likert":
      return chips(question.config.labels);
    case "matrix":
      return chips(question.config.rows.map((r) => r.label));
    case "rating":
      return <span className="mt-1 block text-xs text-muted-foreground">1–{question.config.max} · {t(`icons.${question.config.icon}`)}</span>;
    case "slider":
      return <span className="mt-1 block text-xs text-muted-foreground tabular-nums">{question.config.min} – {question.config.max}</span>;
    default:
      return null;
  }
}
