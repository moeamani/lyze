/**
 * Charts drawn for paper (the PDF/print layout of a report), in the style of a chart in a Word or
 * Excel document: fixed geometry, hairline gridlines, a labelled axis and the value on every bar,
 * so nothing depends on screen size, hover or animation. Plain SVG, rendered on the server too.
 */

const W = 600;
const FONT = 10;
const SMALL = 8.5;
const INK = "#0b0b0b";
const INK2 = "#52514e";
const MUTED = "#6f6e69";
const GRID = "#e1e0d9";
const AXIS = "#9b9a94";
/** Single-series fill (blue, slot 1 of the validated categorical palette). */
export const BAR = "#2a78d6";
/** Diverging arms for ordered scales (validated as ordinal ramps against white) and a grey midpoint. */
const RED = ["#ec8d89", "#cf5552", "#a33232"];
const BLUE = ["#86b6ef", "#3987e5", "#1c5cab"];
const MID = "#d9d8d2";

/** Colours for an ordered scale of `k` points, from the negative end to the positive end. */
export function divergingColors(k: number): string[] {
  const arm = Math.floor(k / 2);
  const pick = (ramp: string[]) => (arm <= 1 ? [ramp[1]!] : arm === 2 ? [ramp[0]!, ramp[2]!] : [ramp[0]!, ramp[1]!, ramp[2]!, ...Array(Math.max(0, arm - 3)).fill(ramp[2]!)]);
  const red = pick(RED).reverse(); // darkest first
  const blue = pick(BLUE);
  return [...red, ...(k % 2 ? [MID] : []), ...blue];
}

/** Black or white text, whichever reads better on a fill (WCAG relative luminance). */
export function textOn(hex: string): string {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const l = 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
  return (l + 0.05) / 0.05 > 1.05 / (l + 0.05) ? INK : "#ffffff";
}

/** Rough text width (no layout engine on the server): ~0.55 em per character. */
const textWidth = (s: string, size: number) => s.length * size * 0.55;

/** Break a label into at most `lines` lines of `max` characters, ending with an ellipsis if cut. */
export function wrap(label: string, max: number, lines = 2): string[] {
  const words = label.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let line = "";
  for (const w of words) {
    if (!line) line = w;
    else if ((line + " " + w).length <= max) line += " " + w;
    else {
      out.push(line);
      line = w;
    }
  }
  if (line) out.push(line);
  const cut = out.slice(0, lines).map((l) => (l.length > max ? `${l.slice(0, max - 1)}…` : l));
  if (out.length > lines) cut[lines - 1] = `${cut[lines - 1]!.slice(0, max - 1).trimEnd()}…`;
  return cut.length ? cut : [""];
}

/** Round axis maximum and tick step ("nice numbers"), e.g. 37 → 40 in steps of 10. */
export function niceScale(max: number, ticks = 5): { max: number; step: number } {
  if (max <= 0) return { max: 1, step: 1 };
  const raw = max / ticks;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw)!;
  return { max: Math.ceil(max / step) * step, step };
}

const fmtPct = (p: number) => `${Math.round(p)}%`;

type Dir = { rtl?: boolean };
/** Mirror x positions and anchors for right-to-left reports. */
function mirror(rtl: boolean | undefined) {
  return {
    x: (x: number) => (rtl ? W - x : x),
    anchor: (a: "start" | "end" | "middle") => (rtl && a !== "middle" ? (a === "start" ? "end" : "start") : a),
    rect: (x: number, w: number) => (rtl ? W - x - w : x),
  };
}

/** Geometry is mirrored by hand for right-to-left reports, so the SVG itself always lays out LTR. */
function Svg({ height, label, children }: { height: number; label: string; children: React.ReactNode }) {
  return (
    <svg viewBox={`0 0 ${W} ${height}`} width="100%" role="img" aria-label={label} style={{ fontFamily: "inherit", display: "block", overflow: "visible", direction: "ltr" }}>
      {children}
    </svg>
  );
}

/**
 * Horizontal bars (Word "clustered bar"): one bar per answer with "n (p%)" at its end, and a
 * percentage axis. For single and multiple choice, ranking and the like.
 */
export function PrintBarChart({ rows, label, valueLabel = (r) => `${r.count} (${fmtPct(r.percent)})`, axis = "percent", rtl }: { rows: { label: string; count: number; percent: number }[]; label: string; valueLabel?: (r: { count: number; percent: number }) => string; axis?: "percent" | "count" } & Dir) {
  const m = mirror(rtl);
  const longest = Math.max(...rows.map((r) => Math.min(r.label.length, 34)), 4);
  const labelW = Math.min(W * 0.38, textWidth("x".repeat(longest), FONT) + 12);
  const valueW = 64;
  const plotX = labelW;
  const plotW = W - labelW - valueW;
  const lineH = FONT + 2;
  const rowH = rows.map((r) => Math.max(22, wrap(r.label, Math.floor(labelW / (FONT * 0.55)) - 1).length * lineH + 8));
  const top = 4;
  const height = top + rowH.reduce((a, b) => a + b, 0) + 26;
  const values = rows.map((r) => (axis === "percent" ? r.percent : r.count));
  const scale = axis === "percent" ? { max: Math.min(100, niceScale(Math.max(...values, 1)).max), step: niceScale(Math.max(...values, 1)).step } : niceScale(Math.max(...values, 1));
  const xOf = (v: number) => plotX + (v / scale.max) * plotW;
  const ticks: number[] = [];
  for (let v = 0; v <= scale.max + 1e-9; v += scale.step) ticks.push(+v.toFixed(6));
  const offsets = rowH.map((_, i) => top + rowH.slice(0, i).reduce((a, b) => a + b, 0));
  const plotBottom = top + rowH.reduce((a, b) => a + b, 0);
  return (
    <Svg height={height} label={label}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={m.x(xOf(t))} x2={m.x(xOf(t))} y1={top} y2={plotBottom} stroke={t === 0 ? AXIS : GRID} strokeWidth={t === 0 ? 1 : 0.75} />
          <text x={m.x(xOf(t))} y={plotBottom + 14} fontSize={SMALL} fill={MUTED} textAnchor="middle">
            {axis === "percent" ? `${t}%` : t}
          </text>
        </g>
      ))}
      {rows.map((r, i) => {
        const h = rowH[i]!;
        const barH = Math.min(14, h - 8);
        const cy = offsets[i]! + h / 2;
        const v = values[i]!;
        const bw = Math.max(v > 0 ? 1.5 : 0, xOf(v) - plotX);
        const lines = wrap(r.label, Math.floor(labelW / (FONT * 0.55)) - 1);
        return (
          <g key={i}>
            <text x={m.x(plotX - 6)} y={cy - ((lines.length - 1) * lineH) / 2 + FONT / 3} fontSize={FONT} fill={INK} textAnchor={m.anchor("end")}>
              {lines.map((l, j) => (
                <tspan key={j} x={m.x(plotX - 6)} dy={j ? lineH : 0}>
                  {l}
                </tspan>
              ))}
            </text>
            {bw > 0 && <rect x={m.rect(plotX, bw)} y={cy - barH / 2} width={bw} height={barH} fill={BAR} />}
            <text x={m.x(plotX + bw + 4)} y={cy + SMALL / 3} fontSize={SMALL} fill={INK2} textAnchor={m.anchor("start")}>
              {valueLabel(r)}
            </text>
          </g>
        );
      })}
    </Svg>
  );
}

/**
 * Vertical columns (Word "clustered column"): counts on a labelled y axis with gridlines, the
 * count above each column. For rating points, histograms and months.
 */
export function PrintColumnChart({ bars, label, yTitle, colors, rtl }: { bars: { label: string; count: number }[]; label: string; yTitle: string; colors?: string[] } & Dir) {
  const m = mirror(rtl);
  const n = Math.max(bars.length, 1);
  const plotX = 44;
  const plotW = W - plotX - 6;
  const slot = plotW / n;
  const colW = Math.min(56, slot * 0.66);
  const maxChars = Math.max(4, Math.floor(slot / (SMALL * 0.55)));
  const labelLines = Math.max(...bars.map((b) => wrap(b.label, maxChars).length), 1);
  const plotH = 150;
  const top = 12;
  const height = top + plotH + 8 + labelLines * (SMALL + 2) + 4;
  const scale = niceScale(Math.max(...bars.map((b) => b.count), 1));
  const yOf = (v: number) => top + plotH - (v / scale.max) * plotH;
  const ticks: number[] = [];
  for (let v = 0; v <= scale.max + 1e-9; v += scale.step) ticks.push(+v.toFixed(6));
  return (
    <Svg height={height} label={label}>
      <text transform={`translate(${m.x(10)} ${top + plotH / 2}) rotate(-90)`} fontSize={SMALL} fill={MUTED} textAnchor="middle">
        {yTitle}
      </text>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={m.x(plotX)} x2={m.x(W - 6)} y1={yOf(t)} y2={yOf(t)} stroke={t === 0 ? AXIS : GRID} strokeWidth={t === 0 ? 1 : 0.75} />
          <text x={m.x(plotX - 5)} y={yOf(t) + SMALL / 3} fontSize={SMALL} fill={MUTED} textAnchor={m.anchor("end")}>
            {Number.isInteger(t) ? t : t.toFixed(1)}
          </text>
        </g>
      ))}
      {bars.map((b, i) => {
        const cx = plotX + slot * i + slot / 2;
        const h = (b.count / scale.max) * plotH;
        return (
          <g key={i}>
            {h > 0 && <rect x={m.rect(cx - colW / 2, colW)} y={top + plotH - h} width={colW} height={h} fill={colors?.[i] ?? BAR} />}
            <text x={m.x(cx)} y={top + plotH - h - 4} fontSize={SMALL} fill={INK2} textAnchor="middle">
              {b.count}
            </text>
            <text x={m.x(cx)} y={top + plotH + 8 + SMALL} fontSize={SMALL} fill={INK} textAnchor="middle">
              {wrap(b.label, maxChars).map((l, j) => (
                <tspan key={j} x={m.x(cx)} dy={j ? SMALL + 2 : 0}>
                  {l}
                </tspan>
              ))}
            </text>
          </g>
        );
      })}
    </Svg>
  );
}

/**
 * 100% stacked bars (Word "100% stacked bar"): one bar per row, segments in scale order with
 * the percentage inside wide enough segments, and a legend underneath. For Likert items and grids.
 */
export function PrintStackedChart({ rows, columns, colors, label, rtl }: { rows: { label: string; percents: number[]; n?: number }[]; columns: string[]; colors: string[]; label: string } & Dir) {
  const m = mirror(rtl);
  const longest = Math.max(...rows.map((r) => Math.min(r.label.length, 34)), 2);
  const labelW = rows.length === 1 && !rows[0]!.label ? 0 : Math.min(W * 0.34, textWidth("x".repeat(longest), FONT) + 12);
  const plotX = labelW;
  const plotW = W - labelW - 2;
  const lineH = FONT + 2;
  const maxChars = Math.max(6, Math.floor(labelW / (FONT * 0.55)) - 1);
  const rowH = rows.map((r) => Math.max(26, (labelW ? wrap(r.label, maxChars).length : 1) * lineH + 10));
  const top = 2;
  // Legend: swatch + label, wrapping onto as many lines as needed.
  const items: { x: number; line: number; label: string; color: string }[] = [];
  let lx = 0;
  let line = 0;
  columns.forEach((c, i) => {
    const w = 14 + textWidth(c, SMALL) + 14;
    if (lx + w > W && lx > 0) {
      lx = 0;
      line++;
    }
    items.push({ x: lx, line, label: c, color: colors[i]! });
    lx += w;
  });
  const plotBottom = top + rowH.reduce((a, b) => a + b, 0);
  const legendTop = plotBottom + 12;
  const height = legendTop + (line + 1) * 16;
  const offsets = rowH.map((_, i) => top + rowH.slice(0, i).reduce((a, b) => a + b, 0));
  return (
    <Svg height={height} label={label}>
      {[0, 25, 50, 75, 100].map((t) => (
        <line key={t} x1={m.x(plotX + (t / 100) * plotW)} x2={m.x(plotX + (t / 100) * plotW)} y1={top} y2={plotBottom} stroke={t === 0 || t === 100 ? AXIS : GRID} strokeWidth={0.75} />
      ))}
      {rows.map((r, i) => {
        const h = rowH[i]!;
        const barH = Math.min(18, h - 8);
        const cy = offsets[i]! + h / 2;
        const sum = r.percents.reduce((a, b) => a + b, 0) || 1;
        const widths = r.percents.map((p) => (p / sum) * plotW);
        const starts = widths.map((_, j) => plotX + widths.slice(0, j).reduce((a, b) => a + b, 0));
        const lines = labelW ? wrap(r.label, maxChars) : [];
        return (
          <g key={i}>
            {lines.length > 0 && (
              <text x={m.x(plotX - 6)} y={cy - ((lines.length - 1) * lineH) / 2 + FONT / 3} fontSize={FONT} fill={INK} textAnchor={m.anchor("end")}>
                {lines.map((l, j) => (
                  <tspan key={j} x={m.x(plotX - 6)} dy={j ? lineH : 0}>
                    {l}
                  </tspan>
                ))}
              </text>
            )}
            {r.percents.map((p, j) => {
              const w = widths[j]!;
              const x = starts[j]!;
              return (
                <g key={j}>
                  {w > 0 && <rect x={m.rect(x, w)} y={cy - barH / 2} width={Math.max(0, w - 1)} height={barH} fill={colors[j]} />}
                  {w >= 26 && (
                    <text x={m.x(x + w / 2)} y={cy + SMALL / 3} fontSize={SMALL} textAnchor="middle" fill={textOn(colors[j]!)}>
                      {fmtPct((p / sum) * 100)}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        );
      })}
      {items.map((it, i) => (
        <g key={i}>
          <rect x={m.rect(it.x, 10)} y={legendTop + it.line * 16} width={10} height={10} fill={it.color} />
          <text x={m.x(it.x + 14)} y={legendTop + it.line * 16 + 9} fontSize={SMALL} fill={INK2} textAnchor={m.anchor("start")}>
            {it.label}
          </text>
        </g>
      ))}
    </Svg>
  );
}
