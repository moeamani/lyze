/**
 * Participants move through a simple recruiting pipeline. Statuses only move forward on their own
 * (scheduling a session marks someone scheduled; completing it marks them completed); researchers
 * can set any status by hand.
 */
export const PARTICIPANT_STATUSES = ["recruited", "eligible", "ineligible", "scheduled", "completed", "withdrawn"] as const;
export type ParticipantStatus = (typeof PARTICIPANT_STATUSES)[number];

const PIPELINE: Partial<Record<ParticipantStatus, number>> = { recruited: 0, eligible: 1, scheduled: 2, completed: 3 };

/** The status after an automatic event, never moving someone backwards or out of a terminal state. */
export function advanceStatus(current: ParticipantStatus, to: "scheduled" | "completed"): ParticipantStatus {
  const from = PIPELINE[current];
  if (from === undefined) return current; // ineligible / withdrawn stay as set by a person
  return PIPELINE[to]! > from ? to : current;
}

/** Next free code: P01, P02 … P99, P100. */
export function nextParticipantCode(existing: readonly string[]): string {
  let max = 0;
  for (const code of existing) {
    const m = code.match(/^P(\d+)$/);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `P${String(max + 1).padStart(2, "0")}`;
}

export const CONSENT_METHODS = ["online", "written", "verbal"] as const;
export type ConsentMethod = (typeof CONSENT_METHODS)[number];

export type ParticipantImportRow = {
  name: string;
  email: string | null;
  phone: string | null;
  externalId: string | null;
  attributes: Record<string, string>;
};

/** RFC 4180 CSV with `,`, `;` or tab as the delimiter (auto-detected from the header line). */
export function parseDelimited(input: string): string[][] {
  const text = input.replace(/^﻿/, "");
  const header = text.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = [",", ";", "\t"].map((d) => ({ d, n: header.split(d).length })).sort((a, b) => b.n - a.n)[0]!.d;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
      continue;
    }
    if (ch === '"' && cell === "") quoted = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const HEADER_ALIASES: Record<"name" | "email" | "phone" | "externalId", string[]> = {
  name: ["name", "full name", "fullname", "participant", "participant name"],
  email: ["email", "e-mail", "email address", "mail"],
  phone: ["phone", "phone number", "mobile", "tel", "telephone"],
  externalId: ["id", "external id", "externalid", "participant id", "panel id", "respondent id"],
};
const FIRST = ["first name", "firstname", "given name"];
const LAST = ["last name", "lastname", "surname", "family name"];

/**
 * Turn a pasted spreadsheet into participants. Known columns (name, first/last name, email, phone,
 * id) are mapped; every other column becomes an attribute, e.g. age group or segment.
 */
export function parseParticipantCsv(input: string): { rows: ParticipantImportRow[]; skipped: number } {
  const [head, ...body] = parseDelimited(input);
  if (!head) return { rows: [], skipped: 0 };
  const cols = head.map((h) => h.trim().toLowerCase());
  const find = (aliases: string[]) => cols.findIndex((c) => aliases.includes(c));
  const idx = {
    name: find(HEADER_ALIASES.name),
    email: find(HEADER_ALIASES.email),
    phone: find(HEADER_ALIASES.phone),
    externalId: find(HEADER_ALIASES.externalId),
    first: find(FIRST),
    last: find(LAST),
  };
  const known = new Set(Object.values(idx).filter((i) => i >= 0));
  const rows: ParticipantImportRow[] = [];
  let skipped = 0;
  for (const r of body) {
    const get = (i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");
    const email = get(idx.email).toLowerCase();
    const name = get(idx.name) || [get(idx.first), get(idx.last)].filter(Boolean).join(" ");
    const externalId = get(idx.externalId);
    if (!name && !email && !externalId) {
      skipped++;
      continue;
    }
    const attributes: Record<string, string> = {};
    head.forEach((h, i) => {
      const v = (r[i] ?? "").trim();
      if (!known.has(i) && h.trim() && v) attributes[h.trim().slice(0, 60)] = v.slice(0, 500);
    });
    rows.push({
      name: (name || email.split("@")[0] || externalId).slice(0, 200),
      email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null,
      phone: get(idx.phone).slice(0, 40) || null,
      externalId: externalId.slice(0, 100) || null,
      attributes,
    });
  }
  return { rows, skipped };
}
