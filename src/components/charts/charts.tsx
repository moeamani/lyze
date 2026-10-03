"use client";

import { useId, useState } from "react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell as CellFill,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { cn } from "@/lib/utils";
import { ChartTooltip } from "./chart-tooltip";
import { divergingColor, heatColor, heatInk, seriesColor } from "./palette";

/**
 * Lyze chart kit. Conventions (see the data-viz notes in PLAN.md): one hue per series in fixed
 * order, thin marks (bars ≤ 24px, 4px rounded data end, 2px lines), hairline grid, values in text
 * ink, a legend whenever there are 2+ series, and a table view for everything.
 */

const AXIS = { stroke: "var(--chart-axis)", tick: { fill: "var(--chart-ink-muted)", fontSize: 12 }, tickLine: false } as const;
const GRID = { stroke: "var(--chart-grid)", vertical: false } as const;

export function Legend({ items, className }: { items: { label: string; color: string }[]; className?: string }) {
  if (items.length < 2) return null;
  return (
    <ul className={cn("flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground", className)}>
      {items.map((it) => (
        <li key={it.label} className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 shrink-0 rounded-sm" style={{ background: it.color }} />
          {it.label}
        </li>
      ))}
    </ul>
  );
}

// ── Bar list (categories) ───────────────────────────────────────────────────

export type BarListRow = { label: string; values: number[]; display: string[] };

/**
 * Horizontal bars as HTML: labels wrap instead of truncating (long survey options on phones),
 * values sit at the bar tip. Several series render as thin grouped bars with a legend.
 */
export function BarList({ rows, series, max }: { rows: BarListRow[]; series: string[]; max?: number }) {
  const top = max ?? Math.max(1e-9, ...rows.flatMap((r) => r.values));
  const multi = series.length > 1;
  return (
    <div className="grid gap-3">
      <Legend items={series.map((s, i) => ({ label: s, color: seriesColor(i) }))} />
      <ul className="grid gap-3">
        {rows.map((row) => (
          <li key={row.label} className="grid gap-1">
            <span className="text-sm text-pretty">{row.label}</span>
            <div className={cn("grid", multi ? "gap-[2px]" : "")}>
              {row.values.map((v, i) => (
                <div key={i} className="flex items-center gap-2" title={`${multi ? `${series[i]}: ` : ""}${row.display[i]}`}>
                  <div
                    className="h-3 rounded-e-[4px] transition-[width] duration-300 motion-reduce:transition-none"
                    style={{ width: `max(${v > 0 ? 2 : 0}px, ${(v / top) * 88}%)`, background: seriesColor(i) }}
                  />
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{row.display[i]}</span>
                </div>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── 100% stacked bars (Likert, matrices, NPS) ───────────────────────────────

export type StackRow = { label: string; n: number; segments: { label: string; percent: number; count: number }[] };

export function StackedBars({ rows, scale = "diverging" }: { rows: StackRow[]; scale?: "diverging" | "categorical" }) {
  const keys = rows[0]?.segments.map((s) => s.label) ?? [];
  const color = (i: number) => (scale === "diverging" ? divergingColor(i, keys.length) : seriesColor(i));
  return (
    <div className="grid gap-3">
      <ul className="grid gap-3">
        {rows.map((row) => (
          <li key={row.label} className="grid gap-1">
            {rows.length > 1 || row.label ? (
              <span className="flex items-baseline justify-between gap-2 text-sm">
                <span className="text-pretty">{row.label}</span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">n = {row.n}</span>
              </span>
            ) : null}
            <div className="flex h-7 w-full gap-[2px] overflow-hidden rounded-[4px]" role="img" aria-label={`${row.label}: ${row.segments.map((s) => `${s.label} ${Math.round(s.percent)}%`).join(", ")}`}>
              {row.segments.map((s, i) =>
                s.percent > 0 ? (
                  <div
                    key={s.label}
                    className="grid min-w-[3px] place-items-center text-[11px] font-medium tabular-nums"
                    style={{ width: `${s.percent}%`, background: color(i), color: scale === "diverging" && Math.abs(i - (keys.length - 1) / 2) < 0.6 ? "var(--foreground)" : "white" }}
                    title={`${s.label}: ${Math.round(s.percent)}% (${s.count})`}
                  >
                    {/* Inline label only when there is room for it. */}
                    {s.percent >= 12 ? `${Math.round(s.percent)}%` : ""}
                  </div>
                ) : null,
              )}
            </div>
          </li>
        ))}
      </ul>
      <Legend items={keys.map((k, i) => ({ label: k, color: color(i) }))} />
    </div>
  );
}

// ── Columns (distributions, histograms) ─────────────────────────────────────

export function ColumnChart({
  data,
  valueLabel,
  format = (v) => String(v),
  height = 220,
}: {
  data: { label: string; value: number; color?: string }[];
  valueLabel: string;
  format?: (v: number) => string;
  height?: number;
}) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }} barCategoryGap="20%">
          <CartesianGrid {...GRID} />
          <XAxis dataKey="label" {...AXIS} interval="preserveStartEnd" minTickGap={4} />
          <YAxis {...AXIS} axisLine={false} allowDecimals={false} width={40} tickFormatter={(v: number) => format(v)} />
          <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.6 }} content={(p) => <ChartTooltip active={p.active} payload={p.payload as never} label={p.label} valueFormatter={(v) => `${format(v)} ${valueLabel}`} />} />
          <Bar dataKey="value" name={valueLabel} maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false}>
            {data.map((d, i) => (
              <CellFill key={i} fill={d.color ?? seriesColor(0)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Line (over time) ────────────────────────────────────────────────────────

export function TimeLine({ data, valueLabel, height = 180 }: { data: { label: string; value: number }[]; valueLabel: string; height?: number }) {
  const id = useId().replace(/:/g, "");
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
          <defs>
            <linearGradient id={`fill-${id}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--series-1)" stopOpacity={0.12} />
              <stop offset="100%" stopColor="var(--series-1)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid {...GRID} />
          <XAxis dataKey="label" {...AXIS} minTickGap={24} />
          <YAxis {...AXIS} axisLine={false} allowDecimals={false} width={40} />
          <Tooltip cursor={{ stroke: "var(--chart-axis)" }} content={(p) => <ChartTooltip active={p.active} payload={p.payload as never} label={p.label} valueFormatter={(v) => `${v} ${valueLabel}`} />} />
          <Area dataKey="value" type="monotone" stroke="none" fill={`url(#fill-${id})`} isAnimationActive={false} />
          <Line dataKey="value" name={valueLabel} type="monotone" stroke="var(--series-1)" strokeWidth={2} dot={data.length < 20 ? { r: 3, fill: "var(--series-1)", stroke: "var(--card)", strokeWidth: 2 } : false} activeDot={{ r: 4, stroke: "var(--card)", strokeWidth: 2 }} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Donut (part-to-whole, ≤ 6 slices) ───────────────────────────────────────

export function Donut({ data, centerLabel }: { data: { label: string; value: number; display: string }[]; centerLabel?: string }) {
  return (
    <div className="grid items-center gap-4 sm:grid-cols-[200px_1fr]">
      <div className="relative mx-auto size-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="label" innerRadius={62} outerRadius={92} paddingAngle={data.length > 1 ? 1.5 : 0} stroke="none" isAnimationActive={false}>
              {data.map((d, i) => (
                <CellFill key={d.label} fill={seriesColor(i)} />
              ))}
            </Pie>
            <Tooltip content={(p) => <ChartTooltip active={p.active} payload={p.payload as never} label={p.label} valueFormatter={(_, __, item) => String(item.display)} />} />
          </PieChart>
        </ResponsiveContainer>
        {centerLabel && <span className="pointer-events-none absolute inset-0 grid place-items-center text-sm font-medium text-muted-foreground">{centerLabel}</span>}
      </div>
      <ul className="grid gap-1.5 text-sm">
        {data.map((d, i) => (
          <li key={d.label} className="flex items-center gap-2">
            <span aria-hidden className="size-2.5 shrink-0 rounded-sm" style={{ background: seriesColor(i) }} />
            <span className="min-w-0 flex-1 text-pretty">{d.label}</span>
            <span className="text-muted-foreground tabular-nums">{d.display}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Box plot ────────────────────────────────────────────────────────────────

export type BoxRow = { label: string; n: number; min: number; q1: number; median: number; q3: number; max: number; lowerWhisker: number; upperWhisker: number; outliers: number[]; mean?: number | null };

/** Horizontal Tukey box plots on one shared axis (one row per group). */
export function BoxPlots({ rows, format = (v: number) => String(Math.round(v * 100) / 100) }: { rows: BoxRow[]; format?: (v: number) => string }) {
  const lo = Math.min(...rows.map((r) => r.min));
  const hi = Math.max(...rows.map((r) => r.max));
  const span = hi - lo || 1;
  const x = (v: number) => `${((v - lo) / span) * 100}%`;
  const ticks = niceTicks(lo, hi, 5);
  return (
    <div className="grid gap-2">
      {rows.map((r, i) => (
        <div key={r.label} className="grid grid-cols-[minmax(5rem,9rem)_1fr] items-center gap-3">
          <span className="text-sm text-pretty">
            {r.label} <span className="text-xs text-muted-foreground">n = {r.n}</span>
          </span>
          <div
            className="relative h-8"
            role="img"
            aria-label={`${r.label}: median ${format(r.median)}, middle half ${format(r.q1)}–${format(r.q3)}, range ${format(r.min)}–${format(r.max)}`}
            title={`median ${format(r.median)} · IQR ${format(r.q1)}–${format(r.q3)} · range ${format(r.min)}–${format(r.max)}`}
          >
            <div className="absolute top-1/2 h-px bg-[var(--chart-axis)]" style={{ left: x(r.lowerWhisker), width: `calc(${x(r.upperWhisker)} - ${x(r.lowerWhisker)})` }} />
            <div className="absolute top-1.5 bottom-1.5 rounded-[4px]" style={{ left: x(r.q1), width: `max(2px, calc(${x(r.q3)} - ${x(r.q1)}))`, background: `color-mix(in oklab, ${seriesColor(i)} 25%, var(--card))`, boxShadow: `inset 0 0 0 1.5px ${seriesColor(i)}` }} />
            <div className="absolute top-1 bottom-1 w-0.5 -translate-x-1/2 rounded" style={{ left: x(r.median), background: seriesColor(i) }} />
            {r.outliers.map((o, j) => (
              <span key={j} className="absolute top-1/2 size-2 -translate-1/2 rounded-full ring-2 ring-card" style={{ left: x(o), background: seriesColor(i) }} />
            ))}
          </div>
        </div>
      ))}
      <div className="grid grid-cols-[minmax(5rem,9rem)_1fr] gap-3">
        <span />
        <div className="relative h-4 border-t border-[var(--chart-axis)] text-[11px] text-[var(--chart-ink-muted)] tabular-nums">
          {ticks.map((t) => (
            <span key={t} className="absolute top-1 -translate-x-1/2" style={{ left: x(t) }}>
              {format(t)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export function niceTicks(lo: number, hi: number, count: number): number[] {
  if (hi === lo) return [lo];
  const raw = (hi - lo) / count;
  const exp = Math.floor(Math.log10(raw));
  const f = raw / 10 ** exp;
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * 10 ** exp;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Math.round(v * 1e9) / 1e9);
  return out;
}

// ── Scatter with regression line ────────────────────────────────────────────

export function ScatterPlot({
  points,
  xLabel,
  yLabel,
  line,
  height = 280,
}: {
  points: { x: number; y: number }[];
  xLabel: string;
  yLabel: string;
  line?: { slope: number; intercept: number } | null;
  height?: number;
}) {
  // Survey scales are discrete, so many points overlap: jitter them slightly (deterministically).
  const discrete = points.every((p) => Number.isInteger(p.x) && Number.isInteger(p.y));
  const jittered = discrete ? points.map((p, i) => ({ x: p.x + jitter(i, 1), y: p.y + jitter(i, 2) })) : points;
  const xAxis = scatterAxis(points.map((p) => p.x), discrete);
  const yAxis = scatterAxis(points.map((p) => p.y), discrete);
  const [minX, maxX] = [Math.min(...points.map((p) => p.x)), Math.max(...points.map((p) => p.x))];
  const lineData = line ? [{ x: minX, y: line.intercept + line.slope * minX }, { x: maxX, y: line.intercept + line.slope * maxX }] : [];
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 8, right: 12, bottom: 20, left: 0 }}>
          <CartesianGrid stroke="var(--chart-grid)" />
          <XAxis type="number" dataKey="x" name={xLabel} {...AXIS} domain={xAxis.domain} ticks={xAxis.ticks} allowDataOverflow tickFormatter={fmtTick} label={{ value: xLabel, position: "insideBottom", offset: -12, fill: "var(--chart-ink-muted)", fontSize: 12 }} />
          <YAxis type="number" dataKey="y" name={yLabel} {...AXIS} width={44} domain={yAxis.domain} ticks={yAxis.ticks} allowDataOverflow tickFormatter={fmtTick} />
          <ZAxis range={[48, 48]} />
          <Tooltip cursor={{ stroke: "var(--chart-axis)" }} content={(p) => <ChartTooltip active={p.active} payload={p.payload as never} label={p.label} valueFormatter={(v) => String(Math.round(v * 100) / 100)} />} />
          <Scatter data={jittered} fill="var(--series-1)" fillOpacity={0.75} stroke="var(--card)" strokeWidth={2} isAnimationActive={false} />
          {line && <Scatter data={lineData} line={{ stroke: "var(--series-2)", strokeWidth: 2 }} shape={() => <g />} legendType="none" isAnimationActive={false} />}
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Discrete scales get one tick per value with half a step of air; continuous ones get nice ticks. */
function scatterAxis(values: number[], discrete: boolean): { domain: [number, number]; ticks: number[] } {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  if (discrete && hi - lo <= 12) {
    return { domain: [lo - 0.5, hi + 0.5], ticks: Array.from({ length: hi - lo + 1 }, (_, i) => lo + i) };
  }
  const ticks = niceTicks(lo, hi, 5);
  const step = ticks.length > 1 ? ticks[1]! - ticks[0]! : 1;
  const domain: [number, number] = [Math.min(lo, ticks[0]! - (ticks[0]! > lo ? step : 0)), Math.max(hi, ticks.at(-1)! + (ticks.at(-1)! < hi ? step : 0))];
  return { domain, ticks: niceTicks(domain[0], domain[1], 5) };
}

function fmtTick(v: number) {
  return String(Math.round(v * 100) / 100);
}

function jitter(i: number, salt: number) {
  const s = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return ((s - Math.floor(s)) - 0.5) * 0.3;
}

// ── Heatmap (crosstabs, correlation matrices) ───────────────────────────────

export function Heatmap({
  rowLabels,
  colLabels,
  cells,
  intensity,
  caption,
}: {
  rowLabels: string[];
  colLabels: string[];
  /** Text shown in each cell. */
  cells: string[][];
  /** 0–1 per cell, for color. */
  intensity: number[][];
  caption: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-[2px] text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th />
            {colLabels.map((c) => (
              <th key={c} scope="col" className="px-2 pb-1 text-center text-xs font-medium text-muted-foreground">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rowLabels.map((r, i) => (
            <tr key={r}>
              <th scope="row" className="max-w-48 pe-3 text-start text-sm font-normal text-pretty">
                {r}
              </th>
              {colLabels.map((c, j) => {
                const t = intensity[i]![j]!;
                return (
                  <td key={c} className="h-10 min-w-16 rounded-[4px] px-2 text-center tabular-nums" style={{ background: heatColor(t), color: heatInk(t) }}>
                    {cells[i]![j]}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Chart card with a table view ────────────────────────────────────────────

export type TableData = { headers: string[]; rows: (string | number)[][] };

export function DataTable({ table, caption }: { table: TableData; caption: string }) {
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-muted/50">
          <tr>
            {table.headers.map((h, i) => (
              <th key={i} scope="col" className={cn("px-3 py-2 text-xs font-medium whitespace-nowrap text-muted-foreground", i === 0 ? "text-start" : "text-end")}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((r, i) => (
            <tr key={i} className="border-t">
              {r.map((c, j) => (
                <td key={j} className={cn("px-3 py-2", j === 0 ? "text-start text-pretty" : "text-end whitespace-nowrap tabular-nums")}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ChartOrTable({
  chart,
  table,
  caption,
  chartLabel,
  tableLabel,
  alternatives,
}: {
  chart: React.ReactNode;
  table: TableData;
  caption: string;
  chartLabel: string;
  tableLabel: string;
  /** Optional extra chart forms, e.g. donut for part-to-whole. */
  alternatives?: { key: string; label: string; node: React.ReactNode }[];
}) {
  const [view, setView] = useState<string>("chart");
  const options = [{ key: "chart", label: chartLabel }, ...(alternatives ?? []).map((a) => ({ key: a.key, label: a.label })), { key: "table", label: tableLabel }];
  return (
    <div className="grid gap-4">
      <div role="radiogroup" aria-label={caption} className="inline-flex h-8 w-fit items-center rounded-lg bg-muted p-0.5 text-xs">
        {options.map((o) => (
          <button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={view === o.key}
            onClick={() => setView(o.key)}
            className={cn("h-full rounded-md px-2.5 font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40", view === o.key && "bg-card text-foreground shadow-soft")}
          >
            {o.label}
          </button>
        ))}
      </div>
      {view === "table" ? <DataTable table={table} caption={caption} /> : view === "chart" ? chart : alternatives?.find((a) => a.key === view)?.node}
    </div>
  );
}
