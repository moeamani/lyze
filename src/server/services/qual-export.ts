import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/server/db";
import { codeApplications, participants, sessionParticipants, studies } from "@/server/db/schema";
import { CODE_COLOR_HEX, type CodeColor } from "@/lib/qual/codes";
import { writeProjectQdpx, type ProjectCase, type ProjectSource } from "@/lib/exports/refi";
import { toCsv } from "@/lib/exports/csv";
import { formatTimestamp } from "@/lib/interviews/time";
import { listCodes } from "./codebook";
import { listQuotes } from "./coding";
import { listDocuments, loadDocument } from "./qual-docs";
import { listMemos } from "./memos";
import { listThemes } from "./themes";

/**
 * A whole project as a REFI-QDA package: every transcript and every open-text question becomes a
 * text source (one paragraph per segment/answer), codings keep their exact positions, participants
 * become cases with their attributes, memos become notes.
 */
export async function buildProjectQdpx(workspaceId: string, projectId: string, opts: { projectName: string; userName: string; lineEndings?: "lf" | "crlf" }) {
  const [codeRows, docs, memoRows, themeRows] = await Promise.all([listCodes(workspaceId, projectId), listDocuments(workspaceId, projectId), listMemos(workspaceId, projectId), listThemes(workspaceId, projectId)]);
  const sources: ProjectSource[] = [];

  const studyRows = await db.select({ id: studies.id }).from(studies).where(eq(studies.projectId, projectId));
  const people = studyRows.length ? await db.select().from(participants).where(inArray(participants.studyId, studyRows.map((s) => s.id))) : [];

  for (const d of docs) {
    const doc = await loadDocument(workspaceId, projectId, d.ref);
    const col = doc.units[0]?.kind === "segment" ? codeApplications.segmentId : codeApplications.answerId;
    const apps = doc.units.length
      ? await db
          .select()
          .from(codeApplications)
          .where(and(inArray(col, doc.units.map((u) => u.id)), isNotNull(codeApplications.approvedAt)))
      : [];
    let text = "";
    const offset = new Map<string, number>();
    for (const u of doc.units) {
      if (text) text += "\n\n";
      const prefix = `${u.startMs !== null ? `[${formatTimestamp(u.startMs, { hours: true })}] ` : ""}${u.label ? `${u.label}: ` : ""}`;
      text += prefix;
      offset.set(u.id, text.length);
      text += u.text;
    }
    let caseId: string | null = null;
    if (d.ref.kind === "session") {
      const linked = await db.select({ id: sessionParticipants.participantId }).from(sessionParticipants).where(eq(sessionParticipants.sessionId, d.ref.sessionId));
      if (linked.length === 1) caseId = linked[0]!.id;
    }
    sources.push({
      id: d.key,
      name: `${d.studyName} · ${d.title}`.slice(0, 200),
      text,
      created: d.date ?? new Date(),
      caseId,
      description: d.ref.kind === "session" ? "Lyze session transcript" : "Lyze open-text answers",
      selections: apps.map((a) => {
        const base = offset.get((a.segmentId ?? a.answerId)!) ?? 0;
        return { codeId: a.codeId, start: base + a.start, end: base + a.end, quote: a.quote };
      }),
    });
  }

  const cases: ProjectCase[] = people.map((p) => ({ id: p.id, name: p.code, attributes: p.attributes }));
  const codeName = new Map(codeRows.map((c) => [c.id, c.name]));
  const themeName = new Map(themeRows.map((t) => [t.id, t.name]));
  const notes = [
    ...memoRows.map((m) => ({
      name: m.title || (m.targetType === "code" ? `Memo · ${codeName.get(m.targetId ?? "") ?? "code"}` : m.targetType === "theme" ? `Memo · ${themeName.get(m.targetId ?? "") ?? "theme"}` : `Memo · ${m.targetType}`),
      text: m.body,
      created: m.createdAt,
    })),
    ...themeRows
      .filter((t) => t.description)
      .map((t) => ({ name: `Theme · ${t.name}`, text: `${t.description}\n\nCodes: ${codeRows.filter((c) => c.themeId === t.id).map((c) => c.name).join(", ")}`, created: t.createdAt })),
  ];

  return writeProjectQdpx({
    projectName: opts.projectName,
    userName: opts.userName,
    lineEndings: opts.lineEndings,
    codes: codeRows.map((c) => ({ id: c.id, parentId: c.parentId, name: c.name, color: CODE_COLOR_HEX[c.color as CodeColor] ?? CODE_COLOR_HEX["1"], definition: c.definition })),
    sources,
    cases,
    notes,
    description: "Exported from Lyze: transcripts and open-text answers with their codes, participants as cases, memos and themes as notes.",
  });
}

/** The quote bank as CSV (one row per passage, codes joined). */
export async function quotesCsv(workspaceId: string, projectId: string, filter: Parameters<typeof listQuotes>[2] = {}) {
  const [quotes, codeRows] = await Promise.all([listQuotes(workspaceId, projectId, { ...filter, limit: 1000 }), listCodes(workspaceId, projectId)]);
  const name = new Map(codeRows.map((c) => [c.id, c.path.join(" › ")]));
  return toCsv(
    ["quote", "codes", "study", "source", "speaker", "participant", "time", "starred"],
    quotes.map((q) => [
      q.quote,
      q.codeIds.map((id) => name.get(id) ?? "").join("; "),
      q.studyName,
      q.source.kind === "session" ? q.source.title : "Survey answer",
      q.speaker ?? "",
      q.participantCode ?? "",
      q.source.kind === "session" && q.source.startMs !== null ? formatTimestamp(q.source.startMs) : "",
      q.starred ? "yes" : "",
    ]),
  );
}
