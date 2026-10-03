import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PencilRulerIcon, SlidersHorizontalIcon } from "lucide-react";
import { getStudyContext } from "@/server/queries/workspace";
import { compareOptions, parseFilter, str } from "@/server/queries/analysis";
import { loadStudyDataset } from "@/server/services/analysis";
import { responseCounts } from "@/server/services/responses";
import { filterRows, groupRows, isCategorical } from "@/lib/analysis/dataset";
import { responsesOverTime, summarizeQuestion } from "@/lib/analysis/summary";
import { syntax } from "@/lib/analysis/syntax";
import { summarize } from "@/lib/stats/descriptive";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/common/empty-state";
import { ChartIllustration } from "@/components/illustrations";
import { TimeLine } from "@/components/charts/charts";
import { QuestionResult, type GroupSummary } from "@/components/results/question-result";
import { ResultsToolbar } from "@/components/results/results-toolbar";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("results");
  return { title: t("title") };
}

export default async function ResultsPage({ params, searchParams }: PageProps<"/w/[ws]/p/[projectId]/s/[studyId]/results">) {
  const { ws, projectId, studyId } = await params;
  const sp = await searchParams;
  const { workspace, study } = await getStudyContext(ws, projectId, studyId);
  const t = await getTranslations("results");
  const base = `/w/${ws}/p/${projectId}/s/${studyId}`;
  const [dataset, counts] = await Promise.all([loadStudyDataset(workspace.id, study.id), responseCounts(workspace.id, study.id)]);

  if (!dataset.doc) {
    return (
      <EmptyState illustration={<ChartIllustration />} title={t("noFormTitle")} description={t("noFormBody")}>
        <Button asChild variant="soft">
          <Link href={`${base}/build`}>
            <PencilRulerIcon />
            {t("noFormTitle")}
          </Link>
        </Button>
      </EmptyState>
    );
  }

  const filter = parseFilter(sp.f);
  const rows = filterRows(dataset, filter);
  const byId = str(sp.by);
  const byVar = byId ? dataset.byId.get(byId) : undefined;
  const groupBy = byVar && isCategorical(byVar) ? byVar : undefined;
  const groups = groupBy ? groupRows(rows, groupBy).filter((g) => g.rows.length > 0).slice(0, 8) : [];

  const completed = counts.complete;
  const started = counts.complete + counts.partial;
  const durations = rows.map((r) => r.meta.durationMs).filter((d): d is number => d !== null);
  const median = summarize(durations).median;
  const excludedTotal = dataset.excluded.speeders + dataset.excluded.manual;
  const timeline = responsesOverTime(rows);
  const questions = [...dataset.questions.values()];

  return (
    <div className="grid gap-6">
      <ResultsToolbar doc={{ pages: [{ id: "all", shuffleQuestions: false, questions: questions.map((q) => q.question) }] }} filter={filter} compareOptions={compareOptions(dataset)} by={groupBy?.id ?? null} studyId={study.id} />

      <section aria-label={t("title")} className="grid grid-cols-3 gap-2 sm:gap-3">
        <Kpi label={t("responses")} value={String(rows.length)} />
        <Kpi label={t("completion")} value={started ? `${Math.round((completed / started) * 100)}%` : "—"} />
        <Kpi label={t("medianTime")} value={median ? formatDuration(median) : "—"} />
      </section>
      <p className="-mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {t("excludedNote", { count: excludedTotal })}
        <Link href={`${base}/analyze?tool=prepare`} className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline">
          <SlidersHorizontalIcon className="size-3" aria-hidden />
          Prepare data
        </Link>
      </p>

      {rows.length === 0 ? (
        <EmptyState illustration={<ChartIllustration />} title={t("noDataTitle")} description={t("noDataBody")} />
      ) : (
        <>
          {timeline.length > 1 && (
            <Card className="gap-3">
              <CardHeader>
                <CardTitle className="text-base">{t("overTime")}</CardTitle>
              </CardHeader>
              <CardContent>
                <TimeLine data={timeline.map((d) => ({ label: d.day.slice(5), value: d.count }))} valueLabel={t("perDay")} />
              </CardContent>
            </Card>
          )}
          {questions.map(({ question, number }) => {
            const summary = summarizeQuestion(question, number, rows);
            const groupSummaries: GroupSummary[] | undefined = groupBy
              ? groups.map((g) => ({ label: g.category.label, n: g.rows.length, summary: summarizeQuestion(question, number, g.rows) }))
              : undefined;
            const main = dataset.byId.get(question.id) ?? dataset.variables.find((v) => v.questionId === question.id);
            const isScale = summary.kind === "scale";
            const syn = main ? (isScale ? syntax.descriptives(main) : summary.kind === "choice" ? syntax.frequencies(main) : null) : null;
            return (
              <QuestionResult
                key={question.id}
                number={number}
                title={question.title}
                type={question.type}
                dataKind={question.dataKind}
                summary={summary}
                groups={groupBy?.questionId === question.id ? undefined : groupSummaries}
                syntax={syn}
              />
            );
          })}
        </>
      )}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border bg-card p-3.5 shadow-soft sm:p-4">
      <p className="text-2xl font-semibold">{value}</p>
      <p className="text-xs text-muted-foreground sm:text-sm">{label}</p>
    </div>
  );
}

function formatDuration(ms: number) {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}
