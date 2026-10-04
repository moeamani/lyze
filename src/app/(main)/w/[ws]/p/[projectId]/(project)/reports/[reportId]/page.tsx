import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getProjectContext } from "@/server/queries/workspace";
import {
  getReport,
  reportSources,
  resolveReport,
} from "@/server/services/reports";
import { can } from "@/lib/permissions";
import { ReportEditor } from "@/components/reports/report-editor";
import { ReportBody } from "@/components/reports/report-body";
import { PrintReport } from "@/components/reports/print-report";
import { PrintButton } from "@/components/reports/print-button";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("reportBuilder");
  return { title: t("title") };
}

export default async function ReportPage({
  params,
  searchParams,
}: PageProps<"/w/[ws]/p/[projectId]/reports/[reportId]">) {
  const { ws, projectId, reportId } = await params;
  const preview = (await searchParams).preview === "pdf";
  const { workspace, role, project } = await getProjectContext(ws, projectId);
  const report = await getReport(workspace.id, project.id, reportId);
  const [data, sources] = await Promise.all([
    resolveReport(workspace.id, project.id, report.blocks),
    can(role, "content:analyze")
      ? reportSources(workspace.id, project.id)
      : null,
  ]);
  const back = `/w/${ws}/p/${projectId}/reports`;
  const t = await getTranslations("reportBuilder");
  if (preview) {
    // The paper layout on screen, exactly as it prints.
    return (
      <div className="grid grid-cols-1 gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
          <Button asChild variant="ghost" size="sm" className="-ms-2">
            <Link href={`${back}/${report.id}`}>
              <ArrowLeftIcon className="rtl:rotate-180" /> {t("backToEditor")}
            </Link>
          </Button>
          <PrintButton label={t("print")} />
        </div>
        <div className="overflow-x-auto pb-6">
          <PrintReport
            title={report.title}
            project={project.name}
            generatedAt={new Date().toISOString()}
            blocks={report.blocks}
            data={data}
            className="print-sheet report-print min-w-[42rem]"
          />
        </div>
      </div>
    );
  }
  return (
    <>
      <div className="print:hidden">
        {sources ? (
          <ReportEditor
            scope={{
              workspaceId: workspace.id,
              slug: workspace.slug,
              projectId: project.id,
            }}
            report={{
              id: report.id,
              title: report.title,
              blocks: report.blocks,
              shareToken: report.shareToken,
            }}
            data={data}
            sources={sources}
            back={back}
          />
        ) : (
          <ReportBody
            title={report.title}
            blocks={report.blocks}
            data={data}
            className="mx-auto max-w-3xl"
          />
        )}
      </div>
      <PrintReport
        title={report.title}
        project={project.name}
        generatedAt={new Date().toISOString()}
        blocks={report.blocks}
        data={data}
        className="report-print report-print-only"
      />
    </>
  );
}
