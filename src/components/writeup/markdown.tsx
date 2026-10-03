import { Fragment } from "react";

/** Inline Markdown: **bold**, _italic_ / *italic*, `code`. Text only, no HTML. */
function inline(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|_[^_]+_|\*[^*]+\*)/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > last) out.push(text.slice(last, m.index));
    const s = m[0];
    const key = `${m.index}`;
    if (s.startsWith("**")) out.push(<strong key={key}>{s.slice(2, -2)}</strong>);
    else if (s.startsWith("`")) out.push(<code key={key} className="rounded bg-muted px-1 text-[0.9em]">{s.slice(1, -1)}</code>);
    else out.push(<em key={key}>{s.slice(1, -1)}</em>);
    last = m.index! + s.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** A small, safe Markdown renderer for write-ups: headings, paragraphs, quotes, lists. */
export function Markdown({ source }: { source: string }) {
  const blocks = source.replace(/\r\n/g, "\n").split(/\n{2,}/);
  return (
    <div className="grid gap-4 leading-relaxed text-pretty">
      {blocks.map((raw, i) => {
        const block = raw.trim();
        if (!block) return null;
        if (block.startsWith("### ")) return <h4 key={i} className="mt-2 text-base font-semibold">{inline(block.slice(4))}</h4>;
        if (block.startsWith("## ")) return <h3 key={i} className="mt-4 border-b pb-1 text-lg font-semibold">{inline(block.slice(3))}</h3>;
        if (block.startsWith("# ")) return <h2 key={i} className="text-xl font-semibold">{inline(block.slice(2))}</h2>;
        const lines = block.split("\n");
        if (lines.every((l) => l.startsWith(">")))
          return (
            <blockquote key={i} dir="auto" className="border-s-[3px] border-section-writeup/60 ps-4 text-[0.95rem] text-foreground/85">
              {lines.map((l, j) => <Fragment key={j}>{j > 0 && <br />}{inline(l.replace(/^>\s?/, ""))}</Fragment>)}
            </blockquote>
          );
        if (lines.every((l) => /^\s*[-*]\s+/.test(l))) return <ul key={i} className="list-disc space-y-1 ps-6">{lines.map((l, j) => <li key={j}>{inline(l.replace(/^\s*[-*]\s+/, ""))}</li>)}</ul>;
        if (lines.every((l) => /^\s*\d+[.)]\s+/.test(l))) return <ol key={i} className="list-decimal space-y-1 ps-6">{lines.map((l, j) => <li key={j}>{inline(l.replace(/^\s*\d+[.)]\s+/, ""))}</li>)}</ol>;
        return <p key={i} dir="auto">{lines.map((l, j) => <Fragment key={j}>{j > 0 && <br />}{inline(l)}</Fragment>)}</p>;
      })}
    </div>
  );
}
