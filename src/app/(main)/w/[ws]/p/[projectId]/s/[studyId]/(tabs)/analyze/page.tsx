import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PencilRulerIcon } from "lucide-react";
import { getStudyContext } from "@/server/queries/workspace";
import { parseFilter, str } from "@/server/queries/analysis";
import { runTool, TOOLS, variableOptions, type Tool } from "@/server/queries/analyze-tools";
import { loadStudyDataset } from "@/server/services/analysis";
import { filterRows, isCategorical, isNumeric } from "@/lib/analysis/dataset";
import { summarize } from "@/lib/stats/descriptive";
import { can } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";
import { SegmentedNav } from "@/components/common/segmented-nav";
import { ChartIllustration } from "@/components/illustrations";
import { ResultsToolbar } from "@/components/results/results-toolbar";
import { ToolControls, type Field } from "@/components/analyze/tool-controls";
import { ToolResultView } from "@/components/analyze/tool-result";
import { PrepareForm } from "@/components/analyze/prepare-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("analyze");
  return { title: t("title") };
}

export default async function AnalyzePage({ params, searchParams }: PageProps<"/w/[ws]/p/[projectId]/s/[studyId]/analyze">) {
  const { ws, projectId, studyId } = await params;
  const sp = await searchParams;
  const { workspace, study, role } = await getStudyContext(ws, projectId, studyId);
  const t = await getTranslations("analyze");
  const tr = await getTranslations("results");
  const base = `/w/${ws}/p/${projectId}/s/${studyId}`;
  const tool: Tool = TOOLS.find((x) => x === sp.tool) ?? "crosstab";
  const dataset = await loadStudyDataset(workspace.id, study.id);

  if (!dataset.doc) {
    return (
      <EmptyState illustration={<ChartIllustration />} title={tr("noFormTitle")} description={tr("noFormBody")}>
        <Button asChild variant="soft">
          <Link href={`${base}/build`}>
            <PencilRulerIcon />
            {tr("noFormTitle")}
          </Link>
        </Button>
      </EmptyState>
    );
  }

  const filter = parseFilter(sp.f);
  const rows = filterRows(dataset, filter);
  const opts = variableOptions(dataset);
  const keep = (k: string) => (str(sp.f) ? `&f=${encodeURIComponent(str(sp.f)!)}` : "") + k;

  const nav = (
    <SegmentedNav
      label={t("tools")}
      className="w-full sm:w-fit"
      items={TOOLS.map((x) => ({ href: `${base}/analyze?tool=${x}${keep("")}`, label: t(`tool.${x}`), active: x === tool }))}
    />
  );
  const toolbar = (
    <ResultsToolbar
      doc={{ pages: [{ id: "all", shuffleQuestions: false, questions: [...dataset.questions.values()].map((q) => q.question) }] }}
      filter={filter}
      compareOptions={[]}
      by={null}
      studyId={study.id}
      showCompare={false}
    />
  );

  if (tool === "prepare") {
    const durations = dataset.rows.map((r) => r.meta.durationMs).filter((d): d is number => d !== null);
    const median = summarize(durations).median;
    return (
      <div className="grid gap-6">
        {nav}
        <PrepareForm
          scope={{ workspaceId: workspace.id, slug: ws, projectId, studyId }}
          initial={dataset.settings}
          medianSeconds={median ? median / 1000 : null}
          counts={{ kept: dataset.rows.length, ...dataset.excluded }}
          canEdit={can(role, "content:analyze")}
          variables={dataset.variables
            .filter((v) => v.role === "question" && v.type === "numeric")
            .map((v) => ({ id: v.id, name: v.name, label: v.label, categories: v.categories, numeric: isNumeric(v), categorical: isCategorical(v) }))}
        />
      </div>
    );
  }

  type MethodKey = "auto" | "parametric" | "nonparametric" | "pearson" | "spearman";
  const methodOptions = (keys: MethodKey[]) => keys.map((k) => ({ id: k, label: t(`methods.${k}`) }));
  const fields: Record<Exclude<Tool, "prepare">, Field[]> = {
    crosstab: [
      { kind: "single", param: "row", label: t("rows"), options: opts.categorical },
      { kind: "single", param: "col", label: t("columns"), options: opts.categorical },
      { kind: "choice", param: "pct", label: t("percentages"), options: (["col", "row", "total", "count"] as const).map((k) => ({ id: k, label: t(`pctModes.${k}`) })), fallback: "col" },
    ],
    compare: [
      { kind: "single", param: "y", label: t("outcome"), options: opts.numeric },
      { kind: "single", param: "group", label: t("group"), options: opts.categorical },
      { kind: "choice", param: "method", label: t("method"), options: methodOptions(["auto", "parametric", "nonparametric"]), fallback: "auto" },
    ],
    correlate: [
      { kind: "single", param: "x", label: t("x"), options: opts.numeric },
      { kind: "single", param: "y", label: t("y"), options: opts.numeric },
      { kind: "choice", param: "method", label: t("method"), options: methodOptions(["pearson", "spearman"]), fallback: "pearson" },
    ],
    paired: [
      { kind: "single", param: "a", label: t("first"), options: opts.numeric },
      { kind: "single", param: "b", label: t("second"), options: opts.numeric },
    ],
    reliability: [{ kind: "multi", param: "items", label: t("items"), options: opts.numeric, min: 2 }],
    matrix: [
      { kind: "multi", param: "vars", label: t("variables"), options: opts.numeric, min: 2 },
      { kind: "choice", param: "method", label: t("method"), options: methodOptions(["pearson", "spearman"]), fallback: "pearson" },
    ],
  };

  const flat = Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, str(v)]));
  const result = await runTool(tool, dataset, rows, flat);

  return (
    <div className="grid gap-6">
      {nav}
      <div className="grid gap-4 rounded-2xl border bg-card p-4 shadow-soft sm:p-5">
        <p className="text-sm text-muted-foreground">{t(`toolHint.${tool}`)}</p>
        <ToolControls fields={fields[tool]} />
      </div>
      {toolbar}
      {result ? <ToolResultView result={result} /> : <EmptyState illustration={<ChartIllustration />} title={t("pickToStart")} />}
    </div>
  );
}
