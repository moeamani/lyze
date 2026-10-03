"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { SearchIcon, XIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

type Category = { id: string; count: number };

/** Activity filters live in the URL: category chips (with 30-day counts), person, dates and text. */
export function ActivityFilters({ categories, members }: { categories: Category[]; members: { id: string; label: string }[] }) {
  const t = useTranslations("activity");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const selected = new Set((params.get("cat") ?? "").split(",").filter(Boolean));
  const push = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    next.delete("before");
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    router.push(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
  };
  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    push({ cat: [...next].join(",") || null });
  };
  const active = selected.size > 0 || ["actor", "from", "to", "q"].some((k) => params.get(k));

  return (
    <div className="grid grid-cols-1 gap-3 rounded-xl border bg-card p-3">
      <div role="group" aria-label={t("filters.categories")} className="flex flex-wrap gap-1.5">
        {categories.map((c) => (
          <button
            key={c.id}
            type="button"
            aria-pressed={selected.has(c.id)}
            onClick={() => toggle(c.id)}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors hover:bg-accent",
              selected.has(c.id) && "border-foreground/30 bg-accent font-medium",
            )}
          >
            {t(`categories.${c.id as "project"}`)}
            <span className="text-xs text-muted-foreground tabular-nums">{c.count}</span>
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_12rem_9.5rem_9.5rem_auto]">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            push({ q: q.trim() || null });
          }}
          className="relative"
        >
          <SearchIcon className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("filters.search")} aria-label={t("filters.search")} className="h-9 ps-9" />
        </form>
        <Select value={params.get("actor") ?? "all"} onValueChange={(v) => push({ actor: v === "all" ? null : v })}>
          <SelectTrigger size="sm" className="w-full" aria-label={t("filters.person")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("filters.everyone")}</SelectItem>
            {members.map((m) => (
              <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input type="date" className="h-9" aria-label={t("filters.from")} value={params.get("from") ?? ""} onChange={(e) => push({ from: e.target.value || null })} />
        <Input type="date" className="h-9" aria-label={t("filters.to")} value={params.get("to") ?? ""} onChange={(e) => push({ to: e.target.value || null })} />
        {active && (
          <Button variant="ghost" size="sm" className="h-9" onClick={() => (setQ(""), router.push(pathname, { scroll: false }))}>
            <XIcon /> {t("filters.clear")}
          </Button>
        )}
      </div>
    </div>
  );
}
