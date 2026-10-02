"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ArrowDownIcon, ArrowUpIcon, CheckIcon, HeartIcon, Loader2Icon, MicIcon, PaperclipIcon, SquareIcon, StarIcon, VideoIcon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { OTHER, type AnswerValue, type ChoiceAnswer, type FileAnswer, type MatrixAnswer, type MultiChoiceAnswer } from "@/lib/forms/answers";
import type { Option, Question, QuestionOf } from "@/lib/forms/schema";
import { seededShuffle } from "@/lib/forms/random";
import { fmt, type RunnerLabels } from "./labels";

export type UploadedFile = { id: string; name: string; size: number; mime: string };

export type FieldProps<Q extends Question = Question> = {
  question: Q;
  value: AnswerValue | undefined;
  onChange: (value: AnswerValue | undefined) => void;
  labels: RunnerLabels;
  /** Seed for stable option shuffling per respondent. */
  seed: string;
  inputId: string;
  describedBy?: string;
  invalid: boolean;
  upload: (questionId: string, file: File) => Promise<UploadedFile>;
  fileInfo: Record<string, UploadedFile>;
};

// ── Shared styles ───────────────────────────────────────────────────────────

const inputClass =
  "w-full rounded-xl border border-input bg-card px-3.5 py-3 text-base shadow-soft outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25 aria-invalid:border-destructive";

const optionCard =
  "flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border bg-card px-3.5 py-3 text-base shadow-soft transition-[border-color,background-color,box-shadow] hover:border-primary/40 has-[:checked]:border-primary has-[:checked]:bg-accent-soft/70 has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/30";

const nativeCheck = "size-5 shrink-0 cursor-pointer accent-[var(--primary)]";

function ordered(options: Option[], shuffle: boolean, seed: string) {
  return shuffle ? seededShuffle(options, seed) : options;
}

// ── Text-ish ────────────────────────────────────────────────────────────────

export function ShortTextField({ question, value, onChange, inputId, describedBy, invalid }: FieldProps<QuestionOf<"short_text">>) {
  const format = question.config.format;
  return (
    <input
      id={inputId}
      type={format === "email" ? "email" : format === "url" ? "url" : format === "phone" ? "tel" : "text"}
      inputMode={format === "email" ? "email" : format === "url" ? "url" : format === "phone" ? "tel" : undefined}
      autoComplete={format === "email" ? "email" : format === "phone" ? "tel" : "off"}
      className={inputClass}
      placeholder={question.config.placeholder}
      maxLength={question.config.maxLength}
      value={typeof value === "string" ? value : ""}
      onChange={(e) => onChange(e.target.value || undefined)}
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      aria-required={question.required || undefined}
    />
  );
}

export function LongTextField({ question, value, onChange, inputId, describedBy, invalid }: FieldProps<QuestionOf<"long_text">>) {
  const text = typeof value === "string" ? value : "";
  const max = question.config.maxLength;
  return (
    <div className="grid gap-1.5">
      <textarea
        id={inputId}
        rows={4}
        className={cn(inputClass, "field-sizing-content min-h-28 resize-none")}
        placeholder={question.config.placeholder}
        maxLength={max}
        value={text}
        onChange={(e) => onChange(e.target.value || undefined)}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        aria-required={question.required || undefined}
      />
      {max && (
        <span className="text-end text-xs text-muted-foreground tabular-nums" aria-hidden>
          {text.length}/{max}
        </span>
      )}
    </div>
  );
}

export function NumberField({ question, value, onChange, inputId, describedBy, invalid }: FieldProps<QuestionOf<"number">>) {
  const [draft, setDraft] = useState(typeof value === "number" ? String(value) : "");
  return (
    <div className="flex items-center gap-2">
      <input
        id={inputId}
        type="number"
        inputMode={question.config.integer ? "numeric" : "decimal"}
        step={question.config.integer ? 1 : "any"}
        min={question.config.min}
        max={question.config.max}
        className={cn(inputClass, "max-w-48 tabular-nums")}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          const n = e.target.valueAsNumber;
          onChange(Number.isFinite(n) ? n : undefined);
        }}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        aria-required={question.required || undefined}
      />
      {question.config.unit && <span className="text-muted-foreground">{question.config.unit}</span>}
    </div>
  );
}

export function DateField({ question, value, onChange, inputId, describedBy, invalid }: FieldProps<QuestionOf<"date">>) {
  return (
    <input
      id={inputId}
      type={question.config.includeTime ? "datetime-local" : "date"}
      className={cn(inputClass, "max-w-64")}
      value={typeof value === "string" ? value : ""}
      onChange={(e) => onChange(e.target.value || undefined)}
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      aria-required={question.required || undefined}
    />
  );
}

// ── Choices ─────────────────────────────────────────────────────────────────

function OtherInput({ value, onChange, labels, label }: { value: string; onChange: (v: string) => void; labels: RunnerLabels; label: string }) {
  return (
    <input
      type="text"
      aria-label={label}
      className={cn(inputClass, "mt-2 py-2.5 animate-in fade-in-0 slide-in-from-top-1 duration-150")}
      placeholder={labels.otherPlaceholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      maxLength={500}
    />
  );
}

export function SingleChoiceField({ question, value, onChange, labels, seed, describedBy }: FieldProps<QuestionOf<"single_choice">>) {
  const name = useId();
  const v = value as ChoiceAnswer | undefined;
  const options = ordered(question.config.options, question.config.shuffle, `${seed}:${question.id}`);
  return (
    <div role="radiogroup" aria-describedby={describedBy} aria-required={question.required || undefined} className="grid gap-2">
      {options.map((o) => (
        <label key={o.id} className={optionCard}>
          <input type="radio" name={name} className={nativeCheck} checked={v?.choice === o.id} onChange={() => onChange({ choice: o.id })} />
          <span>{o.label}</span>
        </label>
      ))}
      {question.config.allowOther && (
        <div>
          <label className={optionCard}>
            <input
              type="radio"
              name={name}
              className={nativeCheck}
              checked={v?.choice === OTHER}
              onChange={() => onChange({ choice: OTHER, other: v?.other ?? "" })}
            />
            <span>{labels.other}</span>
          </label>
          {v?.choice === OTHER && (
            <OtherInput value={v.other ?? ""} onChange={(other) => onChange({ choice: OTHER, other })} labels={labels} label={labels.otherPlaceholder} />
          )}
        </div>
      )}
    </div>
  );
}

export function MultipleChoiceField({ question, value, onChange, labels, seed, describedBy }: FieldProps<QuestionOf<"multiple_choice">>) {
  const v = (value as MultiChoiceAnswer | undefined) ?? { choices: [] };
  const options = ordered(question.config.options, question.config.shuffle, `${seed}:${question.id}`);
  const { minSelected, maxSelected } = question.config;
  const atMax = !!maxSelected && v.choices.length >= maxSelected;

  const toggle = (id: string, on: boolean) => {
    const choices = on ? [...v.choices, id] : v.choices.filter((c) => c !== id);
    onChange(choices.length ? { choices, other: choices.includes(OTHER) ? v.other : undefined } : undefined);
  };

  const hint =
    minSelected && maxSelected
      ? fmt(labels.chooseBetween, { min: minSelected, max: maxSelected })
      : maxSelected
        ? fmt(labels.chooseUpTo, { n: maxSelected })
        : minSelected
          ? fmt(labels.chooseAtLeast, { n: minSelected })
          : null;

  return (
    <div role="group" aria-describedby={describedBy} className="grid gap-2">
      {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
      {options.map((o) => {
        const checked = v.choices.includes(o.id);
        return (
          <label key={o.id} className={cn(optionCard, !checked && atMax && "cursor-not-allowed opacity-60")}>
            <input type="checkbox" className={nativeCheck} checked={checked} disabled={!checked && atMax} onChange={(e) => toggle(o.id, e.target.checked)} />
            <span>{o.label}</span>
          </label>
        );
      })}
      {question.config.allowOther && (
        <div>
          <label className={cn(optionCard, !v.choices.includes(OTHER) && atMax && "cursor-not-allowed opacity-60")}>
            <input
              type="checkbox"
              className={nativeCheck}
              checked={v.choices.includes(OTHER)}
              disabled={!v.choices.includes(OTHER) && atMax}
              onChange={(e) => toggle(OTHER, e.target.checked)}
            />
            <span>{labels.other}</span>
          </label>
          {v.choices.includes(OTHER) && (
            <OtherInput value={v.other ?? ""} onChange={(other) => onChange({ choices: v.choices, other })} labels={labels} label={labels.otherPlaceholder} />
          )}
        </div>
      )}
    </div>
  );
}

export function DropdownField({ question, value, onChange, labels, seed, inputId, describedBy, invalid }: FieldProps<QuestionOf<"dropdown">>) {
  const v = value as ChoiceAnswer | undefined;
  const options = ordered(question.config.options, question.config.shuffle, `${seed}:${question.id}`);
  return (
    <select
      id={inputId}
      className={cn(inputClass, "max-w-md appearance-auto pe-3")}
      value={v?.choice ?? ""}
      onChange={(e) => onChange(e.target.value ? { choice: e.target.value } : undefined)}
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      aria-required={question.required || undefined}
    >
      <option value="">{labels.choose}</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function YesNoField({ question, value, onChange, labels, describedBy }: FieldProps<QuestionOf<"yes_no">>) {
  const name = useId();
  const choices = [
    { v: true, label: question.config.yesLabel || labels.yes },
    { v: false, label: question.config.noLabel || labels.no },
  ];
  return (
    <div role="radiogroup" aria-describedby={describedBy} aria-required={question.required || undefined} className="grid grid-cols-2 gap-2 sm:max-w-sm">
      {choices.map((c) => (
        <label key={String(c.v)} className={cn(optionCard, "justify-center font-medium")}>
          <input type="radio" name={name} className="sr-only" checked={value === c.v} onChange={() => onChange(c.v)} />
          {value === c.v && <CheckIcon className="size-4 text-primary" aria-hidden />}
          <span>{c.label}</span>
        </label>
      ))}
    </div>
  );
}

// ── Scales ──────────────────────────────────────────────────────────────────

/** A row of radio "pills" for numeric scales. Arrow keys work natively within the group. */
function ScalePills({
  name,
  points,
  value,
  onChange,
  render,
  ariaLabel,
  className,
}: {
  name: string;
  points: { value: number; label: string; ariaLabel?: string }[];
  value: number | undefined;
  onChange: (v: number) => void;
  render?: (p: { value: number; label: string }, selected: boolean) => React.ReactNode;
  ariaLabel?: (p: { value: number; label: string }) => string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {points.map((p) => {
        const selected = value === p.value;
        return (
          <label
            key={p.value}
            className={cn(
              "grid min-h-12 min-w-12 flex-1 cursor-pointer place-items-center rounded-xl border bg-card px-2 text-base font-medium tabular-nums shadow-soft transition-[border-color,background-color,transform] select-none hover:border-primary/40 active:scale-95 has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/30",
              selected && "border-primary bg-primary text-primary-foreground hover:border-primary",
            )}
          >
            <input type="radio" name={name} className="sr-only" checked={selected} onChange={() => onChange(p.value)} aria-label={ariaLabel?.(p) ?? p.ariaLabel ?? p.label} />
            {render ? render(p, selected) : p.label}
          </label>
        );
      })}
    </div>
  );
}

export function RatingField({ question, value, onChange, labels, describedBy }: FieldProps<QuestionOf<"rating">>) {
  const name = useId();
  const max = question.config.max;
  const current = typeof value === "number" ? value : undefined;
  const [hover, setHover] = useState<number | null>(null);
  const Icon = question.config.icon === "heart" ? HeartIcon : StarIcon;

  if (question.config.icon === "number") {
    return (
      <div role="radiogroup" aria-describedby={describedBy}>
        <ScalePills
          name={name}
          value={current}
          onChange={onChange}
          points={Array.from({ length: max }, (_, i) => ({ value: i + 1, label: String(i + 1) }))}
          ariaLabel={(p) => fmt(labels.ratingValue, { value: p.value, max })}
        />
      </div>
    );
  }
  const shown = hover ?? current ?? 0;
  return (
    <div role="radiogroup" aria-describedby={describedBy} className="flex flex-wrap gap-1" onMouseLeave={() => setHover(null)}>
      {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
        <label
          key={n}
          className="grid size-12 cursor-pointer place-items-center rounded-xl transition-transform active:scale-90 has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/30"
          onMouseEnter={() => setHover(n)}
        >
          <input type="radio" name={name} className="sr-only" checked={current === n} onChange={() => onChange(n)} aria-label={fmt(labels.ratingValue, { value: n, max })} />
          <Icon
            aria-hidden
            className={cn("size-8 transition-colors", n <= shown ? "fill-primary text-primary" : "text-muted-foreground/50")}
            strokeWidth={1.5}
          />
        </label>
      ))}
    </div>
  );
}

export function LikertField({ question, value, onChange, describedBy }: FieldProps<QuestionOf<"likert">>) {
  const name = useId();
  const current = typeof value === "number" ? value : undefined;
  return (
    <div role="radiogroup" aria-describedby={describedBy} className="grid gap-2 sm:flex sm:gap-2">
      {question.config.labels.map((label, i) => (
        <label key={i} className={cn(optionCard, "sm:flex-1 sm:flex-col sm:justify-center sm:gap-2 sm:px-2 sm:text-center sm:text-sm")}>
          <input type="radio" name={name} className={nativeCheck} checked={current === i + 1} onChange={() => onChange(i + 1)} />
          <span>{label}</span>
        </label>
      ))}
    </div>
  );
}

export function NpsField({ question, value, onChange, labels, describedBy }: FieldProps<QuestionOf<"nps">>) {
  const name = useId();
  const low = question.config.lowLabel || labels.notLikely;
  const high = question.config.highLabel || labels.veryLikely;
  return (
    <div role="radiogroup" aria-describedby={describedBy} className="grid gap-2">
      <ScalePills
        name={name}
        className="grid grid-cols-6 gap-1.5 sm:flex sm:gap-1.5"
        value={typeof value === "number" ? value : undefined}
        onChange={onChange}
        points={Array.from({ length: 11 }, (_, i) => ({
          value: i,
          label: String(i),
          ariaLabel: i === 0 ? `0 – ${low}` : i === 10 ? `10 – ${high}` : String(i),
        }))}
      />
      <div className="flex justify-between gap-4 text-sm text-muted-foreground" aria-hidden>
        <span>0 · {low}</span>
        <span className="text-end">10 · {high}</span>
      </div>
    </div>
  );
}

export function SliderField({ question, value, onChange, labels, inputId, describedBy }: FieldProps<QuestionOf<"slider">>) {
  const { min, max, step, minLabel, maxLabel } = question.config;
  const current = typeof value === "number" ? value : undefined;
  const mid = Math.round((min + max) / 2 / step) * step;
  return (
    <div className="grid gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <output htmlFor={inputId} className={cn("text-2xl font-semibold tabular-nums", current === undefined && "text-base font-normal text-muted-foreground")}>
          {current ?? labels.sliderUnset}
        </output>
      </div>
      <input
        id={inputId}
        type="range"
        min={min}
        max={max}
        step={step}
        value={current ?? mid}
        onChange={(e) => onChange(e.target.valueAsNumber)}
        onPointerDown={(e) => current === undefined && onChange((e.target as HTMLInputElement).valueAsNumber)}
        className={cn("h-11 w-full cursor-pointer accent-[var(--primary)]", current === undefined && "opacity-60")}
        aria-describedby={describedBy}
        aria-valuetext={current === undefined ? labels.sliderUnset : String(current)}
      />
      <div className="flex justify-between gap-4 text-sm text-muted-foreground" aria-hidden>
        <span>{minLabel ?? min}</span>
        <span className="text-end">{maxLabel ?? max}</span>
      </div>
    </div>
  );
}

// ── Ranking & matrix ────────────────────────────────────────────────────────

export function RankingField({ question, value, onChange, labels, seed, describedBy }: FieldProps<QuestionOf<"ranking">>) {
  const byId = new Map(question.config.options.map((o) => [o.id, o]));
  const initial = ordered(question.config.options, question.config.shuffle, `${seed}:${question.id}`).map((o) => o.id);
  const confirmed = Array.isArray(value) && value.length === initial.length;
  const order = confirmed ? (value as string[]) : initial;
  const [announce, setAnnounce] = useState("");

  const move = (index: number, delta: number) => {
    const next = [...order];
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item!);
    onChange(next);
    setAnnounce(`${byId.get(item!)?.label}: ${index + delta + 1}`);
  };

  return (
    <div className="grid gap-2" aria-describedby={describedBy}>
      <p className="text-sm text-muted-foreground">{labels.rankHint}</p>
      <ol className="grid gap-2">
        {order.map((id, i) => {
          const label = byId.get(id)?.label ?? "";
          return (
            <li key={id} className={cn("flex min-h-12 items-center gap-2 rounded-xl border bg-card py-1.5 ps-3 pe-1.5 shadow-soft", confirmed && "border-primary/40")}>
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-accent-soft text-sm font-semibold text-accent-soft-foreground tabular-nums">{i + 1}</span>
              <span className="min-w-0 flex-1">{label}</span>
              <button
                type="button"
                className="grid size-11 place-items-center rounded-lg text-muted-foreground outline-none hover:bg-accent disabled:opacity-30 focus-visible:ring-[3px] focus-visible:ring-ring/30"
                onClick={() => move(i, -1)}
                disabled={i === 0}
                aria-label={fmt(labels.moveUp, { item: label })}
              >
                <ArrowUpIcon className="size-4" />
              </button>
              <button
                type="button"
                className="grid size-11 place-items-center rounded-lg text-muted-foreground outline-none hover:bg-accent disabled:opacity-30 focus-visible:ring-[3px] focus-visible:ring-ring/30"
                onClick={() => move(i, 1)}
                disabled={i === order.length - 1}
                aria-label={fmt(labels.moveDown, { item: label })}
              >
                <ArrowDownIcon className="size-4" />
              </button>
            </li>
          );
        })}
      </ol>
      <div className="flex items-center gap-2">
        {confirmed ? (
          <span className="inline-flex items-center gap-1.5 text-sm text-success">
            <CheckIcon className="size-4" aria-hidden /> {labels.rankConfirmed}
          </span>
        ) : (
          <button type="button" onClick={() => onChange(order)} className="rounded-xl border bg-card px-3.5 py-2.5 text-sm font-medium shadow-soft outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/30">
            {labels.rankConfirm}
          </button>
        )}
      </div>
      <span className="sr-only" aria-live="polite">
        {announce}
      </span>
    </div>
  );
}

export function MatrixField({ question, value, onChange, describedBy }: FieldProps<QuestionOf<"matrix">>) {
  const groupId = useId();
  const v = (value as MatrixAnswer | undefined) ?? {};
  const { rows, columns, multiple } = question.config;
  const template = { gridTemplateColumns: `minmax(9rem, 1.6fr) repeat(${columns.length}, minmax(0, 1fr))` };

  const set = (rowId: string, colId: string, on: boolean) => {
    const next = { ...v };
    if (multiple) {
      const current = new Set((next[rowId] as string[] | undefined) ?? []);
      if (on) current.add(colId);
      else current.delete(colId);
      if (current.size) next[rowId] = [...current];
      else delete next[rowId];
    } else {
      next[rowId] = colId;
    }
    onChange(Object.keys(next).length ? next : undefined);
  };

  return (
    <div className="grid gap-2" aria-describedby={describedBy}>
      <div className="hidden items-end gap-1 px-3 text-center text-xs font-medium text-muted-foreground sm:grid" style={template} aria-hidden>
        <span />
        {columns.map((c) => (
          <span key={c.id} className="px-1">
            {c.label}
          </span>
        ))}
      </div>
      {rows.map((row) => {
        const cell = v[row.id];
        const has = (colId: string) => (Array.isArray(cell) ? cell.includes(colId) : cell === colId);
        return (
          <div
            key={row.id}
            role={multiple ? "group" : "radiogroup"}
            aria-labelledby={`${groupId}-${row.id}-label`}
            className="rounded-xl border bg-card p-3 shadow-soft sm:grid sm:items-center sm:gap-1 sm:py-2"
            style={template}
          >
            <span id={`${groupId}-${row.id}-label`} className="mb-2 block font-medium sm:mb-0 sm:pe-2 sm:text-sm">
              {row.label}
            </span>
            <div className="flex flex-wrap gap-1.5 sm:contents">
              {columns.map((c) => (
                <label
                  key={c.id}
                  className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 text-sm transition-colors hover:border-primary/40 has-[:checked]:border-primary has-[:checked]:bg-accent-soft has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/30 sm:border-transparent sm:px-0 sm:has-[:checked]:border-transparent sm:has-[:checked]:bg-transparent"
                >
                  <input
                    type={multiple ? "checkbox" : "radio"}
                    name={`${groupId}-${row.id}`}
                    className={nativeCheck}
                    checked={has(c.id)}
                    onChange={(e) => set(row.id, c.id, e.target.checked)}
                  />
                  <span className="sm:sr-only">{c.label}</span>
                </label>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Files & media ───────────────────────────────────────────────────────────

const ACCEPT_ATTR = { any: undefined, image: "image/*", document: ".pdf,.doc,.docx,.odt,.txt,.rtf,.csv,.xls,.xlsx" } as const;

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function FileChips({ ids, info, onRemove, labels }: { ids: string[]; info: Record<string, UploadedFile>; onRemove: (id: string) => void; labels: RunnerLabels }) {
  return (
    <ul className="grid gap-2">
      {ids.map((id) => {
        const f = info[id];
        const name = f?.name ?? id;
        return (
          <li key={id} className="flex min-h-12 items-center gap-3 rounded-xl border bg-card py-1.5 ps-3 pe-1.5 text-sm shadow-soft">
            <PaperclipIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="min-w-0 flex-1 truncate">{name}</span>
            {f && <span className="text-xs text-muted-foreground tabular-nums">{formatSize(f.size)}</span>}
            <button
              type="button"
              onClick={() => onRemove(id)}
              aria-label={fmt(labels.remove, { name })}
              className="grid size-10 place-items-center rounded-lg text-muted-foreground outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/30"
            >
              <XIcon className="size-4" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function useUploader(props: FieldProps) {
  const { question, value, onChange, upload } = props;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ids = (value as FileAnswer | undefined)?.fileIds ?? [];
  const run = async (list: File[], max: number) => {
    setError(null);
    setBusy(true);
    try {
      const uploaded: string[] = [];
      for (const file of list.slice(0, Math.max(0, max - ids.length))) {
        uploaded.push((await upload(question.id, file)).id);
      }
      if (uploaded.length) onChange({ fileIds: [...ids, ...uploaded] });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const remove = (id: string) => {
    const rest = ids.filter((x) => x !== id);
    onChange(rest.length ? { fileIds: rest } : undefined);
  };
  return { ids, busy, error, run, remove };
}

export function FileUploadField(props: FieldProps<QuestionOf<"file_upload">>) {
  const { question, labels, inputId, describedBy, fileInfo } = props;
  const { maxFiles, maxSizeMb, accept } = question.config;
  const { ids, busy, error, run, remove } = useUploader(props as unknown as FieldProps);
  const [dragging, setDragging] = useState(false);
  const full = ids.length >= maxFiles;

  return (
    <div className="grid gap-2">
      {!full && (
        <label
          htmlFor={inputId}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void run([...e.dataTransfer.files], maxFiles);
          }}
          className={cn(
            "flex min-h-28 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed bg-card/60 p-4 text-center transition-colors hover:border-primary/50 has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/30",
            dragging && "border-primary bg-accent-soft/60",
          )}
        >
          <input
            id={inputId}
            type="file"
            className="sr-only"
            accept={ACCEPT_ATTR[accept]}
            multiple={maxFiles > 1}
            disabled={busy}
            aria-describedby={describedBy}
            onChange={(e) => {
              void run([...(e.target.files ?? [])], maxFiles);
              e.target.value = "";
            }}
          />
          {busy ? (
            <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2Icon className="size-4 animate-spin" aria-hidden /> {labels.uploading}
            </span>
          ) : (
            <>
              <span className="font-medium text-primary">{maxFiles > 1 ? labels.chooseFiles : labels.chooseFile}</span>
              <span className="text-sm text-muted-foreground">
                {labels.dropHint} · {fmt(labels.maxSize, { mb: maxSizeMb })}
              </span>
            </>
          )}
        </label>
      )}
      {ids.length > 0 && <FileChips ids={ids} info={fileInfo} onRemove={remove} labels={labels} />}
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function pickMime(kind: "audio" | "video") {
  const candidates = kind === "audio" ? ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"] : ["video/webm;codecs=vp9,opus", "video/webm", "video/mp4"];
  if (typeof MediaRecorder === "undefined") return undefined;
  return candidates.find((m) => MediaRecorder.isTypeSupported(m));
}

export function MediaField(props: FieldProps<QuestionOf<"media">>) {
  const { question, labels, inputId, describedBy, fileInfo } = props;
  const { mediaKind, maxSeconds } = question.config;
  const { ids, busy, error, run, remove } = useUploader(props as unknown as FieldProps);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [denied, setDenied] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const preview = useRef<HTMLVideoElement | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [localUrl, setLocalUrl] = useState<string | null>(null);

  useEffect(
    () => () => {
      stream.current?.getTracks().forEach((t) => t.stop());
      if (timer.current) clearInterval(timer.current);
    },
    [],
  );
  useEffect(() => () => void (localUrl && URL.revokeObjectURL(localUrl)), [localUrl]);

  const stop = () => {
    if (recorder.current?.state === "recording") recorder.current.stop();
    if (timer.current) clearInterval(timer.current);
    setRecording(false);
  };

  const start = async () => {
    setDenied(false);
    try {
      const s = await navigator.mediaDevices.getUserMedia(mediaKind === "audio" ? { audio: true } : { audio: true, video: { facingMode: "user" } });
      stream.current = s;
      if (preview.current && mediaKind === "video") {
        preview.current.srcObject = s;
        void preview.current.play();
      }
      const mime = pickMime(mediaKind);
      const rec = new MediaRecorder(s, mime ? { mimeType: mime } : undefined);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = () => {
        s.getTracks().forEach((t) => t.stop());
        const type = rec.mimeType || mime || (mediaKind === "audio" ? "audio/webm" : "video/webm");
        const blob = new Blob(chunks, { type });
        const ext = type.includes("mp4") ? "mp4" : type.includes("ogg") ? "ogg" : "webm";
        setLocalUrl(URL.createObjectURL(blob));
        for (const id of ids) remove(id);
        void run([new File([blob], `${mediaKind}-response.${ext}`, { type: type.split(";")[0] })], 1);
      };
      recorder.current = rec;
      rec.start(1000);
      setElapsed(0);
      setRecording(true);
      timer.current = setInterval(() => {
        setElapsed((t) => {
          if (t + 1 >= maxSeconds) stop();
          return t + 1;
        });
      }, 1000);
    } catch {
      setDenied(true);
    }
  };

  const Icon = mediaKind === "audio" ? MicIcon : VideoIcon;
  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div className="grid gap-3" aria-describedby={describedBy}>
      {mediaKind === "video" && (recording || localUrl) && (
        <video ref={preview} className="aspect-video w-full max-w-md rounded-xl bg-black object-cover" muted={recording} playsInline controls={!recording} src={recording ? undefined : (localUrl ?? undefined)} />
      )}
      {mediaKind === "audio" && localUrl && !recording && (
        <audio className="w-full max-w-md" controls src={localUrl} />
      )}
      <div className="flex flex-wrap items-center gap-3">
        {recording ? (
          <button
            type="button"
            onClick={stop}
            className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-destructive px-4 font-medium text-destructive-foreground shadow-soft outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30"
          >
            <SquareIcon className="size-4 fill-current" aria-hidden />
            {labels.stop}
          </button>
        ) : (
          <button
            type="button"
            onClick={start}
            disabled={busy}
            className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-primary px-4 font-medium text-primary-foreground shadow-soft outline-none disabled:opacity-60 focus-visible:ring-[3px] focus-visible:ring-ring/30"
          >
            <Icon className="size-4" aria-hidden />
            {ids.length ? labels.reRecord : labels.record}
          </button>
        )}
        <span className="text-sm text-muted-foreground tabular-nums" aria-live="polite">
          {recording ? (
            <span className="inline-flex items-center gap-2">
              <span className="size-2 animate-pulse rounded-full bg-destructive" aria-hidden />
              {labels.recording} {mmss(elapsed)} / {mmss(maxSeconds)}
            </span>
          ) : busy ? (
            labels.uploading
          ) : (
            fmt(labels.maxLength, { max: maxSeconds })
          )}
        </span>
      </div>
      {!recording && (
        <label className="w-fit cursor-pointer text-sm text-primary underline-offset-4 hover:underline has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/30">
          {labels.uploadRecording}
          <input
            id={inputId}
            type="file"
            className="sr-only"
            accept={mediaKind === "audio" ? "audio/*" : "video/*"}
            capture={mediaKind === "audio" ? undefined : "user"}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) {
                for (const id of ids) remove(id);
                setLocalUrl(URL.createObjectURL(f));
                void run([f], 1);
              }
              e.target.value = "";
            }}
          />
        </label>
      )}
      {ids.length > 0 && !recording && <FileChips ids={ids} info={fileInfo} onRemove={(id) => (remove(id), setLocalUrl(null))} labels={labels} />}
      {denied && <p className="text-sm text-muted-foreground">{labels.micDenied}</p>}
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

// ── Dispatcher ──────────────────────────────────────────────────────────────

export function QuestionInput(props: FieldProps) {
  const q = props.question;
  switch (q.type) {
    case "short_text":
      return <ShortTextField {...(props as FieldProps<typeof q>)} />;
    case "long_text":
      return <LongTextField {...(props as FieldProps<typeof q>)} />;
    case "single_choice":
      return <SingleChoiceField {...(props as FieldProps<typeof q>)} />;
    case "multiple_choice":
      return <MultipleChoiceField {...(props as FieldProps<typeof q>)} />;
    case "dropdown":
      return <DropdownField {...(props as FieldProps<typeof q>)} />;
    case "rating":
      return <RatingField {...(props as FieldProps<typeof q>)} />;
    case "likert":
      return <LikertField {...(props as FieldProps<typeof q>)} />;
    case "nps":
      return <NpsField {...(props as FieldProps<typeof q>)} />;
    case "slider":
      return <SliderField {...(props as FieldProps<typeof q>)} />;
    case "number":
      return <NumberField {...(props as FieldProps<typeof q>)} />;
    case "date":
      return <DateField {...(props as FieldProps<typeof q>)} />;
    case "ranking":
      return <RankingField {...(props as FieldProps<typeof q>)} />;
    case "matrix":
      return <MatrixField {...(props as FieldProps<typeof q>)} />;
    case "yes_no":
      return <YesNoField {...(props as FieldProps<typeof q>)} />;
    case "file_upload":
      return <FileUploadField {...(props as FieldProps<typeof q>)} />;
    case "media":
      return <MediaField {...(props as FieldProps<typeof q>)} />;
  }
}

/** Types whose input is a single labelable control (so the title can be a <label>). */
export function isLabelable(q: Question) {
  return q.type === "short_text" || q.type === "long_text" || q.type === "number" || q.type === "date" || q.type === "dropdown" || q.type === "slider";
}
