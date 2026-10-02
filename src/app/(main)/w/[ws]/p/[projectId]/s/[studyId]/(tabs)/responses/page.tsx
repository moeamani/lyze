import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ChevronRightIcon, Share2Icon } from "lucide-react";
import { getStudyContext } from "@/server/queries/workspace";
import { listResponses, responseCounts } from "@/server/services/responses";
import { RESPONSE_STATUSES, type ResponseStatus } from "@/server/db/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/common/empty-state";
import { RelativeTime } from "@/components/common/relative-time";
import { SegmentedNav } from "@/components/common/segmented-nav";
import { durationParts } from "@/components/studies/format";
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
  const [counts, { items, hasMore }] = await Promise.all([responseCounts(workspace.id, study.id), listResponses(workspace.id, study.id, { status, before })]);
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
          {/* Larger screens: table */}
          <div className="hidden rounded-2xl border bg-card shadow-soft md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("filter")}</TableHead>
                  <TableHead>{t("started")}</TableHead>
                  <TableHead>{t("submitted")}</TableHead>
                  <TableHead>{t("duration")}</TableHead>
                  <TableHead>{t("invitee")}</TableHead>
                  <TableHead className="text-end">
                    <span className="sr-only">{t("view")}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[r.status]}>{t(`statuses.${r.status}`)}</Badge>
                      <span className="ms-2 text-xs text-muted-foreground">{t("answers", { count: r.answerCount })}</span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      <RelativeTime date={r.startedAt} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">{r.submittedAt ? <RelativeTime date={r.submittedAt} /> : "—"}</TableCell>
                    <TableCell className="tabular-nums">{duration(r.durationMs)}</TableCell>
                    <TableCell className="max-w-48 truncate text-muted-foreground">{r.inviteEmail ?? "—"}</TableCell>
                    <TableCell className="text-end">
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`${base}/responses/${r.id}`}>
                          {t("view")}
                          <ChevronRightIcon className="rtl:rotate-180" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {hasMore && (
            <Button asChild variant="outline" className="mx-auto">
              <Link href={`${base}/responses?${new URLSearchParams({ ...(status ? { status } : {}), before: items.at(-1)!.startedAt.toISOString() })}`}>{t("loadMore")}</Link>
            </Button>
          )}
        </>
      )}
    </div>
  );
}
