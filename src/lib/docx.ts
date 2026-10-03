import { strFromU8, unzipSync } from "fflate";

const decodeXml = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&amp;/g, "&");

function documentXml(data: Uint8Array): string {
  const files = unzipSync(data, { filter: (f) => f.name === "word/document.xml" });
  const xml = files["word/document.xml"];
  return xml ? strFromU8(xml) : "";
}

/** Text of one paragraph's XML: runs joined, tabs and line breaks kept. */
function paragraphText(xml: string): string {
  return decodeXml(
    xml
      .replace(/<w:tab\/>/g, "\t")
      .replace(/<w:br[^>]*\/>/g, "\n")
      .replace(/<w:delText[^>]*>[\s\S]*?<\/w:delText>/g, "")
      .replace(/<[^>]+>/g, ""),
  ).trimEnd();
}

/** Paragraph text of a .docx (word/document.xml): one line per paragraph, tabs and breaks kept. */
export function docxText(data: Uint8Array): string {
  const xml = documentXml(data);
  if (!xml) return "";
  return xml
    .split(/<\/w:p>/)
    .map((p) => paragraphText(p))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * The document's structure, enough to read lists and tables (e.g. a codebook): paragraphs with
 * their style, outline level (headings and list indentation) and whether they're bold, and tables
 * as rows of cell text.
 */
export type DocxBlock =
  | { type: "p"; text: string; style: string | null; heading: number | null; listLevel: number | null; bold: boolean }
  | { type: "table"; rows: string[][] };

export function docxBlocks(data: Uint8Array): DocxBlock[] {
  const xml = documentXml(data);
  const body = xml.slice(xml.indexOf("<w:body"));
  const blocks: DocxBlock[] = [];
  // Tables first (they contain paragraphs), then the paragraphs between them.
  const parts = body.split(/(<w:tbl>[\s\S]*?<\/w:tbl>)/);
  for (const part of parts) {
    if (part.startsWith("<w:tbl>")) {
      const rows = [...part.matchAll(/<w:tr[ >][\s\S]*?<\/w:tr>/g)].map((tr) =>
        [...tr[0].matchAll(/<w:tc[ >][\s\S]*?<\/w:tc>/g)].map((tc) =>
          tc[0]
            .split(/<\/w:p>/)
            .map(paragraphText)
            .filter((t) => t.trim())
            .join("\n")
            .trim(),
        ),
      );
      if (rows.length) blocks.push({ type: "table", rows });
      continue;
    }
    for (const p of part.match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? []) {
      const text = paragraphText(p).trim();
      const style = p.match(/<w:pStyle w:val="([^"]+)"/)?.[1] ?? null;
      const headingMatch = style?.match(/^(?:Heading|heading|Titre|berschrift)\s*(\d)$/) ?? (style === "Title" ? ["", "0"] : null);
      const outline = p.match(/<w:outlineLvl w:val="(\d)"/)?.[1];
      const ilvl = p.match(/<w:numPr>[\s\S]*?<w:ilvl w:val="(\d)"/)?.[1] ?? (/<w:numPr>/.test(p) ? "0" : undefined);
      const listStyle = style && /List(Bullet|Number|Paragraph)\s*(\d)?/i.exec(style);
      const runs = p.match(/<w:r[ >][\s\S]*?<\/w:r>/g) ?? [];
      const textRuns = runs.filter((r) => /<w:t[ >]/.test(r) && paragraphText(r).trim());
      const bold = textRuns.length > 0 && textRuns.every((r) => /<w:b\/>|<w:b w:val="(1|true)"\/>/.test(r));
      blocks.push({
        type: "p",
        text,
        style,
        heading: headingMatch ? Number(headingMatch[1]) : outline !== undefined ? Number(outline) + 1 : null,
        listLevel: ilvl !== undefined ? Number(ilvl) : listStyle ? Math.max(0, Number(listStyle[2] ?? 1) - 1) : null,
        bold,
      });
    }
  }
  return blocks;
}
