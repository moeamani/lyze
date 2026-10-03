"use client";

import { useCallback, useEffect } from "react";
import { useTranslations } from "next-intl";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  CheckIcon,
  ClockIcon,
  CloudOffIcon,
  FileTextIcon,
  GripVerticalIcon,
  Loader2Icon,
  MessageSquareTextIcon,
  MoreHorizontalIcon,
  PlusIcon,
  Redo2Icon,
  Trash2Icon,
  Undo2Icon,
  UsersIcon,
  MonitorSmartphoneIcon,
  CoffeeIcon,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useFormDoc } from "@/components/builder/use-form-doc";
import { saveGuideAction } from "@/server/actions/interviews";
import {
  emptySection,
  guideQuestion,
  guideTemplate,
  questionCount,
  totalMinutes,
  type GuideDoc,
  type GuideQuestion,
  type GuideSection,
  type GuideTemplateKey,
} from "@/lib/interviews/guide";
import { cn } from "@/lib/utils";

type Scope = { workspaceId: string; slug: string; projectId: string; studyId: string };
type Update = (tag: string, mutate: (d: GuideDoc) => void) => void;

const TEMPLATES: { key: GuideTemplateKey | "blank"; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "blank", icon: FileTextIcon },
  { key: "discovery", icon: MessageSquareTextIcon },
  { key: "usability", icon: MonitorSmartphoneIcon },
  { key: "focusGroup", icon: UsersIcon },
  { key: "coffee", icon: CoffeeIcon },
];

export function GuideBuilder({ scope, initial, canEdit }: { scope: Scope; initial: GuideDoc; canEdit: boolean }) {
  const t = useTranslations("guide");
  const save = useCallback(async (doc: GuideDoc) => (await saveGuideAction(scope, doc)).ok, [scope]);
  const { doc, update, undo, redo, canUndo, canRedo, status, flush } = useFormDoc(initial, save, canEdit);

  // ⌘/Ctrl+Z and ⌘/Ctrl+Shift+Z, like the form builder.
  useEffect(() => {
    if (!canEdit) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z") return;
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea")) return; // let fields undo their own typing
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canEdit, undo, redo]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const empty = doc.sections.length === 0 && !doc.intro && !doc.outro;
  if (empty && canEdit) {
    return (
      <section aria-labelledby="guide-start" className="grid grid-cols-1 gap-4">
        <div>
          <h2 id="guide-start" className="text-lg font-semibold">
            {t("startTitle")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("startHint")}</p>
        </div>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {TEMPLATES.map(({ key, icon: Icon }) => (
            <li key={key}>
              <button
                type="button"
                onClick={() => update("template", (d) => Object.assign(d, key === "blank" ? { intro: "", outro: "", sections: [emptySection(t("firstTopic"))] } : guideTemplate(key)))}
                className="group flex h-full w-full items-start gap-3 rounded-2xl border bg-card p-4 text-start shadow-soft transition-[border-color,transform] outline-none hover:border-primary/40 focus-visible:ring-[3px] focus-visible:ring-ring/40 active:scale-[0.99]"
              >
                <span className="grid grid-cols-1 size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-soft-foreground">
                  <Icon className="size-5" />
                </span>
                <span className="grid grid-cols-1 gap-0.5">
                  <span className="font-medium">{t(`templates.${key}.name`)}</span>
                  <span className="text-sm text-muted-foreground">{t(`templates.${key}.hint`)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  const onSectionDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    update("reorderSections", (d) => {
      const from = d.sections.findIndex((s) => s.id === active.id);
      const to = d.sections.findIndex((s) => s.id === over.id);
      if (from >= 0 && to >= 0) d.sections = arrayMove(d.sections, from, to);
    });
  };

  const minutes = totalMinutes(doc);
  // Questions are numbered across topics.
  const firstNumbers = doc.sections.map((_, i) => 1 + doc.sections.slice(0, i).reduce((n, s) => n + s.questions.length, 0));

  return (
    <div className="grid grid-cols-1 gap-5">
      <div className="sticky top-[calc(var(--header-height)+0.5rem)] z-10 md:top-4 -mx-1 flex flex-wrap items-center gap-2 rounded-2xl border bg-card/95 p-2 ps-4 shadow-soft backdrop-blur">
        <p className="me-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="inline-flex items-center gap-1.5 font-medium">
            <ClockIcon className="size-4 text-muted-foreground" aria-hidden />
            {t("total", { minutes })}
          </span>
          <span className="text-muted-foreground">{t("summary", { topics: doc.sections.length, questions: questionCount(doc) })}</span>
        </p>
        {canEdit && (
          <>
            <SaveStatus status={status} onRetry={() => void flush()} />
            <Button variant="ghost" size="icon-sm" onClick={undo} disabled={!canUndo} aria-label={t("undo")}>
              <Undo2Icon />
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={redo} disabled={!canRedo} aria-label={t("redo")}>
              <Redo2Icon />
            </Button>
          </>
        )}
      </div>

      <ScriptCard id="guide-intro" label={t("intro")} hint={t("introHint")} value={doc.intro} canEdit={canEdit} onChange={(v) => update("intro", (d) => void (d.intro = v))} />

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onSectionDragEnd}>
        <SortableContext items={doc.sections.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          <ol className="grid grid-cols-1 gap-4" aria-label={t("topics")}>
            {doc.sections.map((section, index) => (
              <SectionCard key={section.id} section={section} index={index} firstNumber={firstNumbers[index]!} canEdit={canEdit} update={update} sensors={sensors} />
            ))}
          </ol>
        </SortableContext>
      </DndContext>

      {canEdit && (
        <Button
          variant="ghost"
          className="mx-auto border border-dashed"
          onClick={() => {
            const s = emptySection();
            update("addSection", (d) => void d.sections.push(s));
            requestAnimationFrame(() => document.getElementById(`title-${s.id}`)?.focus());
          }}
        >
          <PlusIcon />
          {t("addTopic")}
        </Button>
      )}

      <ScriptCard id="guide-outro" label={t("outro")} hint={t("outroHint")} value={doc.outro} canEdit={canEdit} onChange={(v) => update("outro", (d) => void (d.outro = v))} />
    </div>
  );
}

function SaveStatus({ status, onRetry }: { status: "idle" | "saving" | "saved" | "error"; onRetry: () => void }) {
  const t = useTranslations("guide");
  if (status === "idle") return null;
  if (status === "error")
    return (
      <Button variant="ghost" size="sm" className="text-destructive" onClick={onRetry}>
        <CloudOffIcon />
        {t("saveFailed")}
      </Button>
    );
  return (
    <span className="inline-flex items-center gap-1.5 px-2 text-xs text-muted-foreground" role="status" aria-live="polite">
      {status === "saving" ? <Loader2Icon className="size-3.5 animate-spin" aria-hidden /> : <CheckIcon className="size-3.5" aria-hidden />}
      {status === "saving" ? t("saving") : t("saved")}
    </span>
  );
}

function ScriptCard({ id, label, hint, value, canEdit, onChange }: { id: string; label: string; hint: string; value: string; canEdit: boolean; onChange: (v: string) => void }) {
  if (!canEdit && !value) return null;
  return (
    <Card className="gap-3 bg-muted/40 py-4 shadow-none">
      <CardContent className="grid grid-cols-1 gap-2 px-4">
        <Label htmlFor={id}>{label}</Label>
        {canEdit ? (
          <Textarea id={id} value={value} placeholder={hint} rows={2} onChange={(e) => onChange(e.target.value)} className="bg-card" />
        ) : (
          <p id={id} className="text-sm whitespace-pre-line text-muted-foreground">
            {value}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function SectionCard({
  section,
  index,
  firstNumber,
  canEdit,
  update,
  sensors,
}: {
  section: GuideSection;
  index: number;
  firstNumber: number;
  canEdit: boolean;
  update: Update;
  sensors: ReturnType<typeof useSensors>;
}) {
  const t = useTranslations("guide");
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: section.id, disabled: !canEdit });
  const edit = (tag: string, mutate: (s: GuideSection) => void) =>
    update(`${tag}:${section.id}`, (d) => {
      const s = d.sections.find((x) => x.id === section.id);
      if (s) mutate(s);
    });

  const onQuestionDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    edit("reorder", (s) => {
      const from = s.questions.findIndex((q) => q.id === active.id);
      const to = s.questions.findIndex((q) => q.id === over.id);
      if (from >= 0 && to >= 0) s.questions = arrayMove(s.questions, from, to);
    });
  };

  const addQuestion = () => {
    const q = guideQuestion("");
    edit("addQuestion", (s) => void s.questions.push(q));
    requestAnimationFrame(() => document.getElementById(`q-${q.id}`)?.focus());
  };

  return (
    <li ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }} className={cn(isDragging && "relative z-10 opacity-80")}>
      <Card className="gap-4">
        <CardHeader className="gap-3">
          <div className="flex items-start gap-2">
            {canEdit && (
              <button
                ref={setActivatorNodeRef}
                type="button"
                className="-ms-2 mt-1.5 grid size-8 shrink-0 cursor-grab touch-none place-items-center rounded-lg text-muted-foreground outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/40"
                aria-label={t("dragTopic", { n: index + 1 })}
                {...attributes}
                {...listeners}
              >
                <GripVerticalIcon className="size-4" />
              </button>
            )}
            <div className="grid grid-cols-1 min-w-0 flex-1 gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{t("topicN", { n: index + 1 })}</span>
              </div>
              {canEdit ? (
                <Input
                  id={`title-${section.id}`}
                  value={section.title}
                  onChange={(e) => edit("title", (s) => void (s.title = e.target.value))}
                  placeholder={t("topicPlaceholder")}
                  aria-label={t("topicTitle")}
                  className="h-10 text-base font-semibold"
                />
              ) : (
                <h3 className="text-base font-semibold">{section.title || t("untitled")}</h3>
              )}
              {canEdit ? (
                <Input
                  value={section.goal ?? ""}
                  onChange={(e) => edit("goal", (s) => void (s.goal = e.target.value || undefined))}
                  placeholder={t("goalPlaceholder")}
                  aria-label={t("goal")}
                  className="h-9 text-sm"
                />
              ) : (
                section.goal && <p className="text-sm text-muted-foreground">{section.goal}</p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {canEdit ? (
                <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <ClockIcon className="size-4" aria-hidden />
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={600}
                    value={section.minutes}
                    onChange={(e) => edit("minutes", (s) => void (s.minutes = Math.max(0, Math.min(600, Math.round(Number(e.target.value) || 0)))))}
                    className="h-9 w-16 text-center"
                    aria-label={t("minutesLabel")}
                  />
                  <span aria-hidden>{t("min")}</span>
                </label>
              ) : (
                <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                  <ClockIcon className="size-4" aria-hidden />
                  {t("minutes", { minutes: section.minutes })}
                </span>
              )}
              {canEdit && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm" aria-label={t("topicActions")}>
                      <MoreHorizontalIcon />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem variant="destructive" onSelect={() => update("removeSection", (d) => void (d.sections = d.sections.filter((s) => s.id !== section.id)))}>
                      <Trash2Icon />
                      {t("removeTopic")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3">
          {section.questions.length === 0 && !canEdit && <p className="text-sm text-muted-foreground">{t("noQuestions")}</p>}
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onQuestionDragEnd}>
            <SortableContext items={section.questions.map((q) => q.id)} strategy={verticalListSortingStrategy}>
              <ol className="grid grid-cols-1 gap-3">
                {section.questions.map((q, i) => (
                  <QuestionRow key={q.id} question={q} number={firstNumber + i} canEdit={canEdit} edit={(tag, mutate) => edit(`${tag}:${q.id}`, (s) => {
                    const target = s.questions.find((x) => x.id === q.id);
                    if (target) mutate(target);
                  })} onRemove={() => edit("removeQuestion", (s) => void (s.questions = s.questions.filter((x) => x.id !== q.id)))} />
                ))}
              </ol>
            </SortableContext>
          </DndContext>
          {canEdit && (
            <Button variant="ghost" size="sm" className="w-fit" onClick={addQuestion}>
              <PlusIcon />
              {t("addQuestion")}
            </Button>
          )}
        </CardContent>
      </Card>
    </li>
  );
}

function QuestionRow({
  question,
  number,
  canEdit,
  edit,
  onRemove,
}: {
  question: GuideQuestion;
  number: number;
  canEdit: boolean;
  edit: (tag: string, mutate: (q: GuideQuestion) => void) => void;
  onRemove: () => void;
}) {
  const t = useTranslations("guide");
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: question.id, disabled: !canEdit });

  if (!canEdit) {
    return (
      <li className="grid grid-cols-1 gap-1.5 rounded-xl bg-muted/40 p-3">
        <p className="flex gap-2 font-medium">
          <span className="text-muted-foreground tabular-nums">{number}.</span>
          <span className="whitespace-pre-line">{question.text}</span>
        </p>
        {question.probes.length > 0 && (
          <ul className="ms-6 grid list-disc gap-1 ps-4 text-sm text-muted-foreground">
            {question.probes.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        )}
        {question.note && <p className="ms-6 text-xs text-muted-foreground italic">{question.note}</p>}
      </li>
    );
  }

  return (
    <li ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }} className={cn("rounded-xl border bg-muted/30 p-3", isDragging && "relative z-10 bg-card shadow-lift")}>
      <div className="flex items-start gap-2">
        <button
          ref={setActivatorNodeRef}
          type="button"
          className="mt-1 grid size-8 shrink-0 cursor-grab touch-none place-items-center rounded-lg text-muted-foreground outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/40"
          aria-label={t("dragQuestion", { n: number })}
          {...attributes}
          {...listeners}
        >
          <GripVerticalIcon className="size-4" />
        </button>
        <span className="mt-2.5 w-5 shrink-0 text-sm text-muted-foreground tabular-nums" aria-hidden>
          {number}.
        </span>
        <div className="grid grid-cols-1 min-w-0 flex-1 gap-2">
          <Textarea
            id={`q-${question.id}`}
            value={question.text}
            onChange={(e) => edit("text", (q) => void (q.text = e.target.value))}
            placeholder={t("questionPlaceholder")}
            aria-label={t("questionN", { n: number })}
            rows={1}
            className="min-h-10 bg-card"
          />
          {question.probes.length > 0 && (
            <ul className="grid grid-cols-1 gap-1.5" aria-label={t("probes")}>
              {question.probes.map((probe, i) => (
                <li key={i} className="flex items-center gap-1.5 ps-3">
                  <span className="text-muted-foreground" aria-hidden>
                    ↳
                  </span>
                  <Input
                    value={probe}
                    onChange={(e) => edit("probe", (q) => void (q.probes[i] = e.target.value))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        edit("addProbe", (q) => void q.probes.splice(i + 1, 0, ""));
                        requestAnimationFrame(() => document.getElementById(`probe-${question.id}-${i + 1}`)?.focus());
                      }
                    }}
                    id={`probe-${question.id}-${i}`}
                    placeholder={t("probePlaceholder")}
                    aria-label={t("probeN", { n: i + 1 })}
                    className="h-9 bg-card text-sm"
                  />
                  <Button variant="ghost" size="icon-sm" aria-label={t("removeProbe", { n: i + 1 })} onClick={() => edit("removeProbe", (q) => void q.probes.splice(i, 1))}>
                    <XIcon />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {question.note !== undefined && (
            <Input
              value={question.note}
              onChange={(e) => edit("note", (q) => void (q.note = e.target.value))}
              placeholder={t("notePlaceholder")}
              aria-label={t("note")}
              className="h-9 bg-card text-sm italic"
            />
          )}
          <div className="flex flex-wrap gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-muted-foreground"
              disabled={question.probes.length >= 20}
              onClick={() => {
                edit("addProbe", (q) => void q.probes.push(""));
                requestAnimationFrame(() => document.getElementById(`probe-${question.id}-${question.probes.length}`)?.focus());
              }}
            >
              <PlusIcon />
              {t("addProbe")}
            </Button>
            {question.note === undefined && (
              <Button variant="ghost" size="sm" className="h-8 text-muted-foreground" onClick={() => edit("addNote", (q) => void (q.note = ""))}>
                <PlusIcon />
                {t("addNote")}
              </Button>
            )}
          </div>
        </div>
        <Button variant="ghost" size="icon-sm" aria-label={t("removeQuestion", { n: number })} onClick={onRemove}>
          <Trash2Icon />
        </Button>
      </div>
    </li>
  );
}
