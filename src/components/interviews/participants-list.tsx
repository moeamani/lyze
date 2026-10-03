"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ChevronRightIcon, SearchIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LocalTime } from "@/components/common/local-time";
import { PARTICIPANT_STATUSES, type ParticipantStatus } from "@/lib/interviews/participants";
import { cn } from "@/lib/utils";
import { ConsentBadge, ParticipantStatusBadge } from "./participant-bits";

export type ParticipantRow = {
  id: string;
  code: string;
  name: string | null;
  email: string | null;
  status: ParticipantStatus;
  attributes: Record<string, string>;
  consented: boolean;
  consentCurrent: boolean;
  sessionCount: number;
  lastSessionAt: string | null;
  anonymized: boolean;
};

export function ParticipantsList({ rows, base }: { rows: ParticipantRow[]; base: string }) {
  const t = useTranslations("participants");
  const ts = useTranslations("participants.statuses");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<ParticipantStatus | "all">("all");

  const counts = useMemo(() => {
    const c = Object.fromEntries(PARTICIPANT_STATUSES.map((s) => [s, 0])) as Record<ParticipantStatus, number>;
    for (const r of rows) c[r.status]++;
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (status === "all" || r.status === status) &&
        (!q || [r.code, r.name ?? "", r.email ?? "", ...Object.values(r.attributes)].some((v) => v.toLowerCase().includes(q))),
    );
  }, [rows, query, status]);

  const attrKeys = useMemo(() => [...new Set(rows.flatMap((r) => Object.keys(r.attributes)))].slice(0, 3), [rows]);
  const href = (id: string) => `${base}/participants/${id}`;
  const label = (r: ParticipantRow) => (r.anonymized ? t("anonymized") : r.name || "—");

  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div role="radiogroup" aria-label={t("filterStatus")} className="flex max-w-full gap-1 overflow-x-auto rounded-xl bg-muted p-1">
          {(["all", ...PARTICIPANT_STATUSES] as const).map((s) => {
            const n = s === "all" ? rows.length : counts[s];
            if (s !== "all" && n === 0) return null;
            return (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={status === s}
                onClick={() => setStatus(s)}
                className={cn(
                  "h-8 rounded-lg px-3 text-sm font-medium whitespace-nowrap text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40",
                  status === s && "bg-card text-foreground shadow-soft",
                )}
              >
                {s === "all" ? t("all") : ts(s)} · {n}
              </button>
            );
          })}
        </div>
        <div className="relative ms-auto w-full sm:w-64">
          <SearchIcon className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("search")} aria-label={t("search")} className="ps-9" />
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-2xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">{t("noMatches")}</p>
      ) : (
        <>
          {/* Phones: cards */}
          <ul className="grid grid-cols-1 gap-2 md:hidden">
            {filtered.map((r) => (
              <li key={r.id}>
                <Link href={href(r.id)} className="flex items-center gap-3 rounded-2xl border bg-card p-3 shadow-soft outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40">
                  <span className="grid grid-cols-1 size-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-sm font-semibold text-accent-soft-foreground">{r.code}</span>
                  <span className="grid grid-cols-1 min-w-0 flex-1 gap-1">
                    <span className="truncate font-medium">{label(r)}</span>
                    <span className="flex flex-wrap items-center gap-2">
                      <ParticipantStatusBadge status={r.status} />
                      <ConsentBadge consented={r.consented} current={r.consentCurrent} />
                    </span>
                  </span>
                  <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground rtl:rotate-180" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
          {/* Desktop: table */}
          <div className="hidden overflow-hidden rounded-2xl border bg-card shadow-soft md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">{t("code")}</TableHead>
                  <TableHead>{t("name")}</TableHead>
                  <TableHead>{t("status")}</TableHead>
                  <TableHead>{t("consent")}</TableHead>
                  {attrKeys.map((k) => (
                    <TableHead key={k}>{k}</TableHead>
                  ))}
                  <TableHead className="text-end">{t("sessionsCol")}</TableHead>
                  <TableHead>{t("lastSession")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={r.id} className="relative">
                    <TableCell className="font-medium tabular-nums">
                      <Link href={href(r.id)} className="outline-none after:absolute after:inset-0 focus-visible:underline">
                        {r.code}
                      </Link>
                    </TableCell>
                    <TableCell className={cn("max-w-56 truncate", r.anonymized && "text-muted-foreground italic")}>{label(r)}</TableCell>
                    <TableCell>
                      <ParticipantStatusBadge status={r.status} />
                    </TableCell>
                    <TableCell>
                      <ConsentBadge consented={r.consented} current={r.consentCurrent} />
                    </TableCell>
                    {attrKeys.map((k) => (
                      <TableCell key={k} className="max-w-40 truncate text-muted-foreground">
                        {r.attributes[k] ?? "—"}
                      </TableCell>
                    ))}
                    <TableCell className="text-end tabular-nums">{r.sessionCount}</TableCell>
                    <TableCell className="text-muted-foreground">{r.lastSessionAt ? <LocalTime date={r.lastSessionAt} preset="date" /> : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
