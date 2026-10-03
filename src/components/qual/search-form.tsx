"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Option = { id: string; label: string };
const KINDS = ["segment", "answer", "memo"] as const;

export function SearchForm({ studies, people, codes }: { studies: Option[]; people: Option[]; codes: Option[] }) {
  const t = useTranslations("search");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [kinds, setKinds] = useState<string[]>(params.get("in")?.split(",").filter(Boolean) ?? [...KINDS]);
  const [study, setStudy] = useState(params.get("study") ?? "all");
  const [person, setPerson] = useState(params.get("participant") ?? "all");
  const [code, setCode] = useState(params.get("code") ?? "all");
  const [from, setFrom] = useState(params.get("from") ?? "");
  const [to, setTo] = useState(params.get("to") ?? "");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next = new URLSearchParams();
    if (q.trim()) next.set("q", q.trim());
    if (kinds.length && kinds.length < KINDS.length) next.set("in", kinds.join(","));
    if (study !== "all") next.set("study", study);
    if (person !== "all") next.set("participant", person);
    if (code !== "all") next.set("code", code);
    if (from) next.set("from", from);
    if (to) next.set("to", to);
    router.push(`${pathname}${next.size ? `?${next}` : ""}`);
  };

  const pick = (id: string, label: string, value: string, set: (v: string) => void, options: Option[], all: string) => (
    <div className="grid gap-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Select value={value} onValueChange={set}>
        <SelectTrigger id={id} size="sm" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{all}</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.id} value={o.id}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <form onSubmit={submit} role="search" className="grid gap-4 rounded-2xl border bg-card p-4 shadow-soft">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input type="search" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("placeholder")} aria-label={t("placeholder")} className="ps-9" />
        </div>
        <Button type="submit">{t("submit")}</Button>
      </div>
      <p className="-mt-2 text-xs text-muted-foreground">{t("syntax")}</p>
      <fieldset className="flex flex-wrap gap-x-4 gap-y-2">
        <legend className="sr-only">{t("in")}</legend>
        {KINDS.map((k) => (
          <label key={k} className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-primary" checked={kinds.includes(k)} onChange={(e) => setKinds((ks) => (e.target.checked ? [...ks, k] : ks.filter((x) => x !== k)))} />
            {t(`kinds.${k}`)}
          </label>
        ))}
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {studies.length > 1 && pick("s-study", t("study"), study, setStudy, studies, t("any"))}
        {people.length > 0 && pick("s-person", t("participant"), person, setPerson, people, t("any"))}
        {codes.length > 0 && pick("s-code", t("code"), code, setCode, codes, t("any"))}
        <div className="grid gap-1.5">
          <Label htmlFor="s-from" className="text-xs text-muted-foreground">
            {t("from")}
          </Label>
          <Input id="s-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="s-to" className="text-xs text-muted-foreground">
            {t("to")}
          </Label>
          <Input id="s-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9" />
        </div>
      </div>
    </form>
  );
}
