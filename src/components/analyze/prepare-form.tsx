"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Loader2Icon, PlusIcon, Trash2Icon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useActionFeedback } from "@/components/common/use-action-feedback";
import { saveAnalysisSettingsAction } from "@/server/actions/analysis";
import type { AnalysisSettings, Computed, Recode } from "@/lib/analysis/settings";

type VarOption = { id: string; label: string; name: string; categories?: { value: number; label: string }[]; numeric: boolean; categorical: boolean };
type Scope = { workspaceId: string; slug: string; projectId: string; studyId: string };

const newId = () => Math.random().toString(36).slice(2, 10);

export function PrepareForm({
  scope,
  initial,
  variables,
  medianSeconds,
  counts,
  canEdit,
}: {
  scope: Scope;
  initial: AnalysisSettings;
  variables: VarOption[];
  medianSeconds: number | null;
  counts: { kept: number; status: number; speeders: number; manual: number };
  canEdit: boolean;
}) {
  const t = useTranslations("prepare");
  const tc = useTranslations("common");
  const feedback = useActionFeedback();
  const [s, setS] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const dirty = JSON.stringify(s) !== JSON.stringify(initial);
  const numeric = variables.filter((v) => v.numeric);
  const categorical = variables.filter((v) => v.categorical);
  const suggest = medianSeconds ? Math.round(medianSeconds / 3) : null;
  const taken = new Set(variables.map((v) => v.name.toLowerCase()));

  const save = () =>
    startTransition(async () => {
      const names = [...s.recodes.map((r) => r.name), ...s.computed.map((c) => c.name)];
      const errs: Record<string, string> = {};
      names.forEach((n, i) => {
        if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(n)) errs[n || String(i)] = t("variableName");
        else if (taken.has(n.toLowerCase()) || names.findIndex((x) => x.toLowerCase() === n.toLowerCase()) !== i) errs[n] = t("nameTaken");
      });
      setErrors(errs);
      if (Object.keys(errs).length) return;
      feedback(await saveAnalysisSettingsAction(scope, s), t("saved"));
    });

  const updateRecode = (id: string, patch: Partial<Recode>) => setS((x) => ({ ...x, recodes: x.recodes.map((r) => (r.id === id ? ({ ...r, ...patch } as Recode) : r)) }));
  const updateComputed = (id: string, patch: Partial<Computed>) => setS((x) => ({ ...x, computed: x.computed.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));

  return (
    <fieldset disabled={!canEdit} className="grid min-w-0 gap-6">
      <p className="text-sm text-muted-foreground">
        {t("hint")} {t("summary", counts)}
      </p>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("include")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5">
          <Toggle id="inc-partial" label={t("includePartial")} checked={s.includePartial} onChange={(v) => setS({ ...s, includePartial: v })} />
          <Toggle id="inc-screened" label={t("includeScreened")} checked={s.includeScreenedOut} onChange={(v) => setS({ ...s, includeScreenedOut: v })} />
          <div className="grid gap-2">
            <Toggle id="speeders" label={t("speeders")} checked={s.minDurationSec !== null} onChange={(v) => setS({ ...s, minDurationSec: v ? (suggest ?? 60) : null })} />
            {medianSeconds && <p className="text-xs text-muted-foreground">{t("speedersHint", { median: Math.round(medianSeconds), suggest: suggest ?? 0 })}</p>}
            {s.minDurationSec !== null && (
              <div className="flex items-center gap-2">
                <Input type="number" min={0} className="w-28" aria-label={t("speeders")} value={s.minDurationSec} onChange={(e) => setS({ ...s, minDurationSec: Math.max(0, e.target.valueAsNumber || 0) })} />
                <span className="text-sm text-muted-foreground">{t("seconds")}</span>
              </div>
            )}
          </div>
          {s.excludedIds.length > 0 && (
            <div className="grid gap-2">
              <span className="text-sm font-medium">{t("excluded")}</span>
              <ul className="flex flex-wrap gap-2">
                {s.excludedIds.map((id) => (
                  <li key={id} className="inline-flex items-center gap-1 rounded-full border py-1 ps-3 pe-1 font-mono text-xs">
                    {id}
                    <button type="button" className="grid size-7 place-items-center rounded-full hover:bg-accent" aria-label={`${t("restore")} ${id}`} onClick={() => setS({ ...s, excludedIds: s.excludedIds.filter((x) => x !== id) })}>
                      <XIcon className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-xs text-muted-foreground">{t("excludedHint")}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("recodes")}</CardTitle>
          <CardDescription>{t("recodesHint")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {s.recodes.map((r) => {
            const source = variables.find((v) => v.id === r.source);
            return (
              <div key={r.id} className="grid gap-3 rounded-xl border bg-muted/30 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{t(`modes.${r.mode}`)}</span>
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={tc("delete")} onClick={() => setS({ ...s, recodes: s.recodes.filter((x) => x.id !== r.id) })}>
                    <Trash2Icon />
                  </Button>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <VarSelect label={t("source")} value={r.source} options={r.mode === "group" ? categorical : numeric} onChange={(id) => updateRecode(r.id, r.mode === "group" ? ({ source: id, groups: [] } as Partial<Recode>) : { source: id })} />
                  <NameInput label={t("newName")} value={r.name} error={errors[r.name]} onChange={(name) => updateRecode(r.id, { name })} />
                  <div className="grid gap-2">
                    <Label>{t("newLabel")}</Label>
                    <Input value={r.label} onChange={(e) => updateRecode(r.id, { label: e.target.value })} />
                  </div>
                </div>
                {r.mode === "group" && source?.categories && (
                  <GroupEditor categories={source.categories} groups={r.groups} onChange={(groups) => updateRecode(r.id, { groups })} />
                )}
                {r.mode === "bins" && (
                  <div className="grid gap-2">
                    <Label>{t("edges")}</Label>
                    <Input
                      defaultValue={r.edges.join(", ")}
                      placeholder="18, 25, 35, 50"
                      onBlur={(e) =>
                        updateRecode(r.id, {
                          edges: e.target.value
                            .split(/[,\s]+/)
                            .map(Number)
                            .filter((n) => Number.isFinite(n)),
                        })
                      }
                    />
                    <p className="text-xs text-muted-foreground">{t("edgesHint")}</p>
                  </div>
                )}
              </div>
            );
          })}
          <div className="flex flex-wrap gap-2">
            {(["group", "reverse", "bins"] as const).map((mode) => (
              <Button
                key={mode}
                type="button"
                variant="outline"
                size="sm"
                disabled={(mode === "group" ? categorical : numeric).length === 0}
                onClick={() => {
                  const src = (mode === "group" ? categorical : numeric)[0]!;
                  const base = { id: newId(), name: `${src.name}_${mode === "reverse" ? "r" : mode === "bins" ? "band" : "grp"}`, label: `${src.label}`, source: src.id };
                  const recode: Recode = mode === "group" ? { ...base, mode, groups: [] } : mode === "bins" ? { ...base, mode, edges: [0] } : { ...base, mode };
                  setS({ ...s, recodes: [...s.recodes, recode] });
                }}
              >
                <PlusIcon />
                {t(`modes.${mode}`)}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("computed")}</CardTitle>
          <CardDescription>{t("computedHint")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {s.computed.map((c) => (
            <div key={c.id} className="grid gap-3 rounded-xl border bg-muted/30 p-3">
              <div className="grid gap-3 sm:grid-cols-[1fr_1fr_8rem_auto] sm:items-end">
                <NameInput label={t("newName")} value={c.name} error={errors[c.name]} onChange={(name) => updateComputed(c.id, { name })} />
                <div className="grid gap-2">
                  <Label>{t("newLabel")}</Label>
                  <Input value={c.label} onChange={(e) => updateComputed(c.id, { label: e.target.value })} />
                </div>
                <div className="grid gap-2">
                  <Label>{t("opLabel")}</Label>
                  <Select value={c.op} onValueChange={(op) => updateComputed(c.id, { op: op as Computed["op"] })}>
                    <SelectTrigger className="w-full" aria-label={t("opLabel")}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mean">{t("op.mean")}</SelectItem>
                      <SelectItem value="sum">{t("op.sum")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button type="button" variant="ghost" size="icon" aria-label={tc("delete")} onClick={() => setS({ ...s, computed: s.computed.filter((x) => x.id !== c.id) })}>
                  <Trash2Icon />
                </Button>
              </div>
              <fieldset className="grid gap-2">
                <legend className="mb-1 text-sm font-medium">{t("itemsLabel")}</legend>
                <ul className="grid gap-1.5 sm:grid-cols-2">
                  {numeric.map((v) => {
                    const on = c.sources.includes(v.id);
                    const rev = c.reverse.includes(v.id);
                    return (
                      <li key={v.id} className="flex items-center gap-2 text-sm">
                        <input
                          id={`${c.id}-${v.id}`}
                          type="checkbox"
                          className="size-4 accent-[var(--primary)]"
                          checked={on}
                          onChange={(e) =>
                            updateComputed(c.id, {
                              sources: e.target.checked ? [...c.sources, v.id] : c.sources.filter((x) => x !== v.id),
                              reverse: e.target.checked ? c.reverse : c.reverse.filter((x) => x !== v.id),
                            })
                          }
                        />
                        <label htmlFor={`${c.id}-${v.id}`} className="min-w-0 flex-1 truncate">
                          {v.label}
                        </label>
                        {on && (
                          <label className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <input
                              type="checkbox"
                              className="size-3.5 accent-[var(--primary)]"
                              checked={rev}
                              onChange={(e) => updateComputed(c.id, { reverse: e.target.checked ? [...c.reverse, v.id] : c.reverse.filter((x) => x !== v.id) })}
                            />
                            {t("modes.reverse")}
                          </label>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </fieldset>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-fit"
            disabled={numeric.length < 2}
            onClick={() => setS({ ...s, computed: [...s.computed, { id: newId(), name: `score${s.computed.length + 1}`, label: "", op: "mean", sources: [], reverse: [] }] })}
          >
            <PlusIcon />
            {t("addComputed")}
          </Button>
        </CardContent>
      </Card>

      {canEdit && (
        <div className="sticky bottom-[calc(var(--tabbar-height)+0.5rem)] z-10 flex items-center justify-end gap-3 rounded-2xl border bg-card/95 p-2 ps-4 shadow-lift backdrop-blur md:bottom-4">
          <p className="me-auto text-sm text-muted-foreground" aria-live="polite">
            {dirty ? t("unsaved") : t("upToDate")}
          </p>
          <Button onClick={save} disabled={pending || !dirty}>
            {pending && <Loader2Icon className="animate-spin" />}
            {t("save")}
          </Button>
        </div>
      )}
    </fieldset>
  );
}

function Toggle({ id, label, checked, onChange }: { id: string; label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <Label htmlFor={id}>{label}</Label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function VarSelect({ label, value, options, onChange }: { label: string; value: string; options: VarOption[]; onChange: (id: string) => void }) {
  return (
    <div className="grid min-w-0 gap-2">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-full min-w-0" aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.id} value={o.id}>
              <span className="truncate">
                {o.name} · {o.label}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function NameInput({ label, value, error, onChange }: { label: string; value: string; error?: string; onChange: (v: string) => void }) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={!!error} className="font-mono" dir="ltr" />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function GroupEditor({ categories, groups, onChange }: { categories: { value: number; label: string }[]; groups: { label: string; values: number[] }[]; onChange: (g: { label: string; values: number[] }[]) => void }) {
  const t = useTranslations("prepare");
  const tc = useTranslations("common");
  const groupOf = (value: number) => groups.findIndex((g) => g.values.includes(value));
  const assign = (value: number, gi: number) =>
    onChange(groups.map((g, i) => ({ ...g, values: i === gi ? [...g.values.filter((v) => v !== value), value] : g.values.filter((v) => v !== value) })));
  return (
    <div className="grid gap-3">
      <div className="grid gap-2">
        {groups.map((g, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input aria-label={t("groupLabel")} value={g.label} onChange={(e) => onChange(groups.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} className="h-9" />
            <Button type="button" variant="ghost" size="icon-sm" aria-label={tc("delete")} onClick={() => onChange(groups.filter((_, j) => j !== i))}>
              <XIcon />
            </Button>
          </div>
        ))}
        <Button type="button" variant="ghost" size="sm" className="w-fit" onClick={() => onChange([...groups, { label: `${t("groupLabel")} ${groups.length + 1}`, values: [] }])}>
          <PlusIcon />
          {t("addGroup")}
        </Button>
      </div>
      {groups.length > 0 && (
        <ul className="grid gap-1.5">
          {categories.map((c) => (
            <li key={c.value} className="grid grid-cols-[1fr_12rem] items-center gap-2 text-sm">
              <span className="truncate">
                <span className="me-1 text-muted-foreground tabular-nums">{c.value}</span>
                {c.label}
              </span>
              <Select value={groupOf(c.value) >= 0 ? String(groupOf(c.value)) : "none"} onValueChange={(v) => v !== "none" && assign(c.value, Number(v))}>
                <SelectTrigger size="sm" className="w-full" aria-label={c.label}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {groups.map((g, i) => (
                    <SelectItem key={i} value={String(i)}>
                      {g.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
