import { beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { runMigrations } from "@/server/db/migrations";
import { studies, users } from "@/server/db/schema";
import { createWorkspace } from "@/server/services/workspaces";
import { loadStudyDataset, saveAnalysisSettings } from "@/server/services/analysis";
import { createInvite, acceptInvite } from "@/server/services/members";
import { AppError } from "@/server/services/errors";
import { summarizeQuestion } from "@/lib/analysis/summary";
import { correlation, cronbachAlpha } from "@/lib/stats/tests";
import { numericColumn } from "@/lib/analysis/dataset";
import { writeSav } from "@/lib/exports/sav";
import { newId } from "@/lib/ids";

async function demo() {
  const [user] = await db.insert(users).values({ name: "Ana", email: `ana-${newId("t")}@example.com` }).returning();
  const ws = await createWorkspace(user!.id, { name: "Analysis Lab", withDemo: true });
  const [survey] = await db.select().from(studies).where(and(eq(studies.workspaceId, ws.id), eq(studies.type, "survey")));
  return { user: user!, ws, survey: survey! };
}

beforeAll(async () => {
  await runMigrations();
});

describe("analysis service", () => {
  it("loads the demo survey into an analysis-ready dataset", async () => {
    const { ws, survey } = await demo();
    const ds = await loadStudyDataset(ws.id, survey.id);
    expect(ds.rows).toHaveLength(45);
    expect(ds.excluded.status).toBe(3);
    const cups = [...ds.questions.values()].find((q) => q.question.title.startsWith("How many cups"))!;
    const s = summarizeQuestion(cups.question, cups.number, ds.rows);
    expect(s.kind).toBe("scale");

    // The seeded patterns are real enough to analyze.
    const focus = ds.variables.find((v) => v.label.startsWith("Coffee helps"))!;
    const less = ds.variables.find((v) => v.label.startsWith("I'd like to drink less"))!;
    const cupsVar = ds.variables.find((v) => v.questionId === cups.question.id)!;
    const r = correlation(numericColumn(ds.rows, cupsVar.id), numericColumn(ds.rows, less.id))!;
    expect(r.r).toBeGreaterThan(0.3);
    expect(cronbachAlpha([numericColumn(ds.rows, focus.id), numericColumn(ds.rows, less.id)])).not.toBeNull();
    expect(writeSav(ds).length).toBeGreaterThan(1000);
  });

  it("applies saved data preparation and keeps raw access", async () => {
    const { user, ws, survey } = await demo();
    await saveAnalysisSettings(user.id, ws.id, survey.id, { minDurationSec: 20, includePartial: true });
    const ds = await loadStudyDataset(ws.id, survey.id);
    expect(ds.excluded.speeders).toBeGreaterThan(0);
    expect(ds.rows.some((r) => r.meta.status === "partial")).toBe(true);
    const raw = await loadStudyDataset(ws.id, survey.id, { raw: true });
    expect(raw.rows).toHaveLength(48);
  });

  it("lets analysts but not viewers change preparation rules", async () => {
    const { user, ws, survey } = await demo();
    const [viewer] = await db.insert(users).values({ name: "Vi", email: `vi-${newId("t")}@example.com` }).returning();
    const { invite } = await createInvite(user.id, ws.id, { email: viewer!.email!, role: "viewer" });
    await acceptInvite(viewer!.id, viewer!.email, invite.token);
    await expect(saveAnalysisSettings(viewer!.id, ws.id, survey.id, {})).rejects.toSatisfy((e: unknown) => e instanceof AppError && e.code === "forbidden");
  });

  it("rejects invalid recode names", async () => {
    const { user, ws, survey } = await demo();
    await expect(
      saveAnalysisSettings(user.id, ws.id, survey.id, { recodes: [{ id: "x", mode: "reverse", name: "1bad", label: "", source: "q" }] }),
    ).rejects.toThrow();
  });
});
