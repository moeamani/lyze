"use client";


/** Shared tooltip: label on top, one row per series with a color key. Values in text ink. */
type Item = { value?: unknown; name?: unknown; color?: string; payload?: unknown };

export function ChartTooltip({ active, payload, label, valueFormatter, labelFormatter }: {
  active?: boolean;
  payload?: readonly Item[];
  label?: unknown;
  valueFormatter?: (v: number, name: string, item: Record<string, unknown>) => string;
  labelFormatter?: (label: string) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-36 rounded-xl border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-lift">
      {label !== undefined && label !== null ? <p className="mb-1 font-medium">{labelFormatter ? labelFormatter(String(label)) : String(label)}</p> : null}
      <ul className="grid gap-0.5">
        {payload.map((item, i) => (
          <li key={i} className="flex items-center gap-2">
            <span aria-hidden className="size-2.5 shrink-0 rounded-sm" style={{ background: (item.color as string) || (item.payload as { fill?: string })?.fill }} />
            {payload.length > 1 && <span className="text-muted-foreground">{String(item.name)}</span>}
            <span className="ms-auto font-medium tabular-nums">
              {valueFormatter ? valueFormatter(Number(item.value), String(item.name), item.payload as Record<string, unknown>) : String(item.value)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
