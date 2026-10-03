import { strToU8, zipSync } from "fflate";

/** A paragraph for `buildDocx`: plain text, or with a style, list level or bold. */
export type P = string | { text: string; style?: string; list?: number; bold?: boolean };
export type Table = { table: string[][] };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function para(p: P) {
  const { text, style, list, bold } = typeof p === "string" ? { text: p } : p;
  const pPr = style || list !== undefined ? `<w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ""}${list !== undefined ? `<w:numPr><w:ilvl w:val="${list}"/><w:numId w:val="1"/></w:numPr>` : ""}</w:pPr>` : "";
  const runs = text.split("\n").map((line, i) => `<w:r>${bold ? "<w:rPr><w:b/></w:rPr>" : ""}${i ? "<w:br/>" : ""}<w:t xml:space="preserve">${esc(line)}</w:t></w:r>`);
  return `<w:p>${pPr}${runs.join("")}</w:p>`;
}

/** A minimal .docx (just word/document.xml) for tests: paragraphs and tables in order. */
export function buildDocx(content: (P | Table)[]): Uint8Array {
  const body = content
    .map((c) =>
      typeof c === "object" && "table" in c
        ? `<w:tbl>${c.table.map((r) => `<w:tr>${r.map((cell) => `<w:tc>${para(cell)}</w:tc>`).join("")}</w:tr>`).join("")}</w:tbl>`
        : para(c),
    )
    .join("");
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`;
  return zipSync({ "word/document.xml": strToU8(xml) });
}
