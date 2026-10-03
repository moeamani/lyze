"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ActionResult } from "@/server/actions/result";
import { useActionFeedback } from "@/components/common/use-action-feedback";
import { createCodeAction, updateCodeAction } from "@/server/actions/coding";
import { CODE_COLORS, codeColorVar, type CodeColor } from "@/lib/qual/codes";
import { cn } from "@/lib/utils";

type Scope = { workspaceId: string; slug: string; projectId: string };
export type TreeCode = { id: string; name: string; color: string; parentId: string | null; depth: number; path: string[]; definition: string | null; count: number };

export function ColorSwatches({ value, onChange, label }: { value: string; onChange: (c: CodeColor) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {CODE_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          aria-label={`${label} ${c}`}
          onClick={() => onChange(c)}
          className={cn("size-8 rounded-full ring-offset-2 ring-offset-background outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50", value === c && "ring-2 ring-foreground")}
          style={{ background: codeColorVar(c) }}
        />
      ))}
    </div>
  );
}

/** Create or edit a code: name, color, where it sits in the tree, and its definition. */
export function CodeDialog({
  scope,
  open,
  onOpenChange,
  codes,
  code,
  parentId,
}: {
  scope: Scope;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  codes: TreeCode[];
  code?: TreeCode;
  parentId?: string | null;
}) {
  const t = useTranslations("codebook");
  const tc = useTranslations("common");
  const te = useTranslations("errors");
  const feedback = useActionFeedback();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(code?.name ?? "");
  const [color, setColor] = useState<CodeColor>((code?.color as CodeColor) ?? CODE_COLORS[codes.length % CODE_COLORS.length]!);
  const [parent, setParent] = useState<string | null>(code ? code.parentId : (parentId ?? null));
  const [definition, setDefinition] = useState(code?.definition ?? "");
  const [error, setError] = useState<string | null>(null);

  // A code can't move under itself or its own children.
  const blocked = new Set<string>();
  if (code) {
    blocked.add(code.id);
    for (const c of codes) if (c.path.length > code.path.length && c.path.slice(0, code.path.length).join("\u0000") === code.path.join("\u0000")) blocked.add(c.id);
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError(t("nameRequired"));
    const input = { name, color, parentId: parent, definition };
    startTransition(async () => {
      const result: ActionResult<unknown> = code ? await updateCodeAction(scope, code.id, input) : await createCodeAction(scope, input);
      if (!result.ok && result.error === "conflict") return setError(t("nameTaken"));
      if (!result.ok && result.error === "invalid") return setError(te("invalid"));
      if (feedback(result, code ? t("updated") : t("created"))) onOpenChange(false);
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={tc("close")} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{code ? t("editTitle") : t("newTitle")}</DialogTitle>
          <DialogDescription>{t("dialogHint")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <div className="grid gap-2">
            <Label htmlFor="code-name">{t("name")}</Label>
            <Input id="code-name" autoFocus value={name} maxLength={80} onChange={(e) => setName(e.target.value)} aria-invalid={!!error} aria-describedby={error ? "code-error" : undefined} />
            {error && (
              <p id="code-error" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
          <div className="grid gap-2">
            <Label asChild>
              <span>{t("color")}</span>
            </Label>
            <ColorSwatches value={color} onChange={setColor} label={t("color")} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="code-parent">{t("parent")}</Label>
            <Select value={parent ?? "none"} onValueChange={(v) => setParent(v === "none" ? null : v)}>
              <SelectTrigger id="code-parent" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("topLevel")}</SelectItem>
                {codes
                  .filter((c) => !blocked.has(c.id) && c.depth < 3)
                  .map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.path.join(" › ")}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="code-def">
              {t("definition")} <span className="font-normal text-muted-foreground">{tc("optional")}</span>
            </Label>
            <Textarea id="code-def" rows={3} value={definition} onChange={(e) => setDefinition(e.target.value)} placeholder={t("definitionPlaceholder")} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {tc("cancel")}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2Icon className="animate-spin" />}
              {code ? tc("save") : t("create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
