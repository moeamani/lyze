import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { codes, memos, themes } from "@/server/db/schema";
import { CODE_COLORS } from "@/lib/qual/codes";
import { recordAudit } from "./audit";
import { AppError } from "./errors";
import { requireProject } from "./qual-docs";

export const themeInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z
    .string()
    .trim()
    .max(4000)
    .transform((v) => v || null)
    .nullish(),
  color: z.enum(CODE_COLORS).default("1"),
});
export type ThemeInput = z.input<typeof themeInputSchema>;

export async function listThemes(workspaceId: string, projectId: string) {
  return db
    .select()
    .from(themes)
    .where(and(eq(themes.workspaceId, workspaceId), eq(themes.projectId, projectId)))
    .orderBy(asc(themes.position), asc(themes.createdAt));
}

async function getTheme(projectId: string, themeId: string) {
  const [row] = await db.select().from(themes).where(and(eq(themes.id, themeId), eq(themes.projectId, projectId))).limit(1);
  if (!row) throw new AppError("notFound");
  return row;
}

export async function createTheme(userId: string, workspaceId: string, projectId: string, raw: ThemeInput) {
  await requireProject(userId, workspaceId, projectId, "content:analyze");
  const input = themeInputSchema.parse(raw);
  const existing = await listThemes(workspaceId, projectId);
  const [row] = await db
    .insert(themes)
    .values({ workspaceId, projectId, ...input, description: input.description ?? null, position: existing.length, createdById: userId })
    .returning();
  await recordAudit(db, { workspaceId, actorId: userId, action: "theme.created", entityType: "theme", entityId: row!.id, metadata: { name: input.name } });
  return row!;
}

export async function updateTheme(userId: string, workspaceId: string, projectId: string, themeId: string, raw: ThemeInput) {
  await requireProject(userId, workspaceId, projectId, "content:analyze");
  await getTheme(projectId, themeId);
  const input = themeInputSchema.parse(raw);
  await db.update(themes).set({ ...input, description: input.description ?? null }).where(eq(themes.id, themeId));
}

export async function deleteTheme(userId: string, workspaceId: string, projectId: string, themeId: string) {
  await requireProject(userId, workspaceId, projectId, "content:analyze");
  const t = await getTheme(projectId, themeId);
  await db.transaction(async (tx) => {
    await tx.delete(memos).where(and(eq(memos.projectId, projectId), eq(memos.targetType, "theme"), eq(memos.targetId, themeId)));
    await tx.delete(themes).where(eq(themes.id, themeId));
    await recordAudit(tx, { workspaceId, actorId: userId, action: "theme.deleted", entityType: "theme", entityId: themeId, metadata: { name: t.name } });
  });
}

/** New order of the board's columns. */
export async function reorderThemes(userId: string, workspaceId: string, projectId: string, ids: string[]) {
  await requireProject(userId, workspaceId, projectId, "content:analyze");
  const current = await listThemes(workspaceId, projectId);
  if (ids.length !== current.length || current.some((t) => !ids.includes(t.id))) throw new AppError("invalid");
  await db.transaction(async (tx) => {
    for (const [position, id] of ids.entries()) await tx.update(themes).set({ position }).where(eq(themes.id, id));
  });
}

/**
 * Put a code into a theme (or back to "unsorted" with null) at a position, renumbering the
 * column so cards keep a compact order.
 */
export async function placeCode(userId: string, workspaceId: string, projectId: string, codeId: string, themeId: string | null, index: number) {
  await requireProject(userId, workspaceId, projectId, "content:analyze");
  const [code] = await db.select().from(codes).where(and(eq(codes.id, codeId), eq(codes.projectId, projectId))).limit(1);
  if (!code) throw new AppError("notFound");
  if (themeId) await getTheme(projectId, themeId);
  await db.transaction(async (tx) => {
    const column = await tx
      .select({ id: codes.id })
      .from(codes)
      .where(and(eq(codes.projectId, projectId), themeId ? eq(codes.themeId, themeId) : isNull(codes.themeId)))
      .orderBy(asc(codes.themePosition), asc(codes.name));
    const order = column.map((c) => c.id).filter((id) => id !== codeId);
    order.splice(Math.max(0, Math.min(index, order.length)), 0, codeId);
    for (const [themePosition, id] of order.entries()) await tx.update(codes).set({ themeId, themePosition }).where(eq(codes.id, id));
  });
}
