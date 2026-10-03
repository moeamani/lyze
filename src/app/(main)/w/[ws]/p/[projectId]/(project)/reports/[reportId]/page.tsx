import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getProjectContext } from "@/server/queries/workspace";
import { getReport, reportSources, resolveReport } from "@/server/services/reports";
import { can } from "@/lib/permissions";
import { ReportEditor } from "@/components/reports/report-editor";
import { ReportBody } from "@/components/reports/report-body";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("reportBuilder");
  return { title: t("title") };
}

export default async function ReportPage({ params }: PageProps<"/w/[ws]/p/[projectId]/reports/[reportId]">) {
  const { ws, projectId, reportId } = await params;
  const { workspace, role, project } = await getProjectContext(ws, projectId);
  const report = await getReport(workspace.id, project.id, reportId);
  const [data, sources] = await Promise.all([resolveReport(workspace.id, project.id, report.blocks), can(role, "content:analyze") ? reportSources(workspace.id, project.id) : null]);
  const back = `/w/${ws}/p/${projectId}/reports`;
  return (
    <>
      {sources ? (
        <ReportEditor
          scope={{ workspaceId: workspace.id, slug: workspace.slug, projectId: project.id }}
          report={{ id: report.id, title: report.title, blocks: report.blocks, shareToken: report.shareToken }}
          data={data}
          sources={sources}
          back={back}
        />
      ) : (
        <ReportBody title={report.title} blocks={report.blocks} data={data} className="mx-auto max-w-3xl" />
      )}
      <ReportBody title={report.title} blocks={report.blocks} data={data} className="report-print-only" />
    </>
  );
}
