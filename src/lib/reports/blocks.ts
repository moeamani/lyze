import { z } from "zod";

/**
 * A report is an ordered list of blocks. Data blocks (question, quote, theme, joint, writeup) hold
 * references and are rendered from live data, so a shared report stays current as coding goes on.
 */
const id = z.string().min(1).max(40);
export const blockSchema = z.discriminatedUnion("type", [
  z.object({ id, type: z.literal("heading"), text: z.string().max(300) }),
  z.object({ id, type: z.literal("text"), text: z.string().max(20_000) }),
  z.object({ id, type: z.literal("question"), studyId: id, questionId: id, note: z.string().max(2000).default("") }),
  z.object({ id, type: z.literal("quote"), codingId: id }),
  z.object({ id, type: z.literal("theme"), themeId: id }),
  z.object({ id, type: z.literal("joint") }),
  z.object({ id, type: z.literal("writeup"), writeupId: id }),
]);
export type Block = z.infer<typeof blockSchema>;
export type BlockType = Block["type"];
export const BLOCK_TYPES = ["heading", "text", "question", "quote", "theme", "joint", "writeup"] as const satisfies readonly BlockType[];
export const blocksSchema = z.array(blockSchema).max(200);

export const newBlockId = () => `blk_${Math.random().toString(36).slice(2, 10)}`;
