import { docxText } from "@/lib/docx";

export const PROPOSAL_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "text/plain": "txt",
  "text/markdown": "md",
};
export const PROPOSAL_MAX_BYTES = 20 * 1024 * 1024;
/** The most proposal text a write-up uses (about 30 pages). */
export const PROPOSAL_MAX_CHARS = 60_000;

export { docxText };

/** Readable text of an uploaded proposal, or null when the format needs a model to read (PDF). */
export function proposalText(kind: string, data: Uint8Array): string | null {
  let text: string | null = null;
  if (kind === "docx") text = docxText(data);
  else if (kind === "txt" || kind === "md") text = new TextDecoder().decode(data);
  return text ? text.slice(0, PROPOSAL_MAX_CHARS) : null;
}
