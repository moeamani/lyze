"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { NotebookPenIcon, PlusIcon } from "lucide-react";
import { codeColorVar, CODE_COLORS } from "@/lib/qual/codes";
import { cn } from "@/lib/utils";

export type PickerCode = { id: string; name: string; color: string; path: string[]; depth: number };

/**
 * The list inside the "code this" popover: type to filter, arrows + Enter to apply, or create a
 * new code from what you typed. Recently used codes come first.
 */
export function CodePicker({
  codes,
  recent,
  onPick,
  onCreate,
  onMemo,
  busy,
}: {
  codes: PickerCode[];
  recent: string[];
  onPick: (codeId: string) => void;
  onCreate: (name: string, color: string) => void;
  onMemo?: () => void;
  busy: boolean;
}) {
  const t = useTranslations("coding.picker");
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus({ preventScroll: true }), []);

  const q = query.trim().toLowerCase();
  const list = useMemo(() => {
    const ranked = [...codes].sort((a, b) => {
      const ra = recent.indexOf(a.id);
      const rb = recent.indexOf(b.id);
      return (ra < 0 ? 999 : ra) - (rb < 0 ? 999 : rb);
    });
    return q ? ranked.filter((c) => c.path.join(" ").toLowerCase().includes(q)) : ranked;
  }, [codes, recent, q]);
  const exact = codes.some((c) => c.name.trim().toLowerCase() === q);
  const canCreate = q.length > 0 && !exact;
  const items = [...list.map((c) => ({ kind: "code" as const, code: c })), ...(canCreate ? [{ kind: "create" as const }] : [])];
  const nextColor = CODE_COLORS[codes.length % CODE_COLORS.length]!;

  const choose = (i: number) => {
    const item = items[i];
    if (!item || busy) return;
    if (item.kind === "code") onPick(item.code.id);
    else onCreate(query.trim(), nextColor);
  };

  return (
    <div className="grid gap-2">
      <input
        ref={input}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(items.length - 1, a + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          } else if (e.key === "Enter") {
            e.preventDefault();
            choose(active);
          }
        }}
        placeholder={t("placeholder")}
        aria-label={t("placeholder")}
        role="combobox"
        aria-expanded
        aria-controls="code-picker-list"
        aria-activedescendant={items[active] ? `pick-${active}` : undefined}
        className="h-10 w-full rounded-lg border bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25"
      />
      <ul id="code-picker-list" role="listbox" aria-label={t("codes")} className="max-h-60 overflow-y-auto">
        {items.map((item, i) => (
          <li key={item.kind === "code" ? item.code.id : "create"} id={`pick-${i}`} role="option" aria-selected={i === active}>
            <button
              type="button"
              disabled={busy}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(i)}
              className={cn("flex min-h-10 w-full items-center gap-2 rounded-lg px-2 text-start text-sm", i === active && "bg-accent")}
            >
              {item.kind === "code" ? (
                <>
                  <span className="size-2.5 shrink-0 rounded-full" style={{ background: codeColorVar(item.code.color) }} aria-hidden />
                  <span className="min-w-0 flex-1 truncate">
                    {item.code.path.length > 1 && <span className="text-muted-foreground">{item.code.path.slice(0, -1).join(" › ")} › </span>}
                    {item.code.name}
                  </span>
                </>
              ) : (
                <>
                  <PlusIcon className="size-4 text-primary" aria-hidden />
                  <span className="truncate">{t("create", { name: query.trim() })}</span>
                </>
              )}
            </button>
          </li>
        ))}
        {!items.length && <li className="px-2 py-3 text-sm text-muted-foreground">{t("typeToCreate")}</li>}
      </ul>
      {onMemo && (
        <button type="button" onClick={onMemo} className="flex min-h-10 items-center gap-2 rounded-lg border-t px-2 pt-2 text-sm text-muted-foreground hover:text-foreground">
          <NotebookPenIcon className="size-4" aria-hidden />
          {t("memo")}
        </button>
      )}
    </div>
  );
}
