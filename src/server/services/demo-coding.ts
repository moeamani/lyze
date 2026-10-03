import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { answers, codeApplications, codes, memos, researchSessions, responses, segments, themes, transcripts } from "@/server/db/schema";
import { newId } from "@/lib/ids";
import type { db } from "@/server/db";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Demo coding: a small codebook, passages coded in both interviews and in the survey's open
 * answers, two themes on the board, memos, a starred quote and one pending AI suggestion.
 */
export async function seedDemoCoding(tx: Tx, { workspaceId, projectId, interviewStudyId, surveyStudyId, userId }: { workspaceId: string; projectId: string; interviewStudyId: string; surveyStudyId: string; userId: string }) {
  const id = () => newId("cod");
  const book = {
    ritual: { id: id(), name: "Ritual", color: "3", definition: "Coffee as a repeated, meaningful part of the day.", parentId: null as string | null, position: 0 },
    pause: { id: id(), name: "Pause", color: "2", definition: "Coffee as a moment of quiet or time for oneself.", parentId: "ritual", position: 0 },
    social: { id: id(), name: "Social", color: "5", definition: "Coffee shared with others, or tied to a place and its people.", parentId: "ritual", position: 1 },
    cutting: { id: id(), name: "Cutting down", color: "8", definition: "Wanting to, or trying to, drink less coffee.", parentId: null, position: 1 },
    cost: { id: id(), name: "Cost", color: "4", definition: "Price, money, or coffee being expensive.", parentId: null, position: 2 },
    health: { id: id(), name: "Health & sleep", color: "6", definition: "Effects on sleep, headaches, jitters or health.", parentId: null, position: 3 },
  };
  const t1 = newId("thm");
  const t2 = newId("thm");
  await tx.insert(themes).values([
    { id: t1, workspaceId, projectId, name: "A pause that's mine", color: "2", position: 0, createdById: userId, description: "For many, coffee is less about caffeine than about a protected moment — a few minutes before the day's demands start." },
    { id: t2, workspaceId, projectId, name: "The price of the habit", color: "8", position: 1, createdById: userId, description: null },
  ]);
  const themeOf: Record<string, string | null> = { ritual: t1, pause: t1, social: null, cutting: t2, cost: t2, health: t2 };
  await tx.insert(codes).values(
    Object.entries(book).map(([key, c], i) => ({
      id: c.id,
      workspaceId,
      projectId,
      name: c.name,
      color: c.color,
      definition: c.definition,
      parentId: c.parentId ? book[c.parentId as keyof typeof book].id : null,
      position: c.position,
      themeId: themeOf[key] ?? null,
      themePosition: i,
      createdById: userId,
    })),
  );

  // Code exact phrases in the demo transcripts.
  const segs = await tx
    .select({ id: segments.id, text: segments.text, title: researchSessions.title })
    .from(segments)
    .innerJoin(transcripts, eq(transcripts.id, segments.transcriptId))
    .innerJoin(researchSessions, eq(researchSessions.id, transcripts.sessionId))
    .where(eq(researchSessions.studyId, interviewStudyId));
  const rows: (typeof codeApplications.$inferInsert)[] = [];
  const code = (key: keyof typeof book, phrase: string, opts: { starred?: boolean; pending?: string } = {}) => {
    const s = segs.find((x) => x.text.includes(phrase));
    if (!s) return;
    const start = s.text.indexOf(phrase);
    rows.push({
      workspaceId,
      projectId,
      codeId: book[key].id,
      segmentId: s.id,
      start,
      end: start + phrase.length,
      quote: phrase,
      source: opts.pending ? "ai" : "human",
      approvedAt: opts.pending ? null : new Date(),
      reason: opts.pending ?? null,
      starred: opts.starred ?? false,
      createdById: userId,
    });
  };
  code("pause", "that's the only four minutes in the day that are mine", { starred: true });
  code("ritual", "I make a pour-over");
  code("ritual", "It's more of a ritual than about caffeine.");
  code("pause", "The coffee is the excuse for the pause, if that makes sense.");
  code("cutting", "I was at five cups and sleeping badly. I went down to three and moved the last one before noon.");
  code("health", "I was at five cups and sleeping badly.");
  code("health", "It kept telling me my sleep score was terrible. The afternoon cup was the culprit.");
  code("health", "First week was rough — headaches.");
  code("cutting", "I'd like to drink less still, but not give up the morning one.");
  code("cost", "Café coffee has gotten expensive, so I only buy one when I'm meeting someone.");
  code("social", "It's social now, not a habit.");
  code("pause", "Ten minutes where nobody needs anything from me.", { starred: true });
  code("social", "It's a tiny community.");
  code("social", "The barista knows my order");
  code("ritual", "It marks the switch from dad mode to work mode.");
  code("cutting", "I'd go decaf before I'd skip the café.", { pending: "decaf, skip" });
  code("pause", "no phones");

  // And a few survey answers.
  const open = await tx
    .select({ id: answers.id, text: answers.text })
    .from(answers)
    .innerJoin(responses, eq(responses.id, answers.responseId))
    .where(and(eq(responses.studyId, surveyStudyId), isNotNull(answers.text)));
  const coded = new Set<string>();
  const codeAnswer = (key: keyof typeof book, needle: RegExp) => {
    for (const a of open) {
      if (!a.text || !needle.test(a.text) || coded.has(`${a.id}:${key}`)) continue;
      coded.add(`${a.id}:${key}`);
      rows.push({ workspaceId, projectId, codeId: book[key].id, answerId: a.id, start: 0, end: a.text.length, quote: a.text, source: "human", approvedAt: new Date(), createdById: userId });
    }
  };
  codeAnswer("pause", /quiet|peace|before anyone|two minutes/i);
  codeAnswer("social", /friends|colleagues|partner|grandmother/i);
  codeAnswer("ritual", /ritual|sunday|moka pot/i);
  codeAnswer("cutting", /cut down|treat/i);
  codeAnswer("health", /jittery/i);
  if (rows.length) await tx.insert(codeApplications).values(rows);

  const sessionRow = await tx.select({ id: researchSessions.id }).from(researchSessions).where(and(eq(researchSessions.studyId, interviewStudyId), inArray(researchSessions.title, ["Interview · P01"]))).limit(1);
  await tx.insert(memos).values([
    { workspaceId, projectId, targetType: "project", targetId: null, title: "Working idea", body: "Coffee seems to buy time more than energy. Both interviews describe the cup as permission to pause. Check whether survey respondents who drink for 'habit' describe it the same way.", authorId: userId },
    { workspaceId, projectId, targetType: "code", targetId: book.pause.id, title: null, body: "Pause vs. Ritual: code Pause when the person talks about time for themselves; Ritual when it's about doing the same thing every day.", authorId: userId },
    ...(sessionRow[0] ? [{ workspaceId, projectId, targetType: "session" as const, targetId: sessionRow[0].id, title: null, body: "Smartwatch prompted the change — health tracking as a trigger for cutting down.", authorId: userId }] : []),
  ]);
}
