"use client";

import { useTranslations } from "next-intl";
import type { Block } from "@/lib/reports/blocks";
import type { ResolvedReport } from "@/server/services/reports";
import { codeColorVar } from "@/lib/qual/codes";
import { QuestionResult } from "@/components/results/question-result";
import { Markdown } from "@/components/writeup/markdown";
import { cn } from "@/lib/utils";

/** Renders a report's blocks from resolved data. Used by the editor preview, the share page and print. */
export function ReportBlock({ block, data }: { block: Block; data: ResolvedReport }) {
  const t = useTranslations("reportBuilder");
  switch (block.type) {
    case "heading":
      return <h2 className="mt-4 border-b pb-1 text-xl font-semibold text-balance">{block.text}</h2>;
    case "text":
      return <Markdown source={block.text} />;
    case "question": {
      const q = data.questions[block.id];
      if (!q) return <Missing />;
      return (
        <div className="grid gap-2 break-inside-avoid">
          <QuestionResult number={q.number} title={q.title} type={q.type} dataKind={q.dataKind} summary={q.summary} syntax={null} />
          {block.note && <p className="text-sm text-pretty text-muted-foreground">{block.note}</p>}
        </div>
      );
    }
    case "quote": {
      const q = data.quotes[block.id];
      if (!q) return <Missing />;
      return (
        <figure className="break-inside-avoid border-s-[3px] border-section-writeup/60 ps-4">
          <blockquote dir="auto" className="text-start text-lg leading-relaxed text-pretty">“{q.text}”</blockquote>
          <figcaption className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {q.who && <span className="font-medium text-foreground">{q.who}</span>}
            <span>{q.source}</span>
            {q.codes.map((c) => (
              <span key={c.name} className="inline-flex items-center gap-1">
                <span className="size-2 rounded-full" style={{ background: codeColorVar(c.color) }} aria-hidden />
                {c.name}
              </span>
            ))}
          </figcaption>
        </figure>
      );
    }
    case "theme": {
      const th = data.themes[block.id];
      if (!th) return <Missing />;
      return (
        <section className="grid gap-2 break-inside-avoid rounded-xl border bg-card p-4">
          <h3 className="font-semibold">{th.name}</h3>
          {th.description && <p className="text-sm text-pretty">{th.description}</p>}
          <p className="flex flex-wrap gap-1.5 text-xs">
            {th.codes.map((c) => (
              <span key={c.name} className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5">
                <span className="size-2 rounded-full" style={{ background: codeColorVar(c.color) }} aria-hidden />
                {c.name} <span className="text-muted-foreground tabular-nums">{c.count}</span>
              </span>
            ))}
          </p>
        </section>
      );
    }
    case "joint": {
      const j = data.joint;
      if (!j) return <Missing />;
      const rows = j.rows.filter((r) => r.convergence);
      return (
        <div className="overflow-x-auto rounded-xl border break-inside-avoid">
          <table className="w-full min-w-[30rem] text-sm">
            <caption className="px-3 pt-2 text-start text-xs text-muted-foreground">{t("jointCaption", { sessions: j.sessions, respondents: j.respondents })}</caption>
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-start font-medium">{t("code")}</th>
                <th className="px-3 py-2 text-start font-medium">{t("conversations")}</th>
                <th className="px-3 py-2 text-start font-medium">{t("survey")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.codeId} className="border-t">
                  <th scope="row" className="px-3 py-2 text-start font-medium">
                    <span className="inline-flex items-center gap-2">
                      <span className="size-2.5 rounded-full" style={{ background: codeColorVar(r.color) }} aria-hidden />
                      {r.name}
                    </span>
                  </th>
                  <td className="px-3 py-2 tabular-nums">{r.qual.passages ? t("qual", { passages: r.qual.passages, people: r.qual.people }) : "—"}</td>
                  <td className="px-3 py-2 tabular-nums">{r.quant.respondents ? `${Math.round(r.quant.share * 100)}%` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    case "writeup": {
      const w = data.writeups[block.id];
      if (!w) return <Missing />;
      return <Markdown source={w.body} />;
    }
  }
}

function Missing() {
  const t = useTranslations("reportBuilder");
  return <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">{t("missing")}</p>;
}

export function ReportBody({ title, blocks, data, className }: { title: string; blocks: Block[]; data: ResolvedReport; className?: string }) {
  return (
    <article className={cn("report-print grid grid-cols-1 gap-5", className)}>
      <h1 className="text-3xl font-semibold text-balance">{title}</h1>
      {blocks.map((b) => (
        <ReportBlock key={b.id} block={b} data={data} />
      ))}
    </article>
  );
}
