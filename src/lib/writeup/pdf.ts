import { inflateSync, unzlibSync } from "fflate";

/**
 * A small PDF text extractor: enough for theses and proposals exported from Word, Google Docs or
 * LaTeX. It inflates Flate streams (including object streams), maps glyph codes back to text
 * through each font's ToUnicode CMap, and follows the text operators (Tj, TJ, ', ") with line breaks
 * where the text position moves down. Scanned PDFs (images only) have no text to find.
 */

const latin1 = new TextDecoder("latin1");
const toLatin1 = (u8: Uint8Array) => latin1.decode(u8);
const toBytes = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff);

type Obj = { dict: string; stream: Uint8Array | null };

function inflate(data: Uint8Array): Uint8Array | null {
  try {
    return unzlibSync(data);
  } catch {
    try {
      return inflateSync(data);
    } catch {
      return null;
    }
  }
}

function decodeStream(dict: string, raw: Uint8Array): Uint8Array | null {
  if (/\/Filter\s*(\[\s*)?\/FlateDecode\s*\]?/.test(dict)) return inflate(raw);
  if (/\/Filter/.test(dict)) return null; // images and other encodings: not text
  return raw;
}

/** All objects by number, including those packed in object streams (PDF 1.5+). */
function readObjects(src: string): Map<number, Obj> {
  const objs = new Map<number, Obj>();
  const re = /(\d+)\s+\d+\s+obj\b/g;
  for (let m = re.exec(src); m; m = re.exec(src)) {
    const start = m.index + m[0].length;
    const end = src.indexOf("endobj", start);
    if (end < 0) break;
    const body = src.slice(start, end);
    const s = body.search(/\bstream\r?\n/);
    if (s >= 0) {
      const dict = body.slice(0, s);
      const dataStart = start + s + body.slice(s).match(/^stream\r?\n/)![0].length;
      const len = /\/Length\s+(\d+)(?!\s+\d+\s+R)/.exec(dict);
      const stop = len ? dataStart + Number(len[1]) : src.lastIndexOf("endstream", end);
      const decoded = decodeStream(dict, toBytes(src.slice(dataStart, Math.min(stop, end))));
      objs.set(Number(m[1]), { dict, stream: decoded });
    } else objs.set(Number(m[1]), { dict: body, stream: null });
    re.lastIndex = end;
  }
  // Unpack object streams.
  for (const o of [...objs.values()]) {
    if (!o.stream || !/\/Type\s*\/ObjStm/.test(o.dict)) continue;
    const n = Number(/\/N\s+(\d+)/.exec(o.dict)?.[1] ?? 0);
    const first = Number(/\/First\s+(\d+)/.exec(o.dict)?.[1] ?? 0);
    const text = toLatin1(o.stream);
    const head = text.slice(0, first).trim().split(/\s+/).map(Number);
    for (let i = 0; i < n; i++) {
      const num = head[i * 2]!;
      const off = first + head[i * 2 + 1]!;
      const next = i + 1 < n ? first + head[(i + 1) * 2 + 1]! : text.length;
      if (!objs.has(num)) objs.set(num, { dict: text.slice(off, next), stream: null });
    }
  }
  return objs;
}

type CMap = { map: Map<number, string>; bytes: 1 | 2 };

const hexToString = (hex: string) => {
  let out = "";
  for (let i = 0; i + 3 < hex.length + 0; i += 4) out += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16));
  return out;
};

function parseCMap(text: string): CMap {
  const map = new Map<number, string>();
  const space = /begincodespacerange\s*<([0-9a-fA-F]+)>/.exec(text);
  const bytes: 1 | 2 = space && space[1]!.length <= 2 ? 1 : 2;
  for (const block of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g))
    for (const m of block[1]!.matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]*)>/g)) map.set(parseInt(m[1]!, 16), hexToString(m[2]!.padStart(4, "0")));
  for (const block of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const m of block[1]!.matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(<[0-9a-fA-F]+>|\[[^\]]*\])/g)) {
      const lo = parseInt(m[1]!, 16);
      const hi = Math.min(parseInt(m[2]!, 16), lo + 5000);
      if (m[3]!.startsWith("[")) {
        [...m[3]!.matchAll(/<([0-9a-fA-F]+)>/g)].forEach((d, i) => map.set(lo + i, hexToString(d[1]!)));
      } else {
        const base = m[3]!.slice(1, -1);
        const last = parseInt(base.slice(-4), 16);
        for (let c = lo; c <= hi; c++) map.set(c, hexToString(base.slice(0, -4) + (last + c - lo).toString(16).padStart(4, "0")));
      }
    }
  }
  return { map, bytes };
}

/** Font resource name → CMap (when the font has a ToUnicode map). */
function fontMaps(objs: Map<number, Obj>): Map<string, CMap> {
  const byObj = new Map<number, CMap>();
  for (const [num, o] of objs) {
    const ref = /\/ToUnicode\s+(\d+)\s+\d+\s+R/.exec(o.dict);
    const cm = ref ? objs.get(Number(ref[1])) : null;
    if (cm?.stream) byObj.set(num, parseCMap(toLatin1(cm.stream)));
  }
  const names = new Map<string, CMap>();
  const addFrom = (dictText: string) => {
    for (const m of dictText.matchAll(/\/([^\s/<>[\]()]+)\s+(\d+)\s+\d+\s+R/g)) {
      const cmap = byObj.get(Number(m[2]));
      if (cmap && !names.has(m[1]!)) names.set(m[1]!, cmap);
    }
  };
  for (const o of objs.values()) {
    const inline = /\/Font\s*<<([\s\S]*?)>>/.exec(o.dict);
    if (inline) addFrom(inline[1]!);
    const ref = /\/Font\s+(\d+)\s+\d+\s+R/.exec(o.dict);
    if (ref && objs.get(Number(ref[1]))) addFrom(objs.get(Number(ref[1]))!.dict);
  }
  return names;
}

function decodeText(bytes: string, cmap: CMap | undefined): string {
  if (!cmap) return bytes;
  let out = "";
  for (let i = 0; i < bytes.length; i += cmap.bytes) {
    const code = cmap.bytes === 2 ? (bytes.charCodeAt(i) << 8) | (bytes.charCodeAt(i + 1) || 0) : bytes.charCodeAt(i);
    out += cmap.map.get(code) ?? "";
  }
  return out;
}

const ESC: Record<string, string> = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", "(": "(", ")": ")", "\\": "\\" };

/** Text from one content stream. */
function contentText(src: string, fonts: Map<string, CMap>, gapSpaces: boolean): string {
  let out = "";
  let font: CMap | undefined;
  let lastY: number | null = null;
  const stack: (string | number | { str: string } | { arr: (number | { str: string })[] })[] = [];
  const newline = () => {
    if (out && !out.endsWith("\n")) out += "\n";
  };
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i]!;
    if (c === "(") {
      let depth = 1;
      let s = "";
      i++;
      while (i < n && depth) {
        const ch = src[i]!;
        if (ch === "\\") {
          const nx = src[i + 1]!;
          if (/[0-7]/.test(nx)) {
            const oct = /^[0-7]{1,3}/.exec(src.slice(i + 1, i + 4))![0];
            s += String.fromCharCode(parseInt(oct, 8));
            i += 1 + oct.length;
            continue;
          }
          s += ESC[nx] ?? (nx === "\n" || nx === "\r" ? "" : nx);
          i += 2;
          continue;
        }
        if (ch === "(") depth++;
        if (ch === ")" && --depth === 0) break;
        s += ch;
        i++;
      }
      i++;
      stack.push({ str: s });
    } else if (c === "<" && src[i + 1] !== "<") {
      const end = src.indexOf(">", i);
      const hex = src.slice(i + 1, end).replace(/\s+/g, "");
      let s = "";
      for (let k = 0; k < hex.length; k += 2) s += String.fromCharCode(parseInt(hex.slice(k, k + 2).padEnd(2, "0"), 16));
      stack.push({ str: s });
      i = end + 1;
    } else if (c === "[") {
      stack.push("[");
      i++;
    } else if (c === "]") {
      const arr: (number | { str: string })[] = [];
      while (stack.length && stack.at(-1) !== "[") arr.unshift(stack.pop() as number | { str: string });
      stack.pop();
      stack.push({ arr });
      i++;
    } else if (/\s/.test(c)) i++;
    else if (c === "%") {
      while (i < n && src[i] !== "\n") i++;
    } else {
      const m = /^(\/[^\s/<>[\]()]*|[+-]?\d*\.?\d+|[A-Za-z'"*]+|<<|>>|[{}])/.exec(src.slice(i, i + 64));
      const tok = m ? m[0] : c;
      i += tok.length || 1;
      if (/^[+-]?\d*\.?\d+$/.test(tok)) stack.push(Number(tok));
      else if (tok.startsWith("/")) stack.push(tok);
      else {
        const args = stack.splice(0);
        switch (tok) {
          case "Tf":
            font = fonts.get(String(args[0] ?? "").slice(1));
            break;
          case "Tj":
          case "'":
          case '"': {
            if (tok !== "Tj") newline();
            const s = args.at(-1);
            if (s && typeof s === "object" && "str" in s) out += decodeText(s.str, font);
            break;
          }
          case "TJ": {
            const a = args.at(-1);
            if (a && typeof a === "object" && "arr" in a)
              for (const el of a.arr) {
                if (typeof el === "number") {
                  if (gapSpaces && el < -200 && !out.endsWith(" ")) out += " ";
                } else out += decodeText(el.str, font);
              }
            break;
          }
          case "Td":
          case "TD":
            if (Number(args[1]) !== 0) newline();
            else if (gapSpaces && Number(args[0]) > 0 && !out.endsWith(" ") && !out.endsWith("\n")) out += " ";
            break;
          case "Tm": {
            const y = Number(args[5]);
            if (lastY !== null && Math.abs(y - lastY) > 1) newline();
            else if (gapSpaces && lastY !== null && !out.endsWith(" ")) out += " ";
            lastY = y;
            break;
          }
          case "T*":
            newline();
            break;
          case "ET":
            newline();
            break;
          case "BT":
            lastY = null;
            break;
        }
      }
    }
  }
  return out;
}

export function pdfText(data: Uint8Array, maxChars = 200_000): string {
  const src = toLatin1(data);
  if (!src.startsWith("%PDF")) return "";
  const objs = readObjects(src);
  const fonts = fontMaps(objs);
  const streams: string[] = [];
  for (const [, o] of [...objs].sort((a, b) => a[0] - b[0])) {
    if (!o.stream || /\/Subtype\s*\/(Image|Type1C|CIDFontType0C|OpenType)|\/Length1|\/Type\s*\/(XRef|ObjStm|Metadata)/.test(o.dict)) continue;
    const text = toLatin1(o.stream);
    if (!/\bBT\b/.test(text) || !/T[jJ]/.test(text)) continue;
    streams.push(text);
  }
  // Fonts that draw real space glyphs don't need gaps read as spaces (that would split "Cof fee");
  // LaTeX-style output has no space glyphs, so there the gaps are the spaces.
  let parts = streams.map((t) => contentText(t, fonts, false));
  const joined = parts.join("");
  if ((joined.match(/ /g)?.length ?? 0) < joined.length / 20) parts = streams.map((t) => contentText(t, fonts, true));
  return parts
    .join("\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replace(/(\w)-\n(\w)/g, "$1$2")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, maxChars);
}
