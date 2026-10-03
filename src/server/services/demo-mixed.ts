import { and, asc, eq, inArray } from "drizzle-orm";
import type { db as Db } from "@/server/db";
import { notifications, participants, projectBriefs, projectGroups, projects, responses, researchSessions } from "@/server/db/schema";
import { newId } from "@/lib/ids";

type Tx = Parameters<Parameters<typeof Db.transaction>[0]>[0];

/**
 * Phase 6 demo data: a research brief to frame the write-up, two interviewees who also answered
 * the survey (so the "People" view links sources), a project group and a few notifications.
 */
export async function seedDemoMixed(
  tx: Tx,
  ids: { workspaceId: string; slug: string; projectId: string; interviewStudyId: string; surveyStudyId: string; userId: string },
) {
  await tx.insert(projectBriefs).values({
    projectId: ids.projectId,
    workspaceId: ids.workspaceId,
    aim: "Understand what the morning coffee does for people beyond caffeine, and what would make them drink less or switch where they buy it.",
    questions: [
      { id: newId("rq"), text: "What role does the morning coffee ritual play in people's day?" },
      { id: newId("rq"), text: "Why do people try to cut down, and what helps them stick to it?" },
      { id: newId("rq"), text: "How much does price shape where and how often people buy coffee?" },
    ],
    statements: [
      { id: newId("st"), kind: "hypothesis", text: "For regular drinkers, the pause matters more than the caffeine." },
      { id: newId("st"), kind: "hypothesis", text: "Sleep and health worries are the main reason people cut down." },
      { id: newId("st"), kind: "assumption", text: "Café price rises push people to brew at home." },
    ],
  });

  // P01 and P02 also filled in the survey: link one complete response to each.
  const people = await tx
    .select({ id: participants.id, code: participants.code })
    .from(participants)
    .where(and(eq(participants.studyId, ids.interviewStudyId), inArray(participants.code, ["P01", "P02"])))
    .orderBy(asc(participants.code));
  const picks = await tx
    .select({ id: responses.id })
    .from(responses)
    .where(and(eq(responses.studyId, ids.surveyStudyId), eq(responses.status, "complete")))
    .orderBy(asc(responses.startedAt))
    .limit(people.length);
  for (const [i, p] of people.entries()) if (picks[i]) await tx.update(responses).set({ participantId: p.id }).where(eq(responses.id, picks[i]!.id));

  const [group] = await tx.insert(projectGroups).values({ workspaceId: ids.workspaceId, name: "Examples", position: 0 }).returning();
  await tx.update(projects).set({ groupId: group!.id }).where(eq(projects.id, ids.projectId));

  const [session] = await tx.select({ id: researchSessions.id, title: researchSessions.title }).from(researchSessions).where(eq(researchSessions.studyId, ids.interviewStudyId)).orderBy(asc(researchSessions.createdAt)).limit(1);
  const base = `/w/${ids.slug}/p/${ids.projectId}/s`;
  const ago = (min: number) => new Date(Date.now() - min * 60_000);
  await tx.insert(notifications).values([
    { userId: ids.userId, workspaceId: ids.workspaceId, kind: "responses", data: { count: 48, study: "Morning coffee survey" }, href: `${base}/${ids.surveyStudyId}/responses`, groupKey: `responses:${ids.surveyStudyId}`, createdAt: ago(12) },
    ...(session ? [{ userId: ids.userId, workspaceId: ids.workspaceId, kind: "transcript", data: { session: session.title, study: "Café regulars interviews" }, href: `${base}/${ids.interviewStudyId}/sessions/${session.id}`, createdAt: ago(95) }] : []),
  ]);
}
