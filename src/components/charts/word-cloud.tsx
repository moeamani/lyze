"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { layoutCloud } from "@/lib/qual/cloud";

/**
 * Word cloud: size and ink weight encode frequency (one hue, light → dark). Text stays in the
 * foreground ink; the bar view next to it is the precise alternative.
 */
export function WordCloud({ words, label }: { words: { word: string; count: number }[]; label: string }) {
  const placed = useMemo(() => layoutCloud(words.slice(0, 45), { width: 560, height: 260, minSize: 13, maxSize: 42 }), [words]);
  const max = placed[0]?.count ?? 1;
  return (
    <svg viewBox="0 0 560 260" role="img" aria-label={label} className="h-auto w-full">
      {placed.map((p) => (
        <text
          key={p.word}
          x={p.x}
          y={p.y}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={p.size}
          fontWeight={p.rank < 3 ? 600 : 500}
          style={{ fill: "var(--foreground)", opacity: 0.55 + 0.45 * (p.count / max) }}
        >
          <title>{`${p.word}: ${p.count}`}</title>
          {p.word}
        </text>
      ))}
    </svg>
  );
}

/** Positive / neutral / negative split as one 100% bar (diverging: red ↔ gray ↔ blue). */
export function SentimentBar({ positive, neutral, negative }: { positive: number; neutral: number; negative: number }) {
  const t = useTranslations("results.sentiment");
  const total = positive + neutral + negative || 1;
  const parts = [
    { key: "negative" as const, n: negative, color: "var(--diverge-neg)" },
    { key: "neutral" as const, n: neutral, color: "var(--diverge-mid)" },
    { key: "positive" as const, n: positive, color: "var(--diverge-pos)" },
  ];
  return (
    <div className="grid gap-2">
      <div className="flex h-3 gap-[2px] overflow-hidden rounded-full" role="img" aria-label={parts.map((p) => `${t(p.key)} ${Math.round((p.n / total) * 100)}%`).join(", ")}>
        {parts
          .filter((p) => p.n > 0)
          .map((p) => (
            <span key={p.key} style={{ width: `${(p.n / total) * 100}%`, background: p.color }} />
          ))}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {parts.map((p) => (
          <li key={p.key} className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm" style={{ background: p.color }} aria-hidden />
            {t(p.key)} <span className="text-foreground tabular-nums">{Math.round((p.n / total) * 100)}%</span>
            <span className="tabular-nums">({p.n})</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
