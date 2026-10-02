"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { GitBranchIcon, PencilIcon, PlusIcon, Trash2Icon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { newRuleId } from "@/lib/forms/questions";
import { ruleSourcePage } from "@/lib/forms/logic";
import {
  findQuestion,
  type Condition,
  type ConditionGroup,
  type LogicActionType,
  type LogicRule,
  type Operator,
  type Question,
} from "@/lib/forms/schema";
import { useBuilder } from "./context";

// ── Which operators make sense for which question ───────────────────────────

export function operatorsFor(q: Question | undefined): Operator[] {
  if (!q) return ["answered", "not_answered"];
  switch (q.type) {
    case "single_choice":
    case "dropdown":
      return ["equals", "not_equals", "answered", "not_answered"];
    case "multiple_choice":
    case "matrix":
      return ["contains", "not_contains", "answered", "not_answered"];
    case "ranking":
      return ["equals", "answered", "not_answered"];
    case "yes_no":
      return ["equals", "answered", "not_answered"];
    case "rating":
    case "likert":
    case "nps":
    case "slider":
    case "number":
      return ["equals", "not_equals", "gt", "gte", "lt", "lte", "answered", "not_answered"];
    case "short_text":
    case "long_text":
      return ["equals", "not_equals", "contains", "not_contains", "answered", "not_answered"];
    case "date":
      return ["equals", "answered", "not_answered"];
    case "file_upload":
    case "media":
      return ["answered", "not_answered"];
  }
}

function defaultValue(q: Question | undefined): Condition["value"] {
  if (!q) return undefined;
  switch (q.type) {
    case "single_choice":
    case "dropdown":
    case "multiple_choice":
    case "ranking":
      return q.config.options[0]?.id;
    case "matrix":
      return q.config.columns[0]?.id;
    case "yes_no":
      return true;
    case "rating":
    case "likert":
      return 3;
    case "nps":
      return 7;
    case "slider":
      return q.config.min;
    case "number":
      return 0;
    default:
      return "";
  }
}

// ── Condition editing ───────────────────────────────────────────────────────

function ValueInput({ question, value, onChange, label }: { question: Question; value: Condition["value"]; onChange: (v: Condition["value"]) => void; label: string }) {
  const t = useTranslations("respondent");
  const choices =
    question.type === "single_choice" || question.type === "dropdown" || question.type === "multiple_choice" || question.type === "ranking"
      ? question.config.options
      : question.type === "matrix"
        ? question.config.columns
        : question.type === "likert"
          ? question.config.labels.map((l, i) => ({ id: String(i + 1), label: `${i + 1} · ${l}` }))
          : null;

  if (question.type === "yes_no") {
    return (
      <Select value={String(value ?? true)} onValueChange={(v) => onChange(v === "true")}>
        <SelectTrigger className="w-full" aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="true">{question.config.yesLabel || t("yes")}</SelectItem>
          <SelectItem value="false">{question.config.noLabel || t("no")}</SelectItem>
        </SelectContent>
      </Select>
    );
  }
  if (choices) {
    return (
      <Select value={value === undefined ? undefined : String(value)} onValueChange={(v) => onChange(question.type === "likert" ? Number(v) : v)}>
        <SelectTrigger className="w-full" aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {choices.map((o) => (
            <SelectItem key={o.id} value={o.id}>
              {o.label || "—"}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  const numeric = question.type === "rating" || question.type === "nps" || question.type === "slider" || question.type === "number";
  return (
    <Input
      aria-label={label}
      type={numeric ? "number" : question.type === "date" ? (question.config.includeTime ? "datetime-local" : "date") : "text"}
      value={value === undefined ? "" : String(value)}
      onChange={(e) => onChange(numeric ? (Number.isFinite(e.target.valueAsNumber) ? e.target.valueAsNumber : undefined) : e.target.value)}
    />
  );
}

export function ConditionGroupEditor({ group, onChange, eligible }: { group: ConditionGroup; onChange: (g: ConditionGroup) => void; eligible: Question[] }) {
  const t = useTranslations("builder");
  const to = useTranslations("operators");
  const { doc } = useBuilder();

  const setCondition = (i: number, c: Condition) => onChange({ ...group, conditions: group.conditions.map((x, j) => (j === i ? c : x)) });

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">{t("ruleWhen")}</span>
        <Select value={group.match} onValueChange={(v) => onChange({ ...group, match: v as "all" | "any" })}>
          <SelectTrigger size="sm" className="w-auto" aria-label={t("ruleWhen")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("matchAll")}</SelectItem>
            <SelectItem value="any">{t("matchAny")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <ol className="grid gap-2">
        {group.conditions.map((c, i) => {
          const q = findQuestion(doc, c.questionId);
          const ops = operatorsFor(q);
          const needsValue = c.operator !== "answered" && c.operator !== "not_answered";
          return (
            <li key={i} className="grid gap-2 rounded-xl border bg-muted/40 p-3">
              <div className="flex items-start gap-2">
                <Select
                  value={c.questionId || undefined}
                  onValueChange={(id) => {
                    const nq = findQuestion(doc, id);
                    setCondition(i, { questionId: id, operator: operatorsFor(nq)[0]!, value: defaultValue(nq) });
                  }}
                >
                  <SelectTrigger className="w-full min-w-0" aria-label={t("chooseQuestion")}>
                    <SelectValue placeholder={t("chooseQuestion")} />
                  </SelectTrigger>
                  <SelectContent>
                    {eligible.map((eq) => (
                      <SelectItem key={eq.id} value={eq.id}>
                        <span className="truncate">{eq.title || t("untitledQuestion")}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {group.conditions.length > 1 && (
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={t("removeCondition")} onClick={() => onChange({ ...group, conditions: group.conditions.filter((_, j) => j !== i) })}>
                    <XIcon />
                  </Button>
                )}
              </div>
              {q && (
                <div className="grid gap-2 sm:grid-cols-2">
                  <Select value={c.operator} onValueChange={(v) => setCondition(i, { ...c, operator: v as Operator })}>
                    <SelectTrigger className="w-full" aria-label={t("ruleWhen")}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ops.map((op) => (
                        <SelectItem key={op} value={op}>
                          {to(op)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {needsValue && <ValueInput question={q} value={c.value} onChange={(value) => setCondition(i, { ...c, value })} label={t("value")} />}
                </div>
              )}
            </li>
          );
        })}
      </ol>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="w-fit"
        disabled={eligible.length === 0}
        onClick={() => {
          const q = eligible.at(-1);
          onChange({ ...group, conditions: [...group.conditions, { questionId: q?.id ?? "", operator: operatorsFor(q)[0]!, value: defaultValue(q) }] });
        }}
      >
        <PlusIcon />
        {t("addCondition")}
      </Button>
    </div>
  );
}

// ── Rule dialog ─────────────────────────────────────────────────────────────

function RuleDialog({
  open,
  onOpenChange,
  rule,
  eligible,
  actions,
  pageTargets,
  onSave,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rule: LogicRule;
  eligible: Question[];
  actions: LogicActionType[];
  pageTargets?: { id: string; label: string }[];
  onSave: (rule: LogicRule) => void;
  onDelete?: () => void;
}) {
  const t = useTranslations("builder");
  const ta = useTranslations("logicActions");
  const tc = useTranslations("common");
  const [draft, setDraft] = useState(rule);
  const valid = draft.when.conditions.every((c) => c.questionId) && (draft.action !== "skip_to_page" || !!draft.target);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={tc("close")} className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{onDelete ? t("editRule") : t("addRule")}</DialogTitle>
          <DialogDescription>{t("logicHint")}</DialogDescription>
        </DialogHeader>
        <ConditionGroupEditor group={draft.when} onChange={(when) => setDraft({ ...draft, when })} eligible={eligible} />
        <div className="grid gap-3 border-t pt-4">
          <span className="text-sm font-medium">{t("ruleThen")}</span>
          <Select value={draft.action} onValueChange={(v) => setDraft({ ...draft, action: v as LogicActionType, target: v === "skip_to_page" ? pageTargets?.[0]?.id : rule.target })}>
            <SelectTrigger className="w-full" aria-label={t("ruleThen")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {actions.map((a) => (
                <SelectItem key={a} value={a}>
                  {ta(a)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {draft.action === "skip_to_page" && pageTargets && (
            <Select value={draft.target} onValueChange={(v) => setDraft({ ...draft, target: v })}>
              <SelectTrigger className="w-full" aria-label={t("choosePage")}>
                <SelectValue placeholder={t("choosePage")} />
              </SelectTrigger>
              <SelectContent>
                {pageTargets.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {draft.action === "end_form" && (
            <div className="grid gap-3">
              <div className="flex items-start justify-between gap-4">
                <div className="grid gap-0.5">
                  <Label htmlFor="rule-screen">{t("screenOut")}</Label>
                  <p className="text-xs text-muted-foreground">{t("screenOutHint")}</p>
                </div>
                <Switch id="rule-screen" checked={!!draft.screenOut} onCheckedChange={(v) => setDraft({ ...draft, screenOut: v })} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="rule-msg">{t("endMessage")}</Label>
                <Textarea id="rule-msg" rows={2} value={draft.message ?? ""} onChange={(e) => setDraft({ ...draft, message: e.target.value || undefined })} />
              </div>
            </div>
          )}
        </div>
        <DialogFooter className="sm:justify-between">
          {onDelete ? (
            <Button type="button" variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={onDelete}>
              <Trash2Icon />
              {t("deleteRule")}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {tc("cancel")}
            </Button>
            <Button type="button" disabled={!valid} onClick={() => onSave(draft)}>
              {t("saveRule")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RuleList({ rules, onEdit }: { rules: LogicRule[]; onEdit: (rule: LogicRule) => void }) {
  const t = useTranslations("builder");
  const ta = useTranslations("logicActions");
  const to = useTranslations("operators");
  const { doc } = useBuilder();
  if (!rules.length) return <p className="text-sm text-muted-foreground">{t("noRules")}</p>;
  return (
    <ul className="grid gap-2">
      {rules.map((r) => {
        const first = r.when.conditions[0];
        const q = first && findQuestion(doc, first.questionId);
        const page = r.action === "skip_to_page" ? doc.pages.findIndex((p) => p.id === r.target) : -1;
        return (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => onEdit(r)}
              className="flex w-full items-start gap-3 rounded-xl border bg-card p-3 text-start text-sm shadow-soft outline-none hover:bg-accent/50 focus-visible:ring-[3px] focus-visible:ring-ring/40"
            >
              <GitBranchIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">
                  {ta(r.action)}
                  {page >= 0 && ` → ${t("page", { n: page + 1 })}`}
                </span>
                <span className="block truncate text-muted-foreground">
                  {t("ruleWhen")} “{q?.title || t("untitledQuestion")}” {first && to(first.operator)}
                  {r.when.conditions.length > 1 && ` +${r.when.conditions.length - 1}`}
                </span>
              </span>
              <PencilIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function useRuleEditing() {
  const { update } = useBuilder();
  const [editing, setEditing] = useState<{ rule: LogicRule; isNew: boolean } | null>(null);
  const save = (rule: LogicRule) => {
    update("logic", (d) => {
      const i = d.logic.findIndex((r) => r.id === rule.id);
      if (i >= 0) d.logic[i] = rule;
      else d.logic.push(rule);
    });
    setEditing(null);
  };
  const remove = (id: string) => {
    update("logic", (d) => (d.logic = d.logic.filter((r) => r.id !== id)));
    setEditing(null);
  };
  return { editing, setEditing, save, remove };
}

/** Show / hide / require rules that target one question. */
export function RulesForQuestion({ questionId }: { questionId: string }) {
  const t = useTranslations("builder");
  const { doc, canEdit } = useBuilder();
  const { editing, setEditing, save, remove } = useRuleEditing();
  const rules = doc.logic.filter((r) => r.target === questionId && r.action !== "skip_to_page");

  const eligible: Question[] = [];
  outer: for (const page of doc.pages) {
    for (const q of page.questions) {
      if (q.id === questionId) break outer;
      eligible.push(q);
    }
  }

  return (
    <div className="grid gap-3">
      <RuleList rules={rules} onEdit={(rule) => setEditing({ rule, isNew: false })} />
      {canEdit && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-fit"
          disabled={eligible.length === 0}
          onClick={() => {
            const q = eligible.at(-1);
            setEditing({
              isNew: true,
              rule: {
                id: newRuleId(),
                action: "show_question",
                target: questionId,
                when: { match: "all", conditions: [{ questionId: q?.id ?? "", operator: operatorsFor(q)[0]!, value: defaultValue(q) }] },
              },
            });
          }}
        >
          <PlusIcon />
          {t("addRule")}
        </Button>
      )}
      {eligible.length === 0 && <p className="text-xs text-muted-foreground">{t("noEarlierQuestions")}</p>}
      {editing && (
        <RuleDialog
          key={editing.rule.id}
          open
          onOpenChange={(o) => !o && setEditing(null)}
          rule={editing.rule}
          eligible={eligible}
          actions={["show_question", "hide_question", "require_question"]}
          onSave={save}
          onDelete={editing.isNew ? undefined : () => remove(editing.rule.id)}
        />
      )}
    </div>
  );
}

/** Skip / end rules evaluated when leaving a page. */
export function RulesForPage({ pageId }: { pageId: string }) {
  const t = useTranslations("builder");
  const { doc, canEdit } = useBuilder();
  const { editing, setEditing, save, remove } = useRuleEditing();
  const index = doc.pages.findIndex((p) => p.id === pageId);
  const page = doc.pages[index];
  if (!page) return null;
  const rules = doc.logic.filter((r) => (r.action === "skip_to_page" || r.action === "end_form") && ruleSourcePage(r, doc) === index);
  const eligible = page.questions;
  const pageTargets = doc.pages.slice(index + 1).map((p, i) => ({ id: p.id, label: `${t("page", { n: index + i + 2 })}${p.title ? ` · ${p.title}` : ""}` }));
  const actions: LogicActionType[] = pageTargets.length ? ["skip_to_page", "end_form"] : ["end_form"];

  return (
    <div className="grid gap-3">
      <RuleList rules={rules} onEdit={(rule) => setEditing({ rule, isNew: false })} />
      {canEdit && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-fit"
          disabled={eligible.length === 0}
          onClick={() => {
            const q = eligible.at(-1);
            setEditing({
              isNew: true,
              rule: {
                id: newRuleId(),
                action: actions[0]!,
                target: actions[0] === "skip_to_page" ? pageTargets[0]?.id : undefined,
                when: { match: "all", conditions: [{ questionId: q?.id ?? "", operator: operatorsFor(q)[0]!, value: defaultValue(q) }] },
              },
            });
          }}
        >
          <PlusIcon />
          {t("addRule")}
        </Button>
      )}
      {editing && (
        <RuleDialog
          key={editing.rule.id}
          open
          onOpenChange={(o) => !o && setEditing(null)}
          rule={editing.rule}
          eligible={eligible}
          actions={actions}
          pageTargets={pageTargets}
          onSave={save}
          onDelete={editing.isNew ? undefined : () => remove(editing.rule.id)}
        />
      )}
    </div>
  );
}

