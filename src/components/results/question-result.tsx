"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { BarList, BoxPlots, ChartOrTable, ColumnChart, Donut, Heatmap, StackedBars, type BoxRow, type TableData } from "@/components/charts/charts";
import { QuestionTypeIcon } from "@/components/builder/question-icon";
import type { QuestionSummary } from "@/lib/analysis/summary";
import type { Syntax } from "@/lib/analysis/syntax";
import type { QuestionType } from "@/lib/forms/schema";
import { num, pct } from "@/lib/stats/format";
import { SyntaxBlock } from "./syntax-block";

export type GroupSummary = { label: string; n: number; summary: QuestionSummary };

const ORDINAL_DIVERGING: QuestionType[] = ["likert"];

export function QuestionResult({
  number,
  title,
  type,
  dataKind,
  summary,
  groups,
  syntax,
}: {
  number: number;
  title: string;
  type: QuestionType;
  dataKind: "quant" | "qual";
  summary: QuestionSummary;
  groups?: GroupSummary[];
  syntax: Syntax | null;
}) {
  const t = useTranslations("results");
  const tt = useTranslations("questionTypes");
  const caption = `Q${number}. ${title}`;

  return (
    <Card className="gap-4" id={`q${number}`}>
      <CardHeader className="gap-2">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent-soft-foreground">
            <QuestionTypeIcon type={type} className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold text-pretty">
              <span className="me-1 text-muted-foreground tabular-nums">Q{number}.</span>
              {title}
            </h2>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>{tt(type)}</span>
              <Badge variant="outline" className="py-0">
                {t(dataKind)}
              </Badge>
              <span className="tabular-nums">{t("answered", { answered: summary.answered, total: summary.total })}</span>
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-5">
        <Body summary={summary} groups={groups} type={type} caption={caption} />
        {syntax && <SyntaxBlock syntax={syntax} />}
      </CardContent>
    </Card>
  );
}

function Tiles({ items }: { items: { label: string; value: string }[] }) {
  return (
    <dl className="grid grid-cols-3 gap-2 sm:grid-cols-6">
      {items.map((it) => (
        <div key={it.label} className="rounded-xl bg-muted/60 px-3 py-2">
          <dt className="text-xs text-muted-foreground">{it.label}</dt>
          <dd className="text-base font-semibold">{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Body({ summary, groups, type, caption }: { summary: QuestionSummary; groups?: GroupSummary[]; type: QuestionType; caption: string }) {
  const t = useTranslations("results");
  const chartLabel = t("chart");
  const tableLabel = t("table");
  const usable = groups?.filter((g) => g.n > 0) ?? [];
  const grouped = usable.length > 1;

  switch (summary.kind) {
    case "choice":
    case "multi": {
      if (grouped) {
        const cats = summary.categories.map((c) => c.label);
        const pctOf = (g: GroupSummary, label: string) => {
          const s = g.summary;
          return s.kind === "choice" || s.kind === "multi" ? (s.categories.find((c) => c.label === label)?.percent ?? 0) : 0;
        };
        const table: TableData = { headers: [t("option"), ...usable.map((g) => t("groupOf", { label: g.label, n: g.n }))], rows: cats.map((c) => [c, ...usable.map((g) => pct(pctOf(g, c)))]) };
        return (
          <ChartOrTable
            caption={caption}
            chartLabel={chartLabel}
            tableLabel={tableLabel}
            table={table}
            chart={<BarList series={usable.map((g) => t("groupOf", { label: g.label, n: g.n }))} max={100} rows={cats.map((c) => ({ label: c, values: usable.map((g) => pctOf(g, c)), display: usable.map((g) => pct(pctOf(g, c))) }))} />}
          />
        );
      }
      const table: TableData = { headers: [t("option"), t("count"), t("percent")], rows: summary.categories.map((c) => [c.label, c.count, pct(c.percent, 1)]) };
      const nonzero = summary.categories.filter((c) => c.count > 0);
      return (
        <div className="grid gap-4">
          <ChartOrTable
            caption={caption}
            chartLabel={chartLabel}
            tableLabel={tableLabel}
            table={table}
            chart={<BarList series={[t("percent")]} max={100} rows={summary.categories.map((c) => ({ label: c.label, values: [c.percent], display: [`${pct(c.percent)} · ${c.count}`] }))} />}
            alternatives={
              summary.kind === "choice" && nonzero.length >= 2 && nonzero.length <= 6
                ? [{ key: "donut", label: t("donut"), node: <Donut data={nonzero.map((c) => ({ label: c.label, value: c.count, display: `${pct(c.percent)} · ${c.count}` }))} centerLabel={`n = ${summary.answered}`} /> }]
                : undefined
            }
          />
          {summary.otherTexts.length > 0 && <TextList title={t("other")} items={summary.otherTexts} />}
        </div>
      );
    }

    case "scale": {
      const s = summary.stats;
      const tiles = [
        { label: t("n"), value: String(s.n) },
        { label: t("mean"), value: num(s.mean) },
        { label: t("median"), value: num(s.median, 1) },
        { label: t("sd"), value: num(s.sd) },
        { label: t("min"), value: num(s.min, 1) },
        { label: t("max"), value: num(s.max, 1) },
      ];
      const statTable: TableData = {
        headers: [t("value"), t("count"), t("percent")],
        rows: summary.categories
          ? summary.categories.map((c) => [c.label, c.count, pct(c.percent, 1)])
          : (summary.bins ?? []).map((b) => [`${num(b.x0, 1)} – ${num(b.x1, 1)}`, b.count, pct(s.n ? (b.count / s.n) * 100 : 0, 1)]),
      };

      if (grouped) {
        const box: BoxRow[] = usable.flatMap((g) => (g.summary.kind === "scale" && g.summary.box ? [{ ...g.summary.box, label: g.label, mean: g.summary.stats.mean }] : []));
        const meansTable: TableData = {
          headers: [t("group"), t("n"), t("mean"), t("sd"), t("median")],
          rows: usable.map((g) => (g.summary.kind === "scale" ? [g.label, g.summary.stats.n, num(g.summary.stats.mean), num(g.summary.stats.sd), num(g.summary.stats.median, 1)] : [g.label, 0, "—", "—", "—"])),
        };
        const likertGroups =
          ORDINAL_DIVERGING.includes(type) && summary.categories
            ? usable.map((g) => ({
                label: g.label,
                n: g.summary.kind === "scale" ? g.summary.stats.n : 0,
                segments: g.summary.kind === "scale" && g.summary.categories ? g.summary.categories.map((c) => ({ label: c.label, percent: c.percent, count: c.count })) : [],
              }))
            : null;
        return (
          <ChartOrTable
            caption={caption}
            chartLabel={chartLabel}
            tableLabel={tableLabel}
            table={meansTable}
            chart={likertGroups ? <StackedBars rows={likertGroups} /> : box.length ? <BoxPlots rows={box} /> : null}
            alternatives={likertGroups && box.length ? [{ key: "box", label: t("box"), node: <BoxPlots rows={box} /> }] : undefined}
          />
        );
      }

      let chart: React.ReactNode;
      if (summary.nps) {
        const n = summary.nps;
        chart = (
          <div className="grid gap-4">
            <p className="flex items-baseline gap-2">
              <span className="text-4xl font-semibold">{n.score ?? "—"}</span>
              <span className="text-sm text-muted-foreground">{t("npsScore")}</span>
            </p>
            <StackedBars
              rows={[
                {
                  label: "",
                  n: n.n,
                  segments: [
                    { label: t("detractors"), percent: n.n ? (n.detractors / n.n) * 100 : 0, count: n.detractors },
                    { label: t("passives"), percent: n.n ? (n.passives / n.n) * 100 : 0, count: n.passives },
                    { label: t("promoters"), percent: n.n ? (n.promoters / n.n) * 100 : 0, count: n.promoters },
                  ],
                },
              ]}
            />
            <ColumnChart data={(summary.categories ?? []).map((c) => ({ label: c.label, value: c.count }))} valueLabel={t("count").toLowerCase()} height={180} />
          </div>
        );
      } else if (ORDINAL_DIVERGING.includes(type) && summary.categories) {
        chart = <StackedBars rows={[{ label: "", n: s.n, segments: summary.categories.map((c) => ({ label: c.label, percent: c.percent, count: c.count })) }]} />;
      } else if (summary.categories) {
        chart = <ColumnChart data={summary.categories.map((c) => ({ label: c.label, value: c.count }))} valueLabel={t("count").toLowerCase()} />;
      } else {
        chart = <ColumnChart data={(summary.bins ?? []).map((b) => ({ label: num(b.x0, Number.isInteger(b.x0) ? 0 : 1), value: b.count }))} valueLabel={t("count").toLowerCase()} />;
      }
      return (
        <div className="grid gap-4">
          <Tiles items={tiles} />
          <ChartOrTable
            caption={caption}
            chartLabel={chartLabel}
            tableLabel={tableLabel}
            table={statTable}
            chart={chart}
            alternatives={summary.box ? [{ key: "box", label: t("box"), node: <BoxPlots rows={[{ ...summary.box, label: "" }]} /> }] : undefined}
          />
        </div>
      );
    }

    case "ranking": {
      const k = summary.items.length;
      const table: TableData = { headers: [t("option"), t("meanRank"), t("rankedFirst")], rows: summary.items.map((i) => [i.label, num(i.meanRank), pct(i.firstPercent)]) };
      return (
        <ChartOrTable
          caption={caption}
          chartLabel={chartLabel}
          tableLabel={tableLabel}
          table={table}
          chart={<BarList series={[t("meanRank")]} max={k} rows={summary.items.map((i) => ({ label: i.label, values: [k + 1 - i.meanRank], display: [`${t("meanRank")} ${num(i.meanRank, 1)} · ${pct(i.firstPercent)} #1`] }))} />}
        />
      );
    }

    case "matrix": {
      const table: TableData = {
        headers: [t("option"), ...summary.columns, t("n"), ...(summary.multiple ? [] : [t("mean")])],
        rows: summary.rows.map((r) => [r.label, ...r.percents.map((p) => pct(p)), r.n, ...(summary.multiple ? [] : [num(r.mean)])]),
      };
      const chart = summary.multiple ? (
        <Heatmap
          caption={caption}
          rowLabels={summary.rows.map((r) => r.label)}
          colLabels={summary.columns}
          cells={summary.rows.map((r) => r.percents.map((p) => pct(p)))}
          intensity={summary.rows.map((r) => r.percents.map((p) => p / 100))}
        />
      ) : (
        <StackedBars rows={summary.rows.map((r) => ({ label: r.label, n: r.n, segments: summary.columns.map((c, i) => ({ label: c, percent: r.percents[i]!, count: r.counts[i]! })) }))} />
      );
      return <ChartOrTable caption={caption} chartLabel={chartLabel} tableLabel={tableLabel} table={table} chart={chart} />;
    }

    case "text":
      if (summary.answered === 0) return <p className="text-sm text-muted-foreground">{t("noText")}</p>;
      return (
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="grid content-start gap-3">
            <h3 className="text-sm font-medium">{t("topWords")}</h3>
            <BarList series={[t("count")]} rows={summary.words.slice(0, 12).map((w) => ({ label: w.word, values: [w.count], display: [String(w.count)] }))} />
          </div>
          <div className="grid content-start gap-2">
            <h3 className="text-sm font-medium">
              {t("recentAnswers")} <span className="font-normal text-muted-foreground">· {t("avgWords", { n: num(summary.avgWords, 0) })}</span>
            </h3>
            <TextList items={summary.recent} />
          </div>
        </div>
      );

    case "date":
      return (
        <div className="grid gap-3">
          <p className="text-sm text-muted-foreground">{summary.earliest && t("dates", { from: summary.earliest, to: summary.latest ?? "" })}</p>
          <ColumnChart data={summary.byMonth.map((m) => ({ label: m.month, value: m.count }))} valueLabel={t("count").toLowerCase()} height={180} />
        </div>
      );

    case "files":
      return <p className="text-sm text-muted-foreground">{t("files", { count: summary.files })}</p>;
  }
}

function TextList({ items, title }: { items: string[]; title?: string }) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, 6);
  return (
    <div className="grid gap-2">
      {title && <h3 className="text-sm font-medium">{title}</h3>}
      <ul className="grid gap-2">
        {shown.map((text, i) => (
          <li key={i} className="rounded-xl border-s-2 border-[var(--series-1)] bg-muted/40 px-3 py-2 text-sm text-pretty whitespace-pre-line">
            {text}
          </li>
        ))}
      </ul>
      {items.length > 6 && (
        <button type="button" onClick={() => setAll((a) => !a)} className="w-fit text-sm text-primary underline-offset-4 hover:underline">
          {all ? "−" : `+${items.length - 6}`}
        </button>
      )}
    </div>
  );
}
