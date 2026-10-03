import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { FileBarChartIcon, Link2Icon } from "lucide-react";
import { getProjectContext } from "@/server/queries/workspace";
import { listReports } from "@/server/services/reports";
import { can } from "@/lib/permissions";
import { SectionIntro } from "@/components/common/section-icon";
import { RelativeTime } from "@/components/common/relative-time";
import { ReportListActions } from "@/components/reports/report-list-actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("reportBuilder");
  return { title: t("title") };
}

export default async function ReportsPage({ params }: PageProps<"/w/[ws]/p/[projectId]/reports">) {
  const { ws, projectId } = await params;
  const { workspace, role, project } = await getProjectContext(ws, projectId);
  const t = await getTranslations("reportBuilder");
  const list = await listReports(workspace.id, project.id);
  const base = `/w/${ws}/p/${projectId}/reports`;
  const scope = { workspaceId: workspace.id, slug: workspace.slug, projectId: project.id };
  return (
    <div className="grid grid-cols-1 gap-5">
      <SectionIntro section="writeup" icon={FileBarChartIcon} title={t("title")} description={t("intro")} actions={can(role, "content:analyze") && <ReportListActions scope={scope} base={base} />} />
      {list.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((r) => (
            <li key={r.id}>
              <Link href={`${base}/${r.id}`} className="flex h-full flex-col gap-2 rounded-xl border bg-card p-4 hover:bg-accent/50">
                <span className="flex items-center gap-2 font-semibold">
                  <FileBarChartIcon className="size-4 shrink-0 text-section-writeup" aria-hidden />
                  <span className="truncate">{r.title}</span>
                </span>
                <span className="mt-auto flex items-center gap-2 text-xs text-muted-foreground">
                  {t("blocks", { count: r.blocks.length })}
                  {r.shareToken && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-section-mixed/15 px-1.5 py-0.5 text-foreground">
                      <Link2Icon className="size-3" aria-hidden />
                      {t("shared")}
                    </span>
                  )}
                  <span className="ms-auto"><RelativeTime date={r.updatedAt} /></span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
