"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { CheckIcon, CopyIcon, DownloadIcon, SearchIcon, StarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useActionFeedback } from "@/components/common/use-action-feedback";
import { starCodingAction } from "@/server/actions/coding";
import { codeColorVar } from "@/lib/qual/codes";
import { cn } from "@/lib/utils";

type Scope = { workspaceId: string; slug: string; projectId: string };
type Option = { id: string; label: string };
export type QuoteItem = {
  id: string;
  quote: string;
  codeIds: string[];
  starred: boolean;
  href: string;
  meta: string;
};

/** Filters live in the URL so a filtered quote bank can be shared. */
export function QuoteFilters({ codes, themes, studies, people }: { codes: (Option & { color: string })[]; themes: Option[]; studies: Option[]; people: Option[] }) {
  const t = useTranslations("quotes");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.push(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
  };
  const select = (key: string, label: string, options: Option[], all: string) => (
    <Select value={params.get(key) ?? "all"} onValueChange={(v) => set(key, v === "all" ? null : v)}>
      <SelectTrigger size="sm" className="w-auto max-w-56" aria-label={label}>
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
  );
  return (
    <div className="flex flex-wrap items-center gap-2">
      <form
        className="relative w-full sm:w-60"
        onSubmit={(e) => {
          e.preventDefault();
          set("q", q.trim() || null);
        }}
      >
        <SearchIcon className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("searchPlaceholder")} aria-label={t("searchPlaceholder")} className="h-9 ps-9" />
      </form>
      {select("code", t("code"), codes, t("allCodes"))}
      {themes.length > 0 && select("theme", t("theme"), themes, t("allThemes"))}
      {studies.length > 1 && select("study", t("study"), studies, t("allStudies"))}
      {people.length > 0 && select("participant", t("participant"), people, t("allPeople"))}
      <Button size="sm" variant={params.get("starred") === "1" ? "soft" : "outline"} aria-pressed={params.get("starred") === "1"} onClick={() => set("starred", params.get("starred") === "1" ? null : "1")}>
        <StarIcon className={cn(params.get("starred") === "1" && "fill-current")} />
        {t("starredOnly")}
      </Button>
    </div>
  );
}

export function QuoteList({ scope, quotes, codes, canStar, exportHref }: { scope: Scope; quotes: QuoteItem[]; codes: Map<string, { name: string; color: string }> | Record<string, { name: string; color: string }>; canStar: boolean; exportHref: string }) {
  const t = useTranslations("quotes");
  const lookup = codes instanceof Map ? codes : new Map(Object.entries(codes));
  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {t("count", { count: quotes.length })}
        </p>
        <Button asChild size="sm" variant="ghost">
          <a href={exportHref} download>
            <DownloadIcon />
            {t("exportCsv")}
          </a>
        </Button>
      </div>
      {quotes.length === 0 ? (
        <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {quotes.map((q) => (
            <QuoteCard key={q.id} scope={scope} quote={q} codes={lookup} canStar={canStar} />
          ))}
        </ul>
      )}
    </div>
  );
}

function QuoteCard({ scope, quote, codes, canStar }: { scope: Scope; quote: QuoteItem; codes: Map<string, { name: string; color: string }>; canStar: boolean }) {
  const t = useTranslations("quotes");
  const feedback = useActionFeedback();
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <li className="grid min-w-0 grid-cols-1 content-between gap-3 rounded-2xl border bg-card p-4 shadow-soft">
      <blockquote className="text-[0.95rem] leading-relaxed text-pretty">“{quote.quote}”</blockquote>
      <div className="grid grid-cols-1 gap-2">
        <div className="flex flex-wrap gap-1">
          {quote.codeIds.map((id) => {
            const c = codes.get(id);
            return c ? (
              <span key={id} className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-xs">
                <span className="size-2 rounded-full" style={{ background: codeColorVar(c.color) }} aria-hidden />
                {c.name}
              </span>
            ) : null;
          })}
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Link href={quote.href} className="min-w-0 flex-1 truncate hover:text-foreground hover:underline">
            {quote.meta}
          </Link>
          <Button
            variant="ghost"
            size="icon-sm"
            className="size-8"
            aria-label={copied ? t("copied") : t("copy")}
            onClick={async () => {
              await navigator.clipboard?.writeText(`“${quote.quote}” — ${quote.meta}`);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? <CheckIcon /> : <CopyIcon />}
          </Button>
          {canStar && (
            <Button variant="ghost" size="icon-sm" className="size-8" aria-pressed={quote.starred} aria-label={quote.starred ? t("unstar") : t("star")} disabled={pending} onClick={() => startTransition(async () => void feedback(await starCodingAction(scope, quote.id, !quote.starred)))}>
              <StarIcon className={cn(quote.starred && "fill-current text-warning")} />
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}
