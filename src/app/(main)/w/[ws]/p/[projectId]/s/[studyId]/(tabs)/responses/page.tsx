import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ChevronRightIcon, Share2Icon } from "lucide-react";
import { getStudyContext } from "@/server/queries/workspace";
import { listResponses, responseCounts } from "@/server/services/responses";
import { RESPONSE_STATUSES, type ResponseStatus } from "@/server/db/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";
import { RelativeTime } from "@/components/common/relative-time";
import { SegmentedNav } from "@/components/common/segmented-nav";
import { durationParts } from "@/components/studies/format";
import { ResponsesGrid, type GridColumn, type GridRow } from "@/components/studies/responses-grid";
import { loadStudyDataset } from "@/server/services/analysis";
import { valueLabel } from "@/lib/analysis/variables";
import { ClipboardIllustration } from "@/components/illustrations";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("responses");
  return { title: t("title") };
}

const STATUS_VARIANT: Record<ResponseStatus, "success" | "soft" | "secondary" | "outline"> = {
  complete: "success",
  partial: "outline",
  screened_out: "secondary",
  over_quota: "secondary",
};

export default async function ResponsesPage({ params, searchParams }: PageProps<"/w/[ws]/p/[projectId]/s/[studyId]/responses">) {
  const { ws, projectId, studyId } = await params;
  const sp = await searchParams;
  const status = RESPONSE_STATUSES.find((s) => s === sp.status);
  const before = typeof sp.before === "string" && !Number.isNaN(Date.parse(sp.before)) ? new Date(sp.before) : undefined;
  const { workspace, study } = await getStudyContext(ws, projectId, studyId);
  const t = await getTranslations("responses");
  const base = `/w/${ws}/p/${projectId}/s/${studyId}`;
  const [counts, { items, hasMore }, raw] = await Promise.all([
    responseCounts(workspace.id, study.id),
    listResponses(workspace.id, study.id, { status, before }),
    loadStudyDataset(workspace.id, study.id, { raw: true }),
  ]);
  const excluded = new Set(raw.settings.excludedIds);
  const gridColumns: GridColumn[] = raw.variables
    .filter((v) => v.role !== "meta")
    .map((v) => ({ id: v.id, name: v.name, label: v.label, numeric: v.type === "numeric" && !v.categories?.length }));
  const gridRows: GridRow[] = raw.rows
    .filter((r) => !status || r.meta.status === status)
    .slice(-2000)
    .map((r) => ({
      id: r.id,
      status: r.meta.status,
      statusLabel: t(`statuses.${r.meta.status}`),
      submitted: (r.meta.submittedAt ?? r.meta.startedAt).toISOString(),
      excluded: excluded.has(r.id),
      cells: Object.fromEntries(gridColumns.map((c) => {
        const v = raw.byId.get(c.id)!;
        const value = r.values[c.id] ?? null;
        return [c.id, typeof value === "number" && v.categories?.length ? valueLabel(v, value) : value];
      })),
    }));
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  const duration = (ms: number | null) => {
    const d = durationParts(ms);
    if (!d) return "—";
    return d.m ? t("minutes", { m: d.m, s: String(d.s).padStart(2, "0") }) : t("seconds", { s: d.s });
  };

  if (total === 0) {
    return (
      <EmptyState illustration={<ClipboardIllustration />} title={t("emptyTitle")} description={t("emptyBody")}>
        <Button asChild variant="soft">
          <Link href={`${base}/share`}>
            <Share2Icon />
            {t("share")}
          </Link>
        </Button>
      </EmptyState>
    );
  }

  const filters = [
    { href: `${base}/responses`, label: `${t("all")} · ${total}`, active: !status },
    ...RESPONSE_STATUSES.filter((s) => counts[s] > 0).map((s) => ({
      href: `${base}/responses?status=${s}`,
      label: `${t(`statuses.${s}`)} · ${counts[s]}`,
      active: status === s,
    })),
  ];

  return (
    <div className="grid gap-4">
      <SegmentedNav label={t("filter")} items={filters} />
      {items.length === 0 ? (
        <EmptyState title={t("emptyFiltered")} />
      ) : (
        <>
          {/* Phones: cards */}
          <ul className="grid gap-2 md:hidden">
            {items.map((r) => (
              <li key={r.id}>
                <Link href={`${base}/responses/${r.id}`} className="flex items-center gap-3 rounded-2xl border bg-card p-4 shadow-soft outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40">
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <Badge variant={STATUS_VARIANT[r.status]}>{t(`statuses.${r.status}`)}</Badge>
                      <span className="text-xs text-muted-foreground">
                        <RelativeTime date={r.submittedAt ?? r.startedAt} />
                      </span>
                    </span>
                    <span className="mt-1.5 block truncate text-sm text-muted-foreground">
                      {r.inviteEmail ? `${r.inviteEmail} · ` : ""}
                      {t("answers", { count: r.answerCount })} · {duration(r.durationMs)}
                    </span>
                  </span>
                  <ChevronRightIcon className="size-4 text-muted-foreground rtl:rotate-180" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
          {/* Larger screens: full data grid */}
          <div className="hidden md:block">
            <ResponsesGrid columns={gridColumns} rows={gridRows} base={base} />
          </div>
          {hasMore && (
            <Button asChild variant="outline" className="mx-auto md:hidden">
              <Link href={`${base}/responses?${new URLSearchParams({ ...(status ? { status } : {}), before: items.at(-1)!.startedAt.toISOString() })}`}>{t("loadMore")}</Link>
            </Button>
          )}
        </>
      )}
    </div>
  );
}
