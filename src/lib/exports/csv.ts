import type { Cell } from "./table";

function escape(cell: Cell): string {
  if (cell === null || cell === undefined) return "";
  const s = String(cell);
  // Quote when needed; neutralize spreadsheet formula injection (=, +, -, @ at the start of text).
  const safe = typeof cell === "string" && /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** RFC 4180 CSV with a UTF-8 BOM so Excel detects the encoding. */
export function toCsv(headers: string[], rows: Cell[][], { bom = true } = {}): string {
  const lines = [headers.map(escape).join(","), ...rows.map((r) => r.map(escape).join(","))];
  return (bom ? "﻿" : "") + lines.join("\r\n") + "\r\n";
}
