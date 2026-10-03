import { z } from "zod";

/**
 * Per-study data preparation, applied before any analysis or export (like an SPSS syntax
 * file or an R cleaning script, but point-and-click).
 */

const name = z.string().trim().regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/, { error: "variableName" });
const label = z.string().trim().max(200);

export const recodeSchema = z.discriminatedUnion("mode", [
  /** Collapse categories into new groups, e.g. 1–2 → "Disagree", 4–5 → "Agree". */
  z.object({
    id: z.string().min(1).max(40),
    mode: z.literal("group"),
    name,
    label,
    source: z.string().min(1),
    groups: z.array(z.object({ label: z.string().trim().min(1).max(100), values: z.array(z.number()).min(1) })).min(1).max(30),
  }),
  /** Flip a scale so high means the same thing across items (max + min − value). */
  z.object({ id: z.string().min(1).max(40), mode: z.literal("reverse"), name, label, source: z.string().min(1) }),
  /** Cut a number into ranges, e.g. age → 18–24, 25–34… Edges are lower bounds (inclusive). */
  z.object({
    id: z.string().min(1).max(40),
    mode: z.literal("bins"),
    name,
    label,
    source: z.string().min(1),
    edges: z.array(z.number()).min(1).max(30),
  }),
]);
export type Recode = z.infer<typeof recodeSchema>;

/** A scale score: the mean or sum of several items, optionally reverse-scoring some. */
export const computedSchema = z.object({
  id: z.string().min(1).max(40),
  name,
  label,
  op: z.enum(["mean", "sum"]),
  sources: z.array(z.string().min(1)).min(2).max(100),
  reverse: z.array(z.string().min(1)).default([]),
  /** Minimum answered items needed for a score (mean only). Defaults to all items. */
  minValid: z.number().int().min(1).optional(),
});
export type Computed = z.infer<typeof computedSchema>;

export const analysisSettingsSchema = z.object({
  includePartial: z.boolean().default(false),
  includeScreenedOut: z.boolean().default(false),
  /** Exclude "speeders" who finished faster than this many seconds. */
  minDurationSec: z.number().min(0).max(36000).nullable().default(null),
  excludedIds: z.array(z.string().max(64)).max(10000).default([]),
  recodes: z.array(recodeSchema).max(200).default([]),
  computed: z.array(computedSchema).max(200).default([]),
});
export type AnalysisSettings = z.infer<typeof analysisSettingsSchema>;

export const DEFAULT_SETTINGS: AnalysisSettings = analysisSettingsSchema.parse({});
