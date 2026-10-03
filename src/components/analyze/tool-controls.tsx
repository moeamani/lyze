"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { PlusIcon, XIcon } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type Option = { id: string; label: string };
export type Field =
  | { kind: "single"; param: string; label: string; options: Option[] }
  | { kind: "multi"; param: string; label: string; options: Option[]; min: number }
  | { kind: "choice"; param: string; label: string; options: Option[]; fallback: string };

/** Variable pickers for an analysis tool. Choices live in the URL so results are linkable. */
export function ToolControls({ fields }: { fields: Field[] }) {
  const t = useTranslations("analyze");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  // Quick successive picks must build on the URL we just pushed, not the one still rendered.
  const query = params.toString();
  const pending = useRef<string | null>(null);
  useEffect(() => {
    pending.current = null;
  }, [query]);

  const set = (param: string, value: string | null) => {
    const next = new URLSearchParams(pending.current ?? query);
    if (value) next.set(param, value);
    else next.delete(param);
    pending.current = next.toString();
    router.push(`${pathname}?${next}`, { scroll: false });
  };

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {fields.map((f) => {
        const id = `tool-${f.param}`;
        if (f.kind === "multi") {
          const selected = (params.get(f.param) ?? "").split(",").filter(Boolean);
          const remaining = f.options.filter((o) => !selected.includes(o.id));
          return (
            <div key={f.param} className="grid gap-2 sm:col-span-2 lg:col-span-3">
              <Label>{f.label}</Label>
              <ul className="flex flex-wrap gap-2">
                {selected.map((sid) => {
                  const o = f.options.find((x) => x.id === sid);
                  if (!o) return null;
                  return (
                    <li key={sid} className="inline-flex max-w-full items-center gap-1 rounded-full border bg-card py-1 ps-3 pe-1 text-sm shadow-soft">
                      <span className="truncate">{o.label}</span>
                      <button
                        type="button"
                        className="grid size-7 place-items-center rounded-full text-muted-foreground hover:bg-accent"
                        aria-label={`${t("remove")}: ${o.label}`}
                        onClick={() => set(f.param, selected.filter((x) => x !== sid).join(",") || null)}
                      >
                        <XIcon className="size-3.5" />
                      </button>
                    </li>
                  );
                })}
              </ul>
              {remaining.length > 0 && (
                <Select value="" onValueChange={(v) => set(f.param, [...selected, v].join(","))}>
                  <SelectTrigger className="w-full sm:w-96" aria-label={t("addItem")}>
                    <span className="inline-flex items-center gap-2 text-muted-foreground">
                      <PlusIcon className="size-4" />
                      {t("addItem")}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    {remaining.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        <span className="truncate">{o.label}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {selected.length < f.min && <p className="text-xs text-muted-foreground">{t("selectAtLeast")}</p>}
            </div>
          );
        }
        // Always controlled ("" shows the placeholder) so a picker never shows a value the URL lacks.
        const value = params.get(f.param) ?? (f.kind === "choice" ? f.fallback : "");
        return (
          <div key={f.param} className="grid min-w-0 gap-2">
            <Label htmlFor={id}>{f.label}</Label>
            <Select value={value} onValueChange={(v) => set(f.param, v)}>
              <SelectTrigger id={id} className="w-full min-w-0">
                <SelectValue placeholder={t("choose")} />
              </SelectTrigger>
              <SelectContent>
                {f.options.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    <span className="truncate">{o.label}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );
      })}
    </div>
  );
}

export function ClearButton({ label, href }: { label: string; href: string }) {
  const router = useRouter();
  return (
    <Button variant="ghost" size="sm" onClick={() => router.push(href)}>
      {label}
    </Button>
  );
}
