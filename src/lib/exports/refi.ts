import { strToU8, zipSync } from "fflate";
import { BOM, codePoints, esc, stamp } from "./qdpx";

/**
 * REFI-QDA exchange for qualitative work:
 *  - `.qdc` codebooks (urn:QDA-XML:codebook:1.0) — export and import, so a codebook can move
 *    between Lyze, NVivo, ATLAS.ti, MAXQDA and QualCoder;
 *  - `.qdpx` projects with transcripts and open-text answers as text sources, the codebook,
 *    every coded passage, participants as cases (with attributes) and memos as notes.
 */

export type RefiCodeIn = { id: string; parentId: string | null; name: string; color: string; definition: string | null };

function codeXml(codes: readonly RefiCodeIn[], guid: (id: string) => string): string {
  const children = (parent: string | null): string =>
    codes
      .filter((c) => (c.parentId ?? null) === parent)
      .map((c) => {
        const inner = children(c.id);
        const desc = c.definition ? `<Description>${esc(c.definition)}</Description>` : "";
        return `<Code guid="${guid(c.id)}" name="${esc(c.name)}" isCodable="true" color="${esc(c.color)}">${desc}${inner}</Code>`;
      })
      .join("\n");
  return children(null);
}

export function writeCodebook(codes: readonly RefiCodeIn[], opts: { uuid?: () => string } = {}): string {
  const uuid = opts.uuid ?? (() => crypto.randomUUID());
  const ids = new Map(codes.map((c) => [c.id, uuid()]));
  return `<?xml version="1.0" encoding="utf-8"?>
<CodeBook xmlns="urn:QDA-XML:codebook:1.0" origin="Lyze">
<Codes>
${codeXml(codes, (id) => ids.get(id)!)}
</Codes>
</CodeBook>
`;
}

const decode = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&");

export type ParsedCode = { key: string; parentKey: string | null; name: string; color: string | null; description: string | null };

/**
 * Read the codes out of a `.qdc` codebook or a `project.qde` (only the CodeBook part is used).
 * A tiny tag scanner is enough: codes are nested <Code> elements with attributes and an optional
 * <Description>.
 */
export function parseCodebook(xml: string): ParsedCode[] {
  const book = xml.match(/<(?:\w+:)?CodeBook[\s>][\s\S]*?<\/(?:\w+:)?CodeBook>/)?.[0] ?? xml;
  const out: ParsedCode[] = [];
  const stack: ParsedCode[] = [];
  let inDescription: ParsedCode | null = null;
  let n = 0;
  const re = /<(\/?)(?:\w+:)?(Code|Description)\b([^>]*?)(\/?)>|([^<]+)/g;
  for (let m = re.exec(book); m; m = re.exec(book)) {
    const [, closing, tag, attrs = "", selfClosing, text] = m;
    if (text !== undefined) {
      if (inDescription) inDescription.description = (inDescription.description ?? "") + decode(text);
      continue;
    }
    if (tag === "Description") {
      inDescription = closing || selfClosing ? null : (stack.at(-1) ?? null);
      continue;
    }
    if (closing) {
      stack.pop();
      continue;
    }
    const attr = (name: string) => {
      const a = attrs.match(new RegExp(`\\b${name}="([^"]*)"`));
      return a ? decode(a[1]!) : null;
    };
    const code: ParsedCode = {
      key: attr("guid") ?? `code-${++n}`,
      parentKey: stack.at(-1)?.key ?? null,
      name: (attr("name") ?? "").trim() || `Code ${n}`,
      color: attr("color"),
      description: null,
    };
    out.push(code);
    if (!selfClosing) stack.push(code);
  }
  return out.map((c) => ({ ...c, description: c.description?.trim() || null }));
}

export type ProjectSource = {
  id: string;
  name: string;
  /** Plain text; selections are UTF-16 offsets into it. */
  text: string;
  created: Date;
  caseId?: string | null;
  description?: string;
  selections: { codeId: string; start: number; end: number; quote?: string }[];
};

export type ProjectCase = { id: string; name: string; description?: string; attributes: Record<string, string> };
export type ProjectNote = { name: string; text: string; created: Date };

export function writeProjectQdpx(input: {
  projectName: string;
  userName: string;
  codes: readonly RefiCodeIn[];
  sources: readonly ProjectSource[];
  cases: readonly ProjectCase[];
  notes?: readonly ProjectNote[];
  description?: string;
  now?: Date;
  lineEndings?: "lf" | "crlf";
  uuid?: () => string;
}): Uint8Array {
  const uuid = input.uuid ?? (() => crypto.randomUUID());
  const now = input.now ?? new Date();
  const user = uuid();
  const codeGuid = new Map(input.codes.map((c) => [c.id, uuid()]));
  const caseGuid = new Map(input.cases.map((c) => [c.id, uuid()]));
  const files: Record<string, Uint8Array> = {};

  const attrNames = [...new Set(input.cases.flatMap((c) => Object.keys(c.attributes)))].sort();
  const varGuid = new Map(attrNames.map((a) => [a, uuid()]));

  const sourceGuids = new Map<string, string>();
  const sources = input.sources.map((s) => {
    const guid = uuid();
    const file = uuid();
    sourceGuids.set(s.id, guid);
    const text = s.text.replace(/\r\n?/g, "\n");
    files[`sources/${file}.txt`] = strToU8(BOM + (input.lineEndings === "crlf" ? text.replace(/\n/g, "\r\n") : text));
    const selections = s.selections
      .filter((sel) => codeGuid.has(sel.codeId) && sel.end > sel.start)
      .map((sel) => {
        const start = codePoints(text.slice(0, sel.start));
        const end = codePoints(text.slice(0, sel.end));
        return `<PlainTextSelection guid="${uuid()}" name="${esc((sel.quote ?? text.slice(sel.start, sel.end)).slice(0, 60))}" startPosition="${start}" endPosition="${end}" creatingUser="${user}" creationDateTime="${stamp(now)}"><Coding guid="${uuid()}" creatingUser="${user}"><CodeRef targetGUID="${codeGuid.get(sel.codeId)}"/></Coding></PlainTextSelection>`;
      });
    return `<TextSource guid="${guid}" name="${esc(s.name)}" plainTextPath="internal://${file}.txt" creatingUser="${user}" creationDateTime="${stamp(s.created)}">${s.description ? `<Description>${esc(s.description)}</Description>` : ""}\n${selections.join("\n")}\n</TextSource>`;
  });

  const cases = input.cases.map((c) => {
    const values = attrNames
      .filter((a) => c.attributes[a])
      .map((a) => `<VariableValue><VariableRef targetGUID="${varGuid.get(a)}"/><TextValue>${esc(c.attributes[a]!)}</TextValue></VariableValue>`)
      .join("");
    const refs = input.sources
      .filter((s) => s.caseId === c.id)
      .map((s) => `<SourceRef targetGUID="${sourceGuids.get(s.id)}"/>`)
      .join("");
    return `<Case guid="${caseGuid.get(c.id)}" name="${esc(c.name)}">${c.description ? `<Description>${esc(c.description)}</Description>` : ""}${values}${refs}</Case>`;
  });

  const notes = (input.notes ?? []).map(
    (n) => `<Note guid="${uuid()}" name="${esc(n.name.slice(0, 120))}" creatingUser="${user}" creationDateTime="${stamp(n.created)}"><PlainTextContent>${esc(n.text)}</PlainTextContent></Note>`,
  );

  const qde = `<?xml version="1.0" encoding="utf-8"?>
<Project xmlns="urn:QDA-XML:project:1.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" name="${esc(input.projectName)}" origin="Lyze" creatingUserGUID="${user}" creationDateTime="${stamp(now)}">
<Users><User guid="${user}" name="${esc(input.userName)}"/></Users>
${input.codes.length ? `<CodeBook><Codes>\n${codeXml(input.codes, (id) => codeGuid.get(id)!)}\n</Codes></CodeBook>` : ""}
${attrNames.length ? `<Variables>\n${attrNames.map((a) => `<Variable guid="${varGuid.get(a)}" name="${esc(a)}" typeOfVariable="Text"/>`).join("\n")}\n</Variables>` : ""}
${cases.length ? `<Cases>\n${cases.join("\n")}\n</Cases>` : ""}
${sources.length ? `<Sources>\n${sources.join("\n")}\n</Sources>` : ""}
${notes.length ? `<Notes>\n${notes.join("\n")}\n</Notes>` : ""}
<Description>${esc(input.description ?? "Exported from Lyze.")}</Description>
</Project>
`;
  files["project.qde"] = strToU8(qde);
  return zipSync(files, { level: 6 });
}
