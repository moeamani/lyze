import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getReportByToken, resolveReport } from "@/server/services/reports";
import { ReportBody } from "@/components/reports/report-body";
import { PrintReport } from "@/components/reports/print-report";
import { PrintButton } from "@/components/reports/print-button";
import { Logo } from "@/components/common/logo";

export const metadata: Metadata = { robots: { index: false } };

/** A report shared by link: read-only, no sign-in, always showing current data. */
export default async function SharedReportPage({ params }: PageProps<"/r/[token]">) {
  const { token } = await params;
  const found = await getReportByToken(token);
  if (!found) notFound();
  const t = await getTranslations("reportBuilder");
  const data = await resolveReport(found.report.workspaceId, found.report.projectId, found.report.blocks);
  return (
    <div className="min-h-dvh bg-background">
      <header className="flex items-center gap-3 border-b px-4 py-3 sm:px-8 print:hidden">
        <Logo />
        <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{t("sharedFrom", { project: found.projectName })}</span>
        <PrintButton label={t("print")} />
      </header>
      <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-12 print:hidden">
        <ReportBody title={found.report.title} blocks={found.report.blocks} data={data} />
      </main>
      <PrintReport title={found.report.title} project={found.projectName} generatedAt={new Date().toISOString()} blocks={found.report.blocks} data={data} className="report-print report-print-only" />
    </div>
  );
}
