import { and, asc, count, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { codeApplications, codes, memos, type Code } from "@/server/db/schema";
import { canMoveUnder, CODE_COLOR_HEX, CODE_COLORS, depthOf, flattenTree, MAX_DEPTH, nameTaken, subtreeIds, type CodeColor } from "@/lib/qual/codes";
import { parseCodebook, writeCodebook } from "@/lib/exports/refi";
import { recordAudit } from "./audit";
import { AppError } from "./errors";
import { requireProject } from "./qual-docs";

export const codeInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  color: z.enum(CODE_COLORS).default("1"),
  definition: z
    .string()
    .trim()
    .max(2000)
    .transform((v) => v || null)
    .nullish(),
  parentId: z.string().max(64).nullish(),
});
export type CodeInput = z.input<typeof codeInputSchema>;

export async function listCodes(workspaceId: string, projectId: string) {
  const rows = await db.select().from(codes).where(and(eq(codes.workspaceId, workspaceId), eq(codes.projectId, projectId)));
  const counts = rows.length
    ? await db
        .select({ codeId: codeApplications.codeId, n: count() })
        .from(codeApplications)
        .where(and(eq(codeApplications.projectId, projectId), isNotNull(codeApplications.approvedAt)))
        .groupBy(codeApplications.codeId)
    : [];
  const byId = new Map(counts.map((c) => [c.codeId, c.n]));
  return flattenTree(rows).map((c) => ({ ...c, count: byId.get(c.id) ?? 0 }));
}

export type CodeRow = Awaited<ReturnType<typeof listCodes>>[number];

async function projectCodes(projectId: string) {
  return db.select().from(codes).where(eq(codes.projectId, projectId));
}

export async function getCode(projectId: string, codeId: string): Promise<Code> {
  const [row] = await db.select().from(codes).where(and(eq(codes.id, codeId), eq(codes.projectId, projectId))).limit(1);
  if (!row) throw new AppError("notFound");
  return row;
}

function checkPlacement(all: Code[], name: string, parentId: string | null, exceptId?: string) {
  if (parentId && !all.some((c) => c.id === parentId)) throw new AppError("invalid", "parent");
  if (exceptId && !canMoveUnder(all, exceptId, parentId)) throw new AppError("invalid", "cycle");
  if (depthOf(all, parentId) >= MAX_DEPTH) throw new AppError("invalid", "depth");
  if (nameTaken(all, name, parentId, exceptId)) throw new AppError("conflict");
}

export async function createCode(userId: string, workspaceId: string, projectId: string, raw: CodeInput) {
  await requireProject(userId, workspaceId, projectId, "content:analyze");
  const input = codeInputSchema.parse(raw);
  const all = await projectCodes(projectId);
  const parentId = input.parentId ?? null;
  checkPlacement(all, input.name, parentId);
  const position = Math.max(-1, ...all.filter((c) => (c.parentId ?? null) === parentId).map((c) => c.position)) + 1;
  const [row] = await db
    .insert(codes)
    .values({ workspaceId, projectId, name: input.name, color: input.color, definition: input.definition ?? null, parentId, position, createdById: userId })
    .returning();
  await recordAudit(db, { workspaceId, actorId: userId, action: "code.created", entityType: "code", entityId: row!.id, metadata: { name: input.name } });
  return row!;
}

export async function updateCode(userId: string, workspaceId: string, projectId: string, codeId: string, raw: CodeInput) {
  await requireProject(userId, workspaceId, projectId, "content:analyze");
  const input = codeInputSchema.parse(raw);
  const current = await getCode(projectId, codeId);
  const all = await projectCodes(projectId);
  const parentId = input.parentId === undefined ? current.parentId : (input.parentId ?? null);
  checkPlacement(all, input.name, parentId, codeId);
  const moved = parentId !== current.parentId;
  const position = moved ? Math.max(-1, ...all.filter((c) => (c.parentId ?? null) === parentId && c.id !== codeId).map((c) => c.position)) + 1 : current.position;
  await db.update(codes).set({ name: input.name, color: input.color, definition: input.definition ?? null, parentId, position }).where(eq(codes.id, codeId));
}

/** Move a code up or down among its siblings. */
export async function reorderCode(userId: string, workspaceId: string, projectId: string, codeId: string, direction: "up" | "down") {
  await requireProject(userId, workspaceId, projectId, "content:analyze");
  const current = await getCode(projectId, codeId);
  const siblings = (await projectCodes(projectId)).filter((c) => (c.parentId ?? null) === (current.parentId ?? null)).sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
  const i = siblings.findIndex((c) => c.id === codeId);
  const j = direction === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= siblings.length) return;
  [siblings[i], siblings[j]] = [siblings[j]!, siblings[i]!];
  await db.transaction(async (tx) => {
    for (const [position, c] of siblings.entries()) await tx.update(codes).set({ position }).where(eq(codes.id, c.id));
  });
}

/** Delete a code. Its codings go; child codes move up to its parent. */
export async function deleteCode(userId: string, workspaceId: string, projectId: string, codeId: string) {
  await requireProject(userId, workspaceId, projectId, "content:analyze");
  const current = await getCode(projectId, codeId);
  await db.transaction(async (tx) => {
    await tx.update(codes).set({ parentId: current.parentId }).where(and(eq(codes.projectId, projectId), eq(codes.parentId, codeId)));
    await tx.delete(memos).where(and(eq(memos.projectId, projectId), eq(memos.targetType, "code"), eq(memos.targetId, codeId)));
    await tx.delete(codes).where(eq(codes.id, codeId));
    await recordAudit(tx, { workspaceId, actorId: userId, action: "code.deleted", entityType: "code", entityId: codeId, metadata: { name: current.name } });
  });
}

/**
 * Merge codes into a target: their codings move over (identical passages aren't duplicated),
 * their children and memos follow, and the merged codes are removed.
 */
export async function mergeCodes(userId: string, workspaceId: string, projectId: string, sourceIds: string[], targetId: string) {
  await requireProject(userId, workspaceId, projectId, "content:analyze");
  const target = await getCode(projectId, targetId);
  const all = await projectCodes(projectId);
  const sources = [...new Set(sourceIds)].filter((id) => id !== targetId);
  if (!sources.length || sources.some((id) => !all.some((c) => c.id === id))) throw new AppError("invalid");
  // Merging a parent into its own child would orphan the child.
  if (sources.some((id) => subtreeIds(all, id).has(targetId))) throw new AppError("invalid", "cycle");
  await db.transaction(async (tx) => {
    const existing = await tx.select().from(codeApplications).where(eq(codeApplications.codeId, targetId));
    const key = (a: { segmentId: string | null; answerId: string | null; start: number; end: number }) => `${a.segmentId ?? ""}|${a.answerId ?? ""}|${a.start}|${a.end}`;
    const have = new Set(existing.map(key));
    const moving = await tx.select().from(codeApplications).where(inArray(codeApplications.codeId, sources));
    const dupes = moving.filter((a) => have.has(key(a)) || !have.add(key(a)));
    if (dupes.length) await tx.delete(codeApplications).where(inArray(codeApplications.id, dupes.map((d) => d.id)));
    await tx.update(codeApplications).set({ codeId: targetId }).where(inArray(codeApplications.codeId, sources));
    await tx.update(codes).set({ parentId: targetId }).where(and(eq(codes.projectId, projectId), inArray(codes.parentId, sources)));
    await tx.update(memos).set({ targetId }).where(and(eq(memos.projectId, projectId), eq(memos.targetType, "code"), inArray(memos.targetId, sources)));
    await tx.delete(codes).where(inArray(codes.id, sources));
    await recordAudit(tx, { workspaceId, actorId: userId, action: "code.merged", entityType: "code", entityId: targetId, metadata: { name: target.name, count: sources.length } });
  });
}

/** Split: move some of a code's passages to a new sibling code. */
export async function splitCode(userId: string, workspaceId: string, projectId: string, codeId: string, applicationIds: string[], raw: CodeInput) {
  await requireProject(userId, workspaceId, projectId, "content:analyze");
  const source = await getCode(projectId, codeId);
  if (!applicationIds.length) throw new AppError("invalid");
  const created = await createCode(userId, workspaceId, projectId, { ...raw, parentId: raw.parentId === undefined ? source.parentId : raw.parentId });
  await db
    .update(codeApplications)
    .set({ codeId: created.id })
    .where(and(eq(codeApplications.codeId, codeId), inArray(codeApplications.id, applicationIds)));
  await recordAudit(db, { workspaceId, actorId: userId, action: "code.split", entityType: "code", entityId: codeId, metadata: { name: source.name, count: applicationIds.length } });
  return created;
}

const HEX_TO_SLOT = Object.entries(CODE_COLOR_HEX).map(([slot, hex]) => ({ slot: slot as CodeColor, rgb: hexRgb(hex) }));
function hexRgb(hex: string): [number, number, number] | null {
  const m = hex.trim().match(/^#?([0-9a-f]{6})$/i);
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
/** Nearest palette slot for an imported color, so imported codebooks stay readable. */
export function nearestSlot(color: string | null, fallback: number): CodeColor {
  const rgb = color ? hexRgb(color) : null;
  if (!rgb) return CODE_COLORS[fallback % CODE_COLORS.length]!;
  let best = HEX_TO_SLOT[0]!;
  let dist = Infinity;
  for (const s of HEX_TO_SLOT) {
    const d = s.rgb!.reduce((sum, v, i) => sum + (v - rgb[i]!) ** 2, 0);
    if (d < dist) {
      dist = d;
      best = s;
    }
  }
  return best.slot;
}

/** Import a REFI-QDA codebook (.qdc or project.qde). Codes that already exist (same path) are kept. */
export async function importCodebook(userId: string, workspaceId: string, projectId: string, xml: string) {
  await requireProject(userId, workspaceId, projectId, "content:analyze");
  const parsed = parseCodebook(String(xml).slice(0, 5_000_000));
  if (!parsed.length) throw new AppError("invalid");
  if (parsed.length > 2000) throw new AppError("invalid");
  let created = 0;
  await db.transaction(async (tx) => {
    const all = await tx.select().from(codes).where(eq(codes.projectId, projectId));
    const idFor = new Map<string, string>();
    for (const [i, p] of parsed.entries()) {
      const parentId = p.parentKey ? (idFor.get(p.parentKey) ?? null) : null;
      if (depthOf(all, parentId) >= MAX_DEPTH) continue;
      const name = p.name.slice(0, 80);
      const same = all.find((c) => (c.parentId ?? null) === parentId && c.name.trim().toLowerCase() === name.trim().toLowerCase());
      if (same) {
        idFor.set(p.key, same.id);
        continue;
      }
      const position = all.filter((c) => (c.parentId ?? null) === parentId).length;
      const [row] = await tx
        .insert(codes)
        .values({ workspaceId, projectId, name, parentId, color: nearestSlot(p.color, i), definition: p.description?.slice(0, 2000) ?? null, position, createdById: userId })
        .returning();
      all.push(row!);
      idFor.set(p.key, row!.id);
      created++;
    }
    await recordAudit(tx, { workspaceId, actorId: userId, action: "codebook.imported", entityType: "project", entityId: projectId, metadata: { count: created } });
  });
  return { created, total: parsed.length };
}

export async function exportCodebook(workspaceId: string, projectId: string) {
  const rows = await listCodes(workspaceId, projectId);
  return writeCodebook(rows.map((c) => ({ id: c.id, parentId: c.parentId, name: c.name, color: CODE_COLOR_HEX[c.color as CodeColor] ?? CODE_COLOR_HEX["1"], definition: c.definition })));
}

/** Used by the theme board to keep code order inside a column compact. */
export async function nextThemePosition(themeId: string | null, projectId: string) {
  const [row] = await db
    .select({ max: sql<number>`coalesce(max(${codes.themePosition}), -1)` })
    .from(codes)
    .where(and(eq(codes.projectId, projectId), themeId ? eq(codes.themeId, themeId) : sql`${codes.themeId} is null`));
  return Number(row?.max ?? -1) + 1;
}

export async function codesByIds(projectId: string, ids: string[]) {
  if (!ids.length) return [];
  return db.select().from(codes).where(and(eq(codes.projectId, projectId), inArray(codes.id, ids))).orderBy(asc(codes.name));
}
