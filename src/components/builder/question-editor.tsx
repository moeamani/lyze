"use client";

import { useRef } from "react";
import { useTranslations } from "next-intl";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { BracesIcon, GripVerticalIcon, PlusIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { changeQuestionType, newOptionId, QUESTION_CATEGORIES } from "@/lib/forms/questions";
import { pageIndexOfQuestion, type Option, type Question, type QuestionOf, type QuestionType } from "@/lib/forms/schema";
import { pipeToken } from "@/lib/forms/piping";
import { cn } from "@/lib/utils";
import { useBuilder, withQuestion } from "./context";
import { QuestionTypeIcon } from "./question-icon";
import { RulesForQuestion } from "./logic-editor";
import { useDefaultCopy } from "./use-copy";

export function Field({ label, htmlFor, hint, children, className }: { label: string; htmlFor?: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("grid gap-2", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function SwitchRow({ id, label, hint, checked, onChange, disabled }: { id: string; label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="grid gap-0.5">
        <Label htmlFor={id} className="leading-snug">
          {label}
        </Label>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}

/** A number input that maps "" ↔ undefined. */
export function NumberInput({ value, onChange, ...props }: Omit<React.ComponentProps<typeof Input>, "value" | "onChange" | "type"> & { value: number | undefined; onChange: (v: number | undefined) => void }) {
  return (
    <Input
      type="number"
      inputMode="decimal"
      value={value ?? ""}
      onChange={(e) => onChange(Number.isFinite(e.target.valueAsNumber) ? e.target.valueAsNumber : undefined)}
      {...props}
    />
  );
}

export function Section({ title, children, hint }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-4 border-t pt-5 first:border-t-0 first:pt-0">
      <div className="grid gap-0.5">
        <h3 className="text-sm font-semibold">{title}</h3>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

// ── Options list (sortable, paste-friendly) ─────────────────────────────────

export function OptionList({
  items,
  onChange,
  label,
  addLabel,
  newLabel,
  disabled,
}: {
  items: Option[];
  onChange: (items: Option[]) => void;
  label: string;
  addLabel: string;
  newLabel: (n: number) => string;
  disabled?: boolean;
}) {
  const t = useTranslations("builder");
  const listRef = useRef<HTMLOListElement>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const focusIndex = (i: number) => requestAnimationFrame(() => listRef.current?.querySelectorAll<HTMLInputElement>("input")[i]?.focus());

  const add = (at = items.length, label?: string) => {
    const next = [...items];
    next.splice(at, 0, { id: newOptionId(), label: label ?? newLabel(items.length + 1) });
    onChange(next);
    focusIndex(at);
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = items.findIndex((o) => o.id === active.id);
    const to = items.findIndex((o) => o.id === over.id);
    onChange(arrayMove(items, from, to));
  };

  return (
    <div className="grid gap-2">
      <span className="text-sm font-medium">{label}</span>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={items.map((o) => o.id)} strategy={verticalListSortingStrategy}>
          <ol ref={listRef} className="grid gap-1.5">
            {items.map((o, i) => (
              <OptionRow
                key={o.id}
                option={o}
                index={i}
                disabled={disabled}
                canRemove={items.length > 1}
                onLabel={(label) => onChange(items.map((x) => (x.id === o.id ? { ...x, label } : x)))}
                onRemove={() => {
                  onChange(items.filter((x) => x.id !== o.id));
                  focusIndex(Math.max(0, i - 1));
                }}
                onEnter={() => add(i + 1, "")}
                onPaste={(lines) => {
                  const next = [...items];
                  next[i] = { ...o, label: lines[0]! };
                  next.splice(i + 1, 0, ...lines.slice(1).map((label) => ({ id: newOptionId(), label })));
                  onChange(next);
                }}
                removeLabel={t("removeOption", { label: o.label || String(i + 1) })}
              />
            ))}
          </ol>
        </SortableContext>
      </DndContext>
      {!disabled && (
        <Button type="button" variant="ghost" size="sm" className="w-fit" onClick={() => add()}>
          <PlusIcon />
          {addLabel}
        </Button>
      )}
    </div>
  );
}

function OptionRow({
  option,
  index,
  disabled,
  canRemove,
  onLabel,
  onRemove,
  onEnter,
  onPaste,
  removeLabel,
}: {
  option: Option;
  index: number;
  disabled?: boolean;
  canRemove: boolean;
  onLabel: (label: string) => void;
  onRemove: () => void;
  onEnter: () => void;
  onPaste: (lines: string[]) => void;
  removeLabel: string;
}) {
  const t = useTranslations("builder");
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition } = useSortable({ id: option.id, disabled });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }} className="flex items-center gap-1">
      <button
        ref={setActivatorNodeRef}
        type="button"
        {...attributes}
        {...listeners}
        aria-label={t("dragHandle", { title: option.label || String(index + 1) })}
        className="grid h-10 w-6 shrink-0 cursor-grab touch-none place-items-center rounded-md text-muted-foreground/60 outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40"
        disabled={disabled}
      >
        <GripVerticalIcon className="size-4" />
      </button>
      <Input
        value={option.label}
        disabled={disabled}
        aria-label={t("option", { n: index + 1 })}
        className="h-10"
        onChange={(e) => onLabel(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onEnter();
          } else if (e.key === "Backspace" && !option.label && canRemove) {
            e.preventDefault();
            onRemove();
          }
        }}
        onPaste={(e) => {
          const lines = e.clipboardData
            .getData("text")
            .split(/\r?\n/)
            .map((l) => l.trim())
            .filter(Boolean);
          if (lines.length > 1) {
            e.preventDefault();
            onPaste(lines);
          }
        }}
      />
      {canRemove && !disabled && (
        <Button type="button" variant="ghost" size="icon-sm" onClick={onRemove} aria-label={removeLabel}>
          <XIcon />
        </Button>
      )}
    </li>
  );
}

// ── Piping ──────────────────────────────────────────────────────────────────

function PipeMenu({ questionId, onInsert }: { questionId: string; onInsert: (token: string) => void }) {
  const t = useTranslations("builder");
  const { doc } = useBuilder();
  const pageIndex = pageIndexOfQuestion(doc, questionId);
  const earlier: Question[] = [];
  outer: for (const [i, page] of doc.pages.entries()) {
    if (i > pageIndex) break;
    for (const q of page.questions) {
      if (q.id === questionId) break outer;
      earlier.push(q);
    }
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="h-8 text-muted-foreground">
          <BracesIcon />
          {t("insertAnswer")}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>{t("insertAnswer")}</DropdownMenuLabel>
        {earlier.length === 0 ? (
          <p className="px-2.5 py-2 text-sm text-muted-foreground">{t("noEarlierQuestions")}</p>
        ) : (
          earlier.map((q) => (
            <DropdownMenuItem key={q.id} onSelect={() => onInsert(pipeToken(q.id))}>
              <QuestionTypeIcon type={q.type} />
              <span className="truncate">{q.title || t("untitledQuestion")}</span>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ── Editor ──────────────────────────────────────────────────────────────────

export function QuestionEditor({ question }: { question: Question }) {
  const t = useTranslations("builder");
  const tt = useTranslations("questionTypes");
  const tc = useTranslations("questionCategories");
  const { update, canEdit } = useBuilder();
  const copy = useDefaultCopy();
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const id = question.id;

  const set = (field: string, fn: (q: Question) => void) => update(`q:${id}:${field}`, (d) => withQuestion(d, id, fn));
  const setConfig = <T extends QuestionType>(field: string, fn: (c: QuestionOf<T>["config"]) => void) =>
    set(field, (q) => fn((q as QuestionOf<T>).config as QuestionOf<T>["config"]));

  const insertToken = (token: string) => {
    const el = titleRef.current;
    const start = el?.selectionStart ?? question.title.length;
    const end = el?.selectionEnd ?? question.title.length;
    const next = question.title.slice(0, start) + token + question.title.slice(end);
    set("title", (q) => (q.title = next));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  };

  return (
    <fieldset disabled={!canEdit} className="grid min-w-0 gap-6">
      <Section title={t("questionSettings")}>
        <Field label={t("type")} htmlFor={`type-${id}`}>
          <Select value={question.type} onValueChange={(v) => update(`q:${id}:type`, (d) => {
            for (const page of d.pages) {
              const i = page.questions.findIndex((q) => q.id === id);
              if (i >= 0) page.questions[i] = changeQuestionType(page.questions[i]!, v as QuestionType, copy);
            }
          })}>
            <SelectTrigger id={`type-${id}`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {QUESTION_CATEGORIES.map((cat) => (
                <div key={cat.key} role="group" aria-label={tc(cat.key)}>
                  <div className="px-2.5 py-1.5 text-xs font-medium text-muted-foreground">{tc(cat.key)}</div>
                  {cat.types.map((type) => (
                    <SelectItem key={type} value={type}>
                      <QuestionTypeIcon type={type} />
                      {tt(type)}
                    </SelectItem>
                  ))}
                </div>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <div className="grid gap-2">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor={`title-${id}`}>{t("questionTitle")}</Label>
            <PipeMenu questionId={id} onInsert={insertToken} />
          </div>
          <Textarea
            ref={titleRef}
            id={`title-${id}`}
            rows={2}
            className="min-h-0"
            placeholder={t("questionPlaceholder")}
            value={question.title}
            onChange={(e) => set("title", (q) => (q.title = e.target.value))}
          />
        </div>

        <Field label={t("description")} htmlFor={`desc-${id}`}>
          <Textarea
            id={`desc-${id}`}
            rows={2}
            className="min-h-0"
            placeholder={t("descriptionPlaceholder")}
            value={question.description ?? ""}
            onChange={(e) => set("description", (q) => (q.description = e.target.value || undefined))}
          />
        </Field>

        <SwitchRow id={`req-${id}`} label={t("required")} hint={t("requiredHint")} checked={question.required} onChange={(v) => set("required", (q) => (q.required = v))} />

        <Field label={t("dataKind")} hint={t("dataKindHint")}>
          <ToggleGroup
            type="single"
            value={question.dataKind}
            onValueChange={(v) => v && set("dataKind", (q) => (q.dataKind = v as "quant" | "qual"))}
            aria-label={t("dataKind")}
            className="w-full"
          >
            <ToggleGroupItem value="quant">{t("quant")}</ToggleGroupItem>
            <ToggleGroupItem value="qual">{t("qual")}</ToggleGroupItem>
          </ToggleGroup>
        </Field>
      </Section>

      <TypeSettings question={question} setConfig={setConfig} />

      <Section title={t("logic")} hint={t("logicHint")}>
        <RulesForQuestion questionId={id} />
      </Section>
    </fieldset>
  );
}

function TypeSettings({
  question: q,
  setConfig,
}: {
  question: Question;
  setConfig: <T extends QuestionType>(field: string, fn: (c: QuestionOf<T>["config"]) => void) => void;
}) {
  const t = useTranslations("builder");
  const { canEdit } = useBuilder();
  const id = q.id;

  switch (q.type) {
    case "short_text":
      return (
        <Section title={t("options")}>
          <Field label={t("format")} htmlFor={`fmt-${id}`}>
            <Select value={q.config.format} onValueChange={(v) => setConfig<"short_text">("format", (c) => (c.format = v as typeof c.format))}>
              <SelectTrigger id={`fmt-${id}`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["text", "email", "url", "phone"] as const).map((f) => (
                  <SelectItem key={f} value={f}>
                    {t(`formats.${f}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label={t("placeholder")} htmlFor={`ph-${id}`}>
            <Input id={`ph-${id}`} value={q.config.placeholder ?? ""} onChange={(e) => setConfig<"short_text">("placeholder", (c) => (c.placeholder = e.target.value || undefined))} />
          </Field>
          <Field label={t("maxLength")} htmlFor={`ml-${id}`}>
            <NumberInput id={`ml-${id}`} min={1} max={5000} placeholder={t("noLimit")} value={q.config.maxLength} onChange={(v) => setConfig<"short_text">("maxLength", (c) => (c.maxLength = v ? Math.round(v) : undefined))} />
          </Field>
        </Section>
      );
    case "long_text":
      return (
        <Section title={t("options")}>
          <Field label={t("placeholder")} htmlFor={`ph-${id}`}>
            <Input id={`ph-${id}`} value={q.config.placeholder ?? ""} onChange={(e) => setConfig<"long_text">("placeholder", (c) => (c.placeholder = e.target.value || undefined))} />
          </Field>
          <Field label={t("maxLength")} htmlFor={`ml-${id}`}>
            <NumberInput id={`ml-${id}`} min={1} max={20000} placeholder={t("noLimit")} value={q.config.maxLength} onChange={(v) => setConfig<"long_text">("maxLength", (c) => (c.maxLength = v ? Math.round(v) : undefined))} />
          </Field>
        </Section>
      );
    case "single_choice":
    case "multiple_choice":
    case "dropdown":
    case "ranking":
      return (
        <Section title={t("options")} hint={t("pasteHint")}>
          <OptionList
            items={q.config.options}
            disabled={!canEdit}
            label={t("options")}
            addLabel={t("addOption")}
            newLabel={(n) => t("option", { n })}
            onChange={(items) => setConfig<"single_choice">("options", (c) => (c.options = items))}
          />
          {(q.type === "single_choice" || q.type === "multiple_choice") && (
            <SwitchRow id={`other-${id}`} label={t("allowOther")} checked={q.config.allowOther} onChange={(v) => setConfig<"single_choice">("allowOther", (c) => (c.allowOther = v))} />
          )}
          <SwitchRow id={`shuffle-${id}`} label={t("shuffle")} checked={q.config.shuffle} onChange={(v) => setConfig<"single_choice">("shuffle", (c) => (c.shuffle = v))} />
          {q.type === "multiple_choice" && (
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("minSelected")} htmlFor={`min-${id}`}>
                <NumberInput id={`min-${id}`} min={0} placeholder={t("noLimit")} value={q.config.minSelected} onChange={(v) => setConfig<"multiple_choice">("min", (c) => (c.minSelected = v ? Math.round(v) : undefined))} />
              </Field>
              <Field label={t("maxSelected")} htmlFor={`max-${id}`}>
                <NumberInput id={`max-${id}`} min={1} placeholder={t("noLimit")} value={q.config.maxSelected} onChange={(v) => setConfig<"multiple_choice">("max", (c) => (c.maxSelected = v ? Math.round(v) : undefined))} />
              </Field>
            </div>
          )}
        </Section>
      );
    case "rating":
      return (
        <Section title={t("options")}>
          <Field label={t("scaleMax")} htmlFor={`max-${id}`}>
            <Select value={String(q.config.max)} onValueChange={(v) => setConfig<"rating">("max", (c) => (c.max = Number(v)))}>
              <SelectTrigger id={`max-${id}`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {t("points", { n })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label={t("icon")}>
            <ToggleGroup type="single" value={q.config.icon} onValueChange={(v) => v && setConfig<"rating">("icon", (c) => (c.icon = v as typeof c.icon))} className="w-full" aria-label={t("icon")}>
              {(["star", "heart", "number"] as const).map((i) => (
                <ToggleGroupItem key={i} value={i}>
                  {t(`icons.${i}`)}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </Field>
        </Section>
      );
    case "likert":
      return (
        <Section title={t("labels")}>
          <OptionList
            items={q.config.labels.map((label, i) => ({ id: `l${i}`, label }))}
            disabled={!canEdit}
            label={t("points", { n: q.config.labels.length })}
            addLabel={t("addOption")}
            newLabel={(n) => String(n)}
            onChange={(items) => setConfig<"likert">("labels", (c) => (c.labels = items.slice(0, 11).map((o) => o.label)))}
          />
        </Section>
      );
    case "nps":
      return (
        <Section title={t("labels")}>
          <Field label={t("lowLabel")} htmlFor={`lo-${id}`}>
            <Input id={`lo-${id}`} value={q.config.lowLabel ?? ""} onChange={(e) => setConfig<"nps">("low", (c) => (c.lowLabel = e.target.value || undefined))} />
          </Field>
          <Field label={t("highLabel")} htmlFor={`hi-${id}`}>
            <Input id={`hi-${id}`} value={q.config.highLabel ?? ""} onChange={(e) => setConfig<"nps">("high", (c) => (c.highLabel = e.target.value || undefined))} />
          </Field>
        </Section>
      );
    case "slider":
      return (
        <Section title={t("options")}>
          <div className="grid grid-cols-3 gap-3">
            <Field label={t("min")} htmlFor={`min-${id}`}>
              <NumberInput id={`min-${id}`} value={q.config.min} onChange={(v) => setConfig<"slider">("min", (c) => (c.min = v ?? 0))} />
            </Field>
            <Field label={t("max")} htmlFor={`max-${id}`}>
              <NumberInput id={`max-${id}`} value={q.config.max} onChange={(v) => setConfig<"slider">("max", (c) => (c.max = v ?? 100))} />
            </Field>
            <Field label={t("step")} htmlFor={`step-${id}`}>
              <NumberInput id={`step-${id}`} min={0.01} value={q.config.step} onChange={(v) => setConfig<"slider">("step", (c) => (c.step = v && v > 0 ? v : 1))} />
            </Field>
          </div>
          <Field label={t("lowLabel")} htmlFor={`lo-${id}`}>
            <Input id={`lo-${id}`} value={q.config.minLabel ?? ""} onChange={(e) => setConfig<"slider">("low", (c) => (c.minLabel = e.target.value || undefined))} />
          </Field>
          <Field label={t("highLabel")} htmlFor={`hi-${id}`}>
            <Input id={`hi-${id}`} value={q.config.maxLabel ?? ""} onChange={(e) => setConfig<"slider">("high", (c) => (c.maxLabel = e.target.value || undefined))} />
          </Field>
        </Section>
      );
    case "number":
      return (
        <Section title={t("options")}>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("min")} htmlFor={`min-${id}`}>
              <NumberInput id={`min-${id}`} placeholder={t("noLimit")} value={q.config.min} onChange={(v) => setConfig<"number">("min", (c) => (c.min = v))} />
            </Field>
            <Field label={t("max")} htmlFor={`max-${id}`}>
              <NumberInput id={`max-${id}`} placeholder={t("noLimit")} value={q.config.max} onChange={(v) => setConfig<"number">("max", (c) => (c.max = v))} />
            </Field>
          </div>
          <Field label={t("unit")} htmlFor={`unit-${id}`}>
            <Input id={`unit-${id}`} placeholder={t("unitPlaceholder")} value={q.config.unit ?? ""} onChange={(e) => setConfig<"number">("unit", (c) => (c.unit = e.target.value || undefined))} />
          </Field>
          <SwitchRow id={`int-${id}`} label={t("integer")} checked={q.config.integer} onChange={(v) => setConfig<"number">("integer", (c) => (c.integer = v))} />
        </Section>
      );
    case "date":
      return (
        <Section title={t("options")}>
          <SwitchRow id={`time-${id}`} label={t("includeTime")} checked={q.config.includeTime} onChange={(v) => setConfig<"date">("time", (c) => (c.includeTime = v))} />
        </Section>
      );
    case "matrix":
      return (
        <Section title={t("options")}>
          <OptionList items={q.config.rows} disabled={!canEdit} label={t("rows")} addLabel={t("addRow")} newLabel={(n) => t("row", { n })} onChange={(items) => setConfig<"matrix">("rows", (c) => (c.rows = items))} />
          <OptionList items={q.config.columns} disabled={!canEdit} label={t("columns")} addLabel={t("addColumn")} newLabel={(n) => t("column", { n })} onChange={(items) => setConfig<"matrix">("columns", (c) => (c.columns = items.slice(0, 20)))} />
          <SwitchRow id={`multi-${id}`} label={t("multipleAnswers")} checked={q.config.multiple} onChange={(v) => setConfig<"matrix">("multiple", (c) => (c.multiple = v))} />
        </Section>
      );
    case "yes_no":
      return (
        <Section title={t("labels")}>
          <Field label={t("yesLabel")} htmlFor={`yes-${id}`}>
            <Input id={`yes-${id}`} value={q.config.yesLabel ?? ""} onChange={(e) => setConfig<"yes_no">("yes", (c) => (c.yesLabel = e.target.value || undefined))} />
          </Field>
          <Field label={t("noLabel")} htmlFor={`no-${id}`}>
            <Input id={`no-${id}`} value={q.config.noLabel ?? ""} onChange={(e) => setConfig<"yes_no">("no", (c) => (c.noLabel = e.target.value || undefined))} />
          </Field>
        </Section>
      );
    case "file_upload":
      return (
        <Section title={t("options")}>
          <Field label={t("accept")} htmlFor={`acc-${id}`}>
            <Select value={q.config.accept} onValueChange={(v) => setConfig<"file_upload">("accept", (c) => (c.accept = v as typeof c.accept))}>
              <SelectTrigger id={`acc-${id}`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["any", "image", "document"] as const).map((a) => (
                  <SelectItem key={a} value={a}>
                    {t(`acceptTypes.${a}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("maxFiles")} htmlFor={`mf-${id}`}>
              <NumberInput id={`mf-${id}`} min={1} max={10} value={q.config.maxFiles} onChange={(v) => setConfig<"file_upload">("maxFiles", (c) => (c.maxFiles = Math.min(10, Math.max(1, Math.round(v ?? 1)))))} />
            </Field>
            <Field label={t("maxSizeMb")} htmlFor={`ms-${id}`}>
              <NumberInput id={`ms-${id}`} min={1} max={50} value={q.config.maxSizeMb} onChange={(v) => setConfig<"file_upload">("maxSize", (c) => (c.maxSizeMb = Math.min(50, Math.max(1, Math.round(v ?? 10)))))} />
            </Field>
          </div>
        </Section>
      );
    case "media":
      return (
        <Section title={t("options")}>
          <Field label={t("mediaKind")}>
            <ToggleGroup type="single" value={q.config.mediaKind} onValueChange={(v) => v && setConfig<"media">("kind", (c) => (c.mediaKind = v as typeof c.mediaKind))} className="w-full" aria-label={t("mediaKind")}>
              <ToggleGroupItem value="audio">{t("mediaKinds.audio")}</ToggleGroupItem>
              <ToggleGroupItem value="video">{t("mediaKinds.video")}</ToggleGroupItem>
            </ToggleGroup>
          </Field>
          <Field label={t("maxSeconds")} htmlFor={`sec-${id}`}>
            <NumberInput id={`sec-${id}`} min={10} max={600} value={q.config.maxSeconds} onChange={(v) => setConfig<"media">("seconds", (c) => (c.maxSeconds = Math.min(600, Math.max(10, Math.round(v ?? 120)))))} />
          </Field>
        </Section>
      );
  }
}
