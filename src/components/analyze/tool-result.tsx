"use client";

import { useTranslations } from "next-intl";
import { CircleAlertIcon, CircleCheckIcon, InfoIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BoxPlots, DataTable, Heatmap, ScatterPlot } from "@/components/charts/charts";
import { SyntaxBlock } from "@/components/results/syntax-block";
import type { ToolResult } from "@/server/queries/analyze-tools";

const STATUS_ICON = { ok: CircleCheckIcon, warn: CircleAlertIcon, info: InfoIcon } as const;
const STATUS_CLASS = { ok: "text-success", warn: "text-warning", info: "text-muted-foreground" } as const;

/** One analysis result: plain-language reading first, then the numbers, checks and syntax. */
export function ToolResultView({ result }: { result: ToolResult }) {
  const t = useTranslations("analyze");
  const ts = useTranslations("stats.status");
  const v = result.visual;
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <div className="grid content-start gap-6">
        <Card className="gap-4">
          <CardHeader className="gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base">{t("summary")}</CardTitle>
              {result.significant !== null && <Badge variant={result.significant ? "success" : "secondary"}>{result.significant ? t("significant") : t("notSignificant")}</Badge>}
              {result.n > 0 && <span className="text-xs text-muted-foreground">{t("sampleSize", { n: result.n })}</span>}
            </div>
          </CardHeader>
          <CardContent className="grid gap-3">
            <p className="text-lg leading-relaxed text-pretty">{result.headline}</p>
            {result.notes.map((n, i) => (
              <p key={i} className="text-sm text-muted-foreground">
                {n}
              </p>
            ))}
            {result.report && (
              <div className="rounded-xl bg-muted/60 px-3 py-2">
                <p className="text-xs text-muted-foreground">{t("report")}</p>
                <p className="font-mono text-sm" dir="ltr">
                  {result.report}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {v.kind !== "none" && (
          <Card>
            <CardContent>
              {v.kind === "heatmap" && <Heatmap rowLabels={v.rowLabels} colLabels={v.colLabels} cells={v.cells} intensity={v.intensity} caption={v.caption} />}
              {v.kind === "box" && <BoxPlots rows={v.rows} />}
              {v.kind === "scatter" && <ScatterPlot points={v.points} xLabel={v.xLabel} yLabel={v.yLabel} line={v.line} />}
            </CardContent>
          </Card>
        )}
        {result.table && <DataTable table={result.table} caption={t("result")} />}
        <SyntaxBlock syntax={result.syntax} defaultOpen />
      </div>

      <div className="grid content-start gap-6">
        {result.details.length > 0 && (
          <Card className="gap-3">
            <CardHeader>
              <CardTitle className="text-base">{t("details")}</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-2 text-sm">
                {result.details.map((d) => (
                  <div key={d.label} className="flex items-baseline justify-between gap-3 border-b border-dashed pb-2 last:border-0 last:pb-0">
                    <dt className="text-muted-foreground">{d.label}</dt>
                    <dd className="text-end font-medium tabular-nums">{d.value}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
        )}
        {result.assumptions.length > 0 && (
          <Card className="gap-3">
            <CardHeader>
              <CardTitle className="text-base">{t("assumptions")}</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="grid gap-3 text-sm">
                {result.assumptions.map((a, i) => {
                  const Icon = STATUS_ICON[a.status];
                  return (
                    <li key={i} className="flex items-start gap-2">
                      <Icon className={`mt-0.5 size-4 shrink-0 ${STATUS_CLASS[a.status]}`} aria-hidden />
                      <span>
                        <span className="sr-only">{ts(a.status)}: </span>
                        {a.text}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
