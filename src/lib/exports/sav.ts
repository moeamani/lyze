import type { Dataset } from "@/lib/analysis/dataset";
import type { Value, Variable } from "@/lib/analysis/variables";

/**
 * SPSS system file (.sav) writer — uncompressed, little-endian, UTF-8.
 *
 * Writes what SPSS/PSPP/R (haven)/Python (pyreadstat) need for a ready-to-analyze file:
 * long variable names, variable labels, value labels, measurement levels, column widths and
 * real SPSS date/datetime formats. Strings are limited to 255 bytes (longer open-text answers
 * are cut there — the CSV, Excel and REFI-QDA exports keep the full text).
 */

const SYSMIS = -Number.MAX_VALUE;
const MAX_STRING = 255;
/** Seconds between the SPSS epoch (14 Oct 1582) and the Unix epoch. */
const SPSS_EPOCH_OFFSET = 12219379200;

const FORMAT = { F: 5, A: 1, DATE: 20, DATETIME: 22 } as const;
const MEASURE = { nominal: 1, ordinal: 2, scale: 3 } as const;

type Column = {
  variable: Variable;
  shortName: string;
  kind: "number" | "string" | "date" | "datetime";
  /** String width in bytes (multiple of 8 when stored). */
  width: number;
  decimals: number;
  values: Value[];
};

class Writer {
  private chunks: Uint8Array[] = [];
  private buf = new ArrayBuffer(8);
  private view = new DataView(this.buf);
  length = 0;

  bytes(b: Uint8Array) {
    this.chunks.push(b);
    this.length += b.length;
  }
  int32(n: number) {
    this.view.setInt32(0, n, true);
    this.bytes(new Uint8Array(this.buf.slice(0, 4)));
  }
  float64(n: number) {
    this.view.setFloat64(0, n, true);
    this.bytes(new Uint8Array(this.buf.slice(0, 8)));
  }
  /** Fixed-width text, space padded (or truncated at a UTF-8 boundary). */
  text(s: string, width: number) {
    const out = new Uint8Array(width).fill(0x20);
    out.set(truncateUtf8(s, width));
    this.bytes(out);
  }
  result(): Uint8Array {
    const out = new Uint8Array(this.length);
    let o = 0;
    for (const c of this.chunks) {
      out.set(c, o);
      o += c.length;
    }
    return out;
  }
}

const encoder = new TextEncoder();

function truncateUtf8(s: string, maxBytes: number): Uint8Array {
  const bytes = encoder.encode(s);
  if (bytes.length <= maxBytes) return bytes;
  let end = maxBytes;
  // Step back over continuation bytes (10xxxxxx) so a character is never cut in half.
  while (end > 0 && (bytes[end]! & 0xc0) === 0x80) end--;
  return bytes.slice(0, end);
}

const formatSpec = (type: number, width: number, decimals: number) => (type << 16) | (width << 8) | decimals;

function decimalsFor(values: Value[]): number {
  let d = 0;
  for (const v of values) {
    if (typeof v !== "number" || Number.isInteger(v)) continue;
    const s = String(v);
    const frac = s.includes("e") ? 4 : (s.split(".")[1]?.length ?? 0);
    d = Math.max(d, Math.min(frac, 4));
  }
  return d;
}

function makeShortNames(names: string[]): string[] {
  const used = new Set<string>();
  return names.map((name, i) => {
    const base = name.toUpperCase().replace(/[^A-Z0-9_]/g, "_").replace(/^[^A-Z]/, "V") || `V${i + 1}`;
    let candidate = base.slice(0, 8);
    for (let n = 1; used.has(candidate); n++) {
      const suffix = String(n);
      candidate = base.slice(0, 8 - suffix.length) + suffix;
    }
    used.add(candidate);
    return candidate;
  });
}

function toSpssSeconds(iso: string): number | null {
  const ms = Date.parse(iso.length === 10 ? `${iso}T00:00:00Z` : /[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`);
  return Number.isNaN(ms) ? null : ms / 1000 + SPSS_EPOCH_OFFSET;
}

function buildColumns(dataset: Dataset, variables: Variable[]): Column[] {
  const shortNames = makeShortNames(variables.map((v) => v.name));
  return variables.map((variable, i) => {
    const values = dataset.rows.map((r) => r.values[variable.id] ?? null);
    const isDateQuestion = variable.questionType === "date";
    const isTimestamp = variable.id === "meta:started" || variable.id === "meta:submitted";
    if (isTimestamp || (isDateQuestion && values.some((v) => typeof v === "string" && v.includes("T")))) {
      return { variable, shortName: shortNames[i]!, kind: "datetime" as const, width: 8, decimals: 0, values };
    }
    if (isDateQuestion) return { variable, shortName: shortNames[i]!, kind: "date" as const, width: 8, decimals: 0, values };
    if (variable.type === "string") {
      const longest = Math.max(1, ...values.map((v) => (typeof v === "string" ? encoder.encode(v).length : 0)));
      return { variable, shortName: shortNames[i]!, kind: "string" as const, width: Math.min(MAX_STRING, longest), decimals: 0, values };
    }
    return { variable, shortName: shortNames[i]!, kind: "number" as const, width: 8, decimals: decimalsFor(values), values };
  });
}

/** Number of 8-byte segments a column occupies in each case. */
const segments = (c: Column) => (c.kind === "string" ? Math.ceil(c.width / 8) : 1);

export function writeSav(dataset: Dataset, opts: { variables?: Variable[]; label?: string; now?: Date } = {}): Uint8Array {
  const variables = opts.variables ?? dataset.variables;
  const columns = buildColumns(dataset, variables);
  const w = new Writer();
  const now = opts.now ?? new Date();
  const nominalCaseSize = columns.reduce((a, c) => a + segments(c), 0);

  // ── File header ──
  w.text("$FL2", 4);
  w.text("@(#) SPSS DATA FILE - Lyze", 60);
  w.int32(2); // layout code
  w.int32(nominalCaseSize);
  w.int32(0); // uncompressed
  w.int32(0); // no weight variable
  w.int32(dataset.rows.length);
  w.float64(100); // compression bias
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const pad = (n: number) => String(n).padStart(2, "0");
  w.text(`${pad(now.getUTCDate())} ${months[now.getUTCMonth()]} ${pad(now.getUTCFullYear() % 100)}`, 9);
  w.text(`${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())}`, 8);
  w.text(opts.label ?? "", 64);
  w.bytes(new Uint8Array(3));

  // ── Variable records ──
  const dictIndex: number[] = []; // 1-based position of each column's first segment
  let position = 1;
  for (const c of columns) {
    dictIndex.push(position);
    const label = truncateUtf8(c.variable.label, 255);
    const fmt =
      c.kind === "string"
        ? formatSpec(FORMAT.A, c.width, 0)
        : c.kind === "date"
          ? formatSpec(FORMAT.DATE, 11, 0)
          : c.kind === "datetime"
            ? formatSpec(FORMAT.DATETIME, 20, 0)
            : formatSpec(FORMAT.F, Math.max(8, Math.min(40, 8 + c.decimals)), c.decimals);
    w.int32(2);
    w.int32(c.kind === "string" ? c.width : 0);
    w.int32(label.length ? 1 : 0);
    w.int32(0); // no missing-value codes
    w.int32(fmt);
    w.int32(fmt);
    w.text(c.shortName, 8);
    if (label.length) {
      w.int32(label.length);
      const padded = new Uint8Array(Math.ceil(label.length / 4) * 4).fill(0x20);
      padded.set(label);
      w.bytes(padded);
    }
    // Continuation records for long strings.
    for (let s = 1; s < segments(c); s++) {
      w.int32(2);
      w.int32(-1);
      w.int32(0);
      w.int32(0);
      w.int32(0);
      w.int32(0);
      w.text("", 8);
    }
    position += segments(c);
  }

  // ── Value labels (numeric variables only) ──
  columns.forEach((c, i) => {
    const cats = c.kind === "number" ? c.variable.categories : undefined;
    if (!cats?.length) return;
    w.int32(3);
    w.int32(cats.length);
    for (const cat of cats) {
      w.float64(cat.value);
      const label = truncateUtf8(cat.label, 120);
      const total = Math.ceil((label.length + 1) / 8) * 8;
      const rec = new Uint8Array(total).fill(0x20);
      rec[0] = label.length;
      rec.set(label, 1);
      w.bytes(rec);
    }
    w.int32(4);
    w.int32(1);
    w.int32(dictIndex[i]!);
  });

  // ── Extension records ──
  const ext = (subtype: number, size: number, count: number, write: () => void) => {
    w.int32(7);
    w.int32(subtype);
    w.int32(size);
    w.int32(count);
    write();
  };
  // Machine integer info: SPSS 20-style, IEEE floats, little-endian, UTF-8 (code page 65001).
  ext(3, 4, 8, () => [20, 0, 0, -1, 1, 1, 2, 65001].forEach((n) => w.int32(n)));
  ext(4, 8, 3, () => [SYSMIS, Number.MAX_VALUE, -1.7976931348623155e308].forEach((n) => w.float64(n)));
  // Display info: measurement level, column width, alignment for every variable.
  ext(11, 4, columns.length * 3, () => {
    for (const c of columns) {
      w.int32(MEASURE[c.variable.measure]);
      w.int32(c.kind === "string" ? Math.min(40, Math.max(8, c.width)) : 8);
      w.int32(c.kind === "string" ? 0 : 1);
    }
  });
  const longNames = encoder.encode(columns.map((c) => `${c.shortName}=${c.variable.name}`).join("\t"));
  ext(13, 1, longNames.length, () => w.bytes(longNames));
  const encoding = encoder.encode("UTF-8");
  ext(20, 1, encoding.length, () => w.bytes(encoding));

  // ── Dictionary terminator ──
  w.int32(999);
  w.int32(0);

  // ── Data ──
  for (let r = 0; r < dataset.rows.length; r++) {
    for (const c of columns) {
      const v = c.values[r];
      if (c.kind === "string") {
        w.text(typeof v === "string" ? v : v === null || v === undefined ? "" : String(v), segments(c) * 8);
      } else if (c.kind === "date" || c.kind === "datetime") {
        const secs = typeof v === "string" ? toSpssSeconds(v) : null;
        w.float64(secs ?? SYSMIS);
      } else {
        w.float64(typeof v === "number" && Number.isFinite(v) ? v : SYSMIS);
      }
    }
  }
  return w.result();
}
