import type { DocxBlock } from "@/lib/docx";
import type { CodeRow } from "./misc";

const CODE_COL = /^(code|codes|code name|name|label|sub-?codes?|child code|tag|sub-?themes?|sub-?categor(y|ies))$/i;
const PARENT_COL = /^(parent|parent code|category|categories|theme|themes|group|domain|main code)$/i;
const DEF_COL = /^(definition|description|meaning|explanation|what it means|when to use|criteria|notes?)$/i;
const EXAMPLE_COL = /^(examples?|example quotes?|quotes?|illustrative quote)$/i;
const COLOR_COL = /^(colou?r)$/i;
/** Lines that describe the code above them instead of starting a new one. */
const DETAIL = /^(definition|description|meaning|examples?|example quote|inclusion( criteria)?|exclusion( criteria)?|include|exclude|when to use|when not to use|notes?)\s*[:–—-]\s*/i;
const TITLE = /\b(code ?book|coding (scheme|frame|manual|framework)|list of codes|codes)\b/i;

const clean = (s: string) => s.replace(/\s+/g, " ").trim();
const cap = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** "Name: definition", "Name – definition", "Name - definition" (dash needs spaces, so "self-care" stays whole). */
function splitDefinition(text: string): { name: string; definition: string | null } {
  const m = text.match(/^(.{1,80}?)\s*(?::|\s[–—-]\s)\s*(.+)$/);
  if (m && m[1]!.split(/\s+/).length <= 8) return { name: clean(m[1]!), definition: clean(m[2]!) };
  return { name: clean(text), definition: null };
}

function fromTable(rows: string[][]): CodeRow[] {
  const head = rows[0]!.map((c) => clean(c).toLowerCase());
  const hasHeader = head.some((c) => CODE_COL.test(c) || DEF_COL.test(c) || PARENT_COL.test(c));
  const col = (re: RegExp) => (hasHeader ? head.findIndex((c) => re.test(c)) : -1);
  let codeCol = col(CODE_COL);
  const parentCol = col(PARENT_COL);
  const defCol = hasHeader ? col(DEF_COL) : 1;
  const exCol = col(EXAMPLE_COL);
  const colorCol = col(COLOR_COL);
  // "Theme | Definition" tables: the only naming column is the code itself.
  if (codeCol < 0) codeCol = parentCol >= 0 ? parentCol : 0;
  const parentIdx = parentCol === codeCol ? -1 : parentCol;
  const out: CodeRow[] = [];
  let section: string | null = null;
  let lastParent: string | null = null;
  for (const r of rows.slice(hasHeader ? 1 : 0)) {
    const cells = r.map(clean);
    const filled = cells.filter(Boolean);
    if (!filled.length) continue;
    // A row with a single filled cell is a category heading for the rows below it.
    if (filled.length === 1 && cells.length > 1 && cells[0]) {
      section = cap(cells[0]!, 80);
      out.push({ name: section, parent: null, definition: null, color: null });
      continue;
    }
    // Merged cells repeat nothing: an empty parent cell means "same as above".
    const parentCell = parentIdx >= 0 ? cells[parentIdx] || null : null;
    if (parentCell) lastParent = cap(parentCell, 80);
    const name = cap(cells[codeCol] ?? "", 80);
    if (!name) continue;
    const parent = parentIdx >= 0 ? (parentCell ? cap(parentCell, 80) : lastParent) : section;
    const def = [defCol >= 0 ? cells[defCol] : "", exCol >= 0 && cells[exCol] ? `Example: ${cells[exCol]}` : ""].filter(Boolean).join(" ");
    const color = colorCol >= 0 && /^[1-8]$/.test(cells[colorCol] ?? "") ? cells[colorCol]! : null;
    if (parent && parent !== name && !out.some((c) => c.name === parent && !c.parent)) out.push({ name: parent, parent: null, definition: null, color: null });
    out.push({ name, parent: parent && parent !== name ? parent : null, definition: def ? cap(def, 2000) : null, color });
  }
  return out;
}

function fromOutline(blocks: Extract<DocxBlock, { type: "p" }>[]): CodeRow[] {
  const paras = blocks.filter((b) => b.text.trim());
  // Drop a document title ("Codebook", "Coding scheme for…").
  if (paras[0] && (paras[0].style === "Title" || (paras[0].heading !== null && TITLE.test(paras[0].text) && paras[0].text.length < 100))) paras.shift();
  const headingLevels = [...new Set(paras.map((p) => p.heading).filter((h): h is number => h !== null))].sort();
  const boldOnly = paras.some((p) => p.bold && p.heading === null && p.listLevel === null);
  // Depth of each code-starting paragraph: headings first, then bold lines, then list levels below them.
  const depth = (p: (typeof paras)[number]): number | null => {
    if (p.heading !== null) return headingLevels.indexOf(p.heading);
    if (p.bold && p.listLevel === null && p.text.length <= 120) return headingLevels.length;
    if (p.listLevel !== null) return headingLevels.length + (boldOnly ? 1 : 0) + p.listLevel;
    return null;
  };
  const out: CodeRow[] = [];
  let top: CodeRow | null = null;
  let current: CodeRow | null = null;
  const minDepth = Math.min(...paras.map(depth).filter((d): d is number => d !== null));
  for (const p of paras) {
    const text = clean(p.text);
    const detail = text.match(DETAIL);
    const d = depth(p);
    if (current && (detail || d === null)) {
      // Describes the code above: definition, examples, inclusion/exclusion criteria.
      const addition = detail ? `${detail[1]![0]!.toUpperCase()}${detail[1]!.slice(1).toLowerCase()}: ${text.slice(detail[0].length)}` : text;
      const plainDef = detail && /^(definition|description|meaning)$/i.test(detail[1]!);
      current.definition = cap([current.definition, plainDef ? text.slice(detail[0].length) : addition].filter(Boolean).join(" "), 2000);
      continue;
    }
    if (d === null) continue;
    const { name, definition } = splitDefinition(text);
    if (!name) continue;
    const row: CodeRow = { name: cap(name, 80), parent: null, definition: definition ? cap(definition, 2000) : null, color: null };
    // Lyze codes nest one level: anything deeper hangs off its top-level code.
    if (d === minDepth || !top) top = row;
    else row.parent = top.name;
    out.push(row);
    current = row;
  }
  return out;
}

/**
 * Read a codebook written in Word: a table (Code | Definition | Category/Parent | Example…, with or
 * without a header row) or an outline (headings or bold lines for parent codes, bullets for codes,
 * "Name: definition" or a following paragraph for the definition).
 */
export function parseCodebookDocx(blocks: DocxBlock[]): { rows: CodeRow[]; errors: { line: number; message: string }[] } {
  const tables = blocks.filter((b): b is Extract<DocxBlock, { type: "table" }> => b.type === "table" && b.rows.length > 0 && b.rows[0]!.length >= 2);
  let rows: CodeRow[] = tables.flatMap((t) => fromTable(t.rows));
  if (!rows.length) rows = fromOutline(blocks.filter((b): b is Extract<DocxBlock, { type: "p" }> => b.type === "p"));
  // One row per code name (case-insensitive), keeping the first definition found.
  const seen = new Map<string, CodeRow>();
  for (const r of rows) {
    const key = `${(r.parent ?? "").toLowerCase()}/${r.name.toLowerCase()}`;
    const prev = seen.get(key);
    if (!prev) seen.set(key, r);
    else if (!prev.definition && r.definition) prev.definition = r.definition;
  }
  const out = [...seen.values()];
  return { rows: out, errors: out.length ? [] : [{ line: 1, message: "noCodes" }] };
}

/** The same rows as a codebook CSV, for the existing import path. */
export function codeRowsToCsv(rows: CodeRow[]): string {
  const q = (s: string | null) => (s == null ? "" : /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  return ["code,parent,definition,color", ...rows.map((r) => [q(r.name), q(r.parent), q(r.definition), q(r.color)].join(","))].join("\n");
}
