import { strToU8, zipSync } from "fflate";
import type { Dataset } from "@/lib/analysis/dataset";
import { valueLabel, type Variable } from "@/lib/analysis/variables";

/**
 * REFI-QDA project export (.qdpx) — the open exchange standard read by NVivo, MAXQDA,
 * ATLAS.ti, QualCoder and others (https://www.qdasoftware.org).
 *
 * Each response with open-text answers becomes a text source; each answer is a selection coded
 * with its question (like "auto-code by question" in NVivo). Every respondent is a case whose
 * variables (attributes) carry their closed-ended answers, ready for mixed-methods queries.
 *
 * Layout follows the standard and QualCoder's widely-used exporter: `project.qde` (no BOM) plus
 * a lowercase `sources/` folder of UTF-8 text files. Selection positions are Unicode code-point
 * offsets. MAXQDA expects Windows line endings in the text files, so that is an option.
 */

const BOM = "﻿";

const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");

const codePoints = (s: string) => Array.from(s).length;
const stamp = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "Z");

// Categorical palette (validated, see PLAN.md → charts) reused for code colors.
const CODE_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"];

export type QdpxOptions = {
  projectName: string;
  userName: string;
  description?: string;
  now?: Date;
  lineEndings?: "lf" | "crlf";
  /** Deterministic ids for tests. */
  uuid?: () => string;
};

export function writeQdpx(dataset: Dataset, opts: QdpxOptions): Uint8Array {
  const uuid = opts.uuid ?? (() => crypto.randomUUID());
  const now = opts.now ?? new Date();
  const userGuid = uuid();

  // Open-text variables become codes; everything closed-ended becomes case variables.
  const textVars = dataset.variables.filter((v) => v.type === "string" && v.role === "question" && v.questionType !== "date");
  const attrVars = dataset.variables.filter(
    (v) => v.role !== "meta" && !(v.type === "string" && v.questionType !== "date") && v.group === undefined,
  );
  const metaAttrs = dataset.variables.filter((v) => v.id === "meta:status" || v.id === "meta:duration" || v.id === "meta:language" || v.id === "meta:submitted");
  const caseVars = [...metaAttrs, ...attrVars];

  const codeGuid = new Map(textVars.map((v) => [v.id, uuid()]));
  const varGuid = new Map(caseVars.map((v) => [v.id, uuid()]));

  const codes = textVars
    .map((v, i) => `<Code guid="${codeGuid.get(v.id)}" name="${esc(`${v.name} ${v.label}`.slice(0, 250))}" isCodable="true" color="${CODE_COLORS[i % CODE_COLORS.length]}"><Description>${esc(v.label)}</Description></Code>`)
    .join("\n");

  const variableType = (v: Variable) => (v.type === "numeric" && !(v.categories?.length && v.measure !== "scale") ? "Float" : "Text");
  const variablesXml = caseVars
    .map((v) => `<Variable guid="${varGuid.get(v.id)}" name="${esc(v.name)}" typeOfVariable="${variableType(v)}"><Description>${esc(v.label)}</Description></Variable>`)
    .join("\n");

  const files: Record<string, Uint8Array> = {};
  const cases: string[] = [];
  const sources: string[] = [];
  let index = 0;

  for (const row of dataset.rows) {
    index++;
    const caseName = `R${String(index).padStart(4, "0")}`;
    const parts: { variable: Variable; header: string; text: string }[] = [];
    for (const v of textVars) {
      const value = row.values[v.id];
      if (typeof value === "string" && value.trim()) parts.push({ variable: v, header: `${v.name}. ${v.label}`, text: value.replace(/\r\n?/g, "\n") });
    }

    let sourceRef = "";
    if (parts.length) {
      const sourceGuid = uuid();
      const fileGuid = uuid();
      let text = "";
      const selections: string[] = [];
      for (const part of parts) {
        if (text) text += "\n\n";
        text += `${part.header}\n`;
        const start = codePoints(text);
        text += part.text;
        const end = codePoints(text);
        selections.push(
          `<PlainTextSelection guid="${uuid()}" name="${esc(part.variable.name)}" startPosition="${start}" endPosition="${end}" creatingUser="${userGuid}" creationDateTime="${stamp(now)}"><Coding guid="${uuid()}" creatingUser="${userGuid}"><CodeRef targetGUID="${codeGuid.get(part.variable.id)}"/></Coding></PlainTextSelection>`,
        );
      }
      const body = opts.lineEndings === "crlf" ? text.replace(/\n/g, "\r\n") : text;
      files[`sources/${fileGuid}.txt`] = strToU8(BOM + body);
      const created = row.meta.submittedAt ?? row.meta.startedAt;
      sources.push(
        `<TextSource guid="${sourceGuid}" name="${caseName}" plainTextPath="internal://${fileGuid}.txt" creatingUser="${userGuid}" creationDateTime="${stamp(created)}">\n<Description>Lyze response ${esc(row.id)}</Description>\n${selections.join("\n")}\n</TextSource>`,
      );
      sourceRef = `<SourceRef targetGUID="${sourceGuid}"/>`;
    }

    const values = caseVars
      .map((v) => {
        const value = row.values[v.id];
        if (value === null || value === undefined || value === "") return "";
        const type = variableType(v);
        const content = type === "Float" ? `<FloatValue>${value}</FloatValue>` : `<TextValue>${esc(typeof value === "number" ? valueLabel(v, value) : String(value))}</TextValue>`;
        return `<VariableValue><VariableRef targetGUID="${varGuid.get(v.id)}"/>${content}</VariableValue>`;
      })
      .join("");
    cases.push(`<Case guid="${uuid()}" name="${caseName}"><Description>Lyze response ${esc(row.id)}</Description>${values}${sourceRef}</Case>`);
  }

  const qde = `<?xml version="1.0" encoding="utf-8"?>
<Project xmlns="urn:QDA-XML:project:1.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" name="${esc(opts.projectName)}" origin="Lyze" creatingUserGUID="${userGuid}" creationDateTime="${stamp(now)}">
<Users><User guid="${userGuid}" name="${esc(opts.userName)}"/></Users>
${codes ? `<CodeBook><Codes>\n${codes}\n</Codes></CodeBook>` : ""}
${variablesXml ? `<Variables>\n${variablesXml}\n</Variables>` : ""}
${cases.length ? `<Cases>\n${cases.join("\n")}\n</Cases>` : ""}
${sources.length ? `<Sources>\n${sources.join("\n")}\n</Sources>` : ""}
<Description>${esc(opts.description ?? `Exported from Lyze. Each response is a case; open-text answers are coded by question.`)}</Description>
</Project>
`;
  files["project.qde"] = strToU8(qde);
  return zipSync(files, { level: 6 });
}
