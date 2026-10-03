import { strFromU8, unzipSync } from "fflate";

export const PROPOSAL_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "text/plain": "txt",
  "text/markdown": "md",
};
export const PROPOSAL_MAX_BYTES = 20 * 1024 * 1024;
/** The most proposal text a write-up uses (about 30 pages). */
export const PROPOSAL_MAX_CHARS = 60_000;

const decodeXml = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&amp;/g, "&");

/** Paragraph text of a .docx (word/document.xml): one line per paragraph, tabs and breaks kept. */
export function docxText(data: Uint8Array): string {
  const files = unzipSync(data, { filter: (f) => f.name === "word/document.xml" });
  const xml = files["word/document.xml"];
  if (!xml) return "";
  return strFromU8(xml)
    .replace(/<w:tab\/>/g, "\t")
    .replace(/<w:br[^>]*\/>/g, "\n")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .split("\n")
    .map((l) => decodeXml(l).trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Readable text of an uploaded proposal, or null when the format needs a model to read (PDF). */
export function proposalText(kind: string, data: Uint8Array): string | null {
  let text: string | null = null;
  if (kind === "docx") text = docxText(data);
  else if (kind === "txt" || kind === "md") text = new TextDecoder().decode(data);
  return text ? text.slice(0, PROPOSAL_MAX_CHARS) : null;
}
