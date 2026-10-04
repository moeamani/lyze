"use client";

import { useLocale, useTranslations } from "next-intl";
import type { Block } from "@/lib/reports/blocks";
import type { ResolvedQuestion, ResolvedReport } from "@/server/services/reports";
import { direction, type Locale } from "@/i18n/config";
import { Markdown } from "@/components/writeup/markdown";
import { cn } from "@/lib/utils";
import { PrintBarChart, PrintColumnChart, PrintStackedChart, divergingColors } from "./print-charts";

type Numbers = Map<string, string>;

/** Whether a question prints as a figure, a table, or just a note (decides numbering up front). */
function questionKind(q: ResolvedQuestion): "figure" | "table" | null {
  const s = q.summary;
  switch (s.kind) {
    case "choice":
    case "multi":
      return s.categories.some((c) => c.count > 0) ? "figure" : null;
    case "scale":
      return s.categories?.length || s.bins?.length ? "figure" : null;
    case "matrix":
      return !s.multiple && s.columns.length >= 2 ? "figure" : "table";
    case "ranking":
      return "figure";
    case "date":
      return s.byMonth.length ? "figure" : null;
    case "text":
      return "table";
    case "files":
      return null;
  }
}

const num = (x: number | null | undefined, d = 2) => (x === null || x === undefined || !Number.isFinite(x) ? "—" : x.toFixed(d));

/**
 * A report laid out for paper: a title block, numbered figures with APA-style captions, charts
 * drawn for print (see print-charts), notes with n and descriptive statistics, and plain tables.
 * This is what "Print / Save as PDF" produces; the screen version stays interactive.
 */
export function PrintReport({ title, project, generatedAt, blocks, data, className }: { title: string; project?: string; generatedAt: string; blocks: Block[]; data: ResolvedReport; className?: string }) {
  const t = useTranslations("reportBuilder.pdf");
  const locale = useLocale() as Locale;
  const rtl = direction(locale) === "rtl";
  // Figures and tables are numbered separately, in reading order.
  const numbers: Numbers = new Map();
  let figures = 0;
  let tables = 0;
  for (const b of blocks) {
    const kind = b.type === "question" ? (data.questions[b.id] ? questionKind(data.questions[b.id]!) : null) : b.type === "joint" && data.joint ? "table" : null;
    if (kind === "figure") numbers.set(b.id, t("figure", { n: ++figures }));
    if (kind === "table") numbers.set(b.id, t("table", { n: ++tables }));
  }
  const studies = [...new Set(Object.values(data.questions).map((q) => q.study))];
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" }).format(new Date(generatedAt));
  return (
    <article dir={rtl ? "rtl" : "ltr"} className={cn("print-doc", className)}>
      <header className="print-titleblock">
        <h1>{title}</h1>
        <p>{[project, studies.length ? studies.join(", ") : null, date].filter(Boolean).join(" · ")}</p>
      </header>
      {blocks.map((b) => (
        <PrintBlock key={b.id} block={b} data={data} label={numbers.get(b.id) ?? null} rtl={rtl} />
      ))}
      <footer className="print-colophon">{t("colophon", { date })}</footer>
    </article>
  );
}

function PrintBlock({ block, data, label, rtl }: { block: Block; data: ResolvedReport; label: string | null; rtl: boolean }) {
  const t = useTranslations("reportBuilder.pdf");
  switch (block.type) {
    case "heading":
      return <h2>{block.text}</h2>;
    case "text":
      return (
        <div className="print-prose">
          <Markdown source={block.text} />
        </div>
      );
    case "writeup": {
      const w = data.writeups[block.id];
      return w ? (
        <div className="print-prose">
          <Markdown source={w.body} />
        </div>
      ) : null;
    }
    case "question": {
      const q = data.questions[block.id];
      return q ? <QuestionFigure q={q} note={block.note} label={label} rtl={rtl} /> : null;
    }
    case "quote": {
      const q = data.quotes[block.id];
      if (!q) return null;
      return (
        <figure className="print-quote">
          <blockquote dir="auto">“{q.text}”</blockquote>
          <figcaption>— {[q.who, q.source, q.codes.map((c) => c.name).join(", ")].filter(Boolean).join(" · ")}</figcaption>
        </figure>
      );
    }
    case "theme": {
      const th = data.themes[block.id];
      if (!th) return null;
      return (
        <section className="print-theme">
          <h3>{th.name}</h3>
          {th.description && <p>{th.description}</p>}
          {th.codes.length > 0 && (
            <p className="print-note">
              <em>{t("codes")}</em> {th.codes.map((c) => `${c.name} (${c.count})`).join(", ")}
            </p>
          )}
        </section>
      );
    }
    case "joint": {
      const j = data.joint;
      if (!j) return null;
      const rows = j.rows.filter((r) => r.convergence);
      return (
        <figure className="print-figure">
          <figcaption>
            <span className="print-label">{label}</span>
            <span className="print-title">{t("jointTitle")}</span>
          </figcaption>
          <table className="print-table">
            <thead>
              <tr>
                <th>{t("code")}</th>
                <th className="num">{t("passages")}</th>
                <th className="num">{t("people")}</th>
                <th className="num">{t("respondents")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.codeId}>
                  <td>{r.name}</td>
                  <td className="num">{r.qual.passages || "—"}</td>
                  <td className="num">{r.qual.people || "—"}</td>
                  <td className="num">{r.quant.respondents ? `${r.quant.respondents} (${Math.round(r.quant.share * 100)}%)` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="print-note">
            <em>{t("noteLabel")}</em> {t("jointNote", { sessions: j.sessions, respondents: j.respondents })}
          </p>
        </figure>
      );
    }
  }
}

/** One survey question as a numbered figure (or table, for text answers) with its note. */
function QuestionFigure({ q, note, label, rtl }: { q: ResolvedQuestion; note: string; label: string | null; rtl: boolean }) {
  const t = useTranslations("reportBuilder.pdf");
  const s = q.summary;
  const answered = t("answered", { n: s.answered, total: s.total });
  let body: React.ReactNode = null;
  const notes: string[] = [answered];

  switch (s.kind) {
    case "choice":
    case "multi": {
      const shown = s.categories.filter((c) => c.count > 0);
      const unchosen = s.categories.filter((c) => c.count === 0).map((c) => c.label);
      body = shown.length ? <PrintBarChart rows={shown} label={q.title} rtl={rtl} /> : null;
      if (s.kind === "multi") notes.push(t("multiNote"));
      if (unchosen.length) notes.push(t("unchosen", { options: unchosen.join(", ") }));
      break;
    }
    case "scale": {
      const st = s.stats;
      const stats = t("stats", { m: num(st.mean), sd: num(st.sd), mdn: num(st.median, st.median !== null && Number.isInteger(st.median) ? 0 : 2), min: num(st.min, 0), max: num(st.max, 0) });
      if (q.type === "likert" && s.categories?.length) {
        const total = s.categories.reduce((a, c) => a + c.count, 0) || 1;
        body = <PrintStackedChart rows={[{ label: "", percents: s.categories.map((c) => (c.count / total) * 100) }]} columns={s.categories.map((c) => `${c.label} (${c.count})`)} colors={divergingColors(s.categories.length)} label={q.title} rtl={rtl} />;
      } else if (s.categories?.length) {
        body = <PrintColumnChart bars={s.categories.map((c) => ({ label: c.label, count: c.count }))} label={q.title} yTitle={t("respondentsAxis")} rtl={rtl} />;
      } else if (s.bins?.length) {
        body = <PrintColumnChart bars={s.bins.map((b) => ({ label: b.x1 - b.x0 <= 1 && Number.isInteger(b.x0) ? String(b.x0) : `${b.x0}–${b.x1}`, count: b.count }))} label={q.title} yTitle={t("respondentsAxis")} rtl={rtl} />;
      }
      notes.push(stats);
      if (s.nps?.score !== null && s.nps) notes.push(t("nps", { score: s.nps.score!, promoters: s.nps.promoters, passives: s.nps.passives, detractors: s.nps.detractors }));
      break;
    }
    case "matrix": {
      if (!s.multiple && s.columns.length >= 2) {
        body = <PrintStackedChart rows={s.rows.map((r) => ({ label: r.label, percents: r.percents }))} columns={s.columns} colors={divergingColors(s.columns.length)} label={q.title} rtl={rtl} />;
      } else {
        body = (
          <table className="print-table">
            <thead>
              <tr>
                <th />
                {s.columns.map((c) => (
                  <th key={c} className="num">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {s.rows.map((r) => (
                <tr key={r.label}>
                  <td>{r.label}</td>
                  {r.counts.map((n, i) => (
                    <td key={i} className="num">
                      {n} ({Math.round(r.percents[i] ?? 0)}%)
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        );
      }
      break;
    }
    case "ranking":
      body = <PrintBarChart rows={s.items.map((it) => ({ label: it.label, count: 0, percent: it.firstPercent }))} valueLabel={(r) => t("rankedFirst", { p: Math.round(r.percent) })} label={q.title} rtl={rtl} />;
      notes.push(t("ranking", { items: s.items.map((it) => `${it.label} ${num(it.meanRank)}`).join("; ") }));
      break;
    case "date":
      body = s.byMonth.length ? <PrintColumnChart bars={s.byMonth.map((m) => ({ label: m.month, count: m.count }))} label={q.title} yTitle={t("respondentsAxis")} rtl={rtl} /> : null;
      break;
    case "text":
      body = (
        <>
          {s.words.length > 0 && (
            <table className="print-table print-table-narrow">
              <thead>
                <tr>
                  <th>{t("word")}</th>
                  <th className="num">{t("mentions")}</th>
                </tr>
              </thead>
              <tbody>
                {s.words.slice(0, 10).map((w) => (
                  <tr key={w.word}>
                    <td>{w.word}</td>
                    <td className="num">{w.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {s.recent.slice(0, 3).map((r, i) => (
            <blockquote key={i} dir="auto" className="print-answer">
              “{r}”
            </blockquote>
          ))}
        </>
      );
      notes.push(t("avgWords", { n: num(s.avgWords, 0) }));
      break;
    case "files":
      notes.push(t("files", { n: s.files }));
      break;
  }

  return (
    <figure className="print-figure">
      <figcaption>
        {label && body && <span className="print-label">{label}</span>}
        <span className="print-title">
          {t("question", { n: q.number })} <bdi>{q.title}</bdi>
        </span>
      </figcaption>
      {body}
      <p className="print-note">
        <em>{t("noteLabel")}</em> {notes.join(" ")}
        {note && ` ${note}`}
      </p>
    </figure>
  );
}
