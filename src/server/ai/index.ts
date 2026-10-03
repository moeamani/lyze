import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { memberships } from "@/server/db/schema";
import type { Role } from "@/lib/permissions";
import { AppError } from "@/server/services/errors";
import { aiCredentials } from "@/server/services/ai-settings";
import type { QuestionRow } from "@/lib/create/form";
import type { GuideDoc } from "@/lib/interviews/guide";
import type { WriteupContext } from "@/lib/writeup/context";
import type { CodeHint, CodingSuggestion, Unit } from "@/lib/qual/suggest";
import { builtinProvider } from "./builtin";
import { claudeProvider, modelProvider } from "./claude";
import { createLlm } from "./llm";

export type DraftBrief = { aim: string; questions: { text: string }[]; statements: { text: string; kind: string }[] };

export type ClusterResult = { label: string; description: string | null; members: number[]; representative: number };

/**
 * The research assistant. Everything it returns is a suggestion: codings are stored as pending
 * until a person accepts them, and summaries/clusters/descriptions are shown for review first.
 */
export interface AssistProvider {
  /** "builtin", or the provider id ("claude" for Anthropic, "gemini", "groq"…). */
  readonly name: string;
  suggestCodings(input: { units: Unit[]; codes: CodeHint[]; existing: ReadonlySet<string> }): Promise<CodingSuggestion[]>;
  summarize(input: { title: string; paragraphs: { who: string; text: string }[] }): Promise<string[]>;
  cluster(input: { question: string; texts: string[] }): Promise<ClusterResult[]>;
  draftTheme(input: { name: string; codes: { name: string; definition: string | null; count: number }[]; quotes: string[] }): Promise<string>;
  /** A written analysis of the project in Markdown, framed by the brief. Always a draft for review. */
  /** Questionnaire rows drafted from the brief (and proposal). */
  draftQuestionnaire(input: { brief: DraftBrief; proposal: string | null; language: string }): Promise<QuestionRow[]>;
  /** An interview guide drafted from the brief (and proposal). */
  draftGuide(input: { brief: DraftBrief; proposal: string | null; language: string }): Promise<GuideDoc>;
  /** A starting codebook from the brief and a sample of the project's text. */
  draftCodebook(input: { brief: DraftBrief; samples: string[]; language: string }): Promise<{ name: string; parent: string | null; definition: string }[]>;
  writeAnalysis(input: { context: WriteupContext; language: string; proposalPdf?: Uint8Array | null }): Promise<{ title: string; body: string }>;
}

export type AiMode = "ai" | "placeholder";

/**
 * Placeholder (the built-in, offline writer and heuristics) is a tool for workspace owners and
 * developers: it fills screens without spending tokens. Everyone else gets real AI.
 */
export function canUsePlaceholder(role: Role | null | undefined) {
  return role === "owner" || process.env.NODE_ENV !== "production" || process.env.LYZE_DEV_TOOLS === "1";
}

/** The assistant for one request: the workspace's AI provider ("ai"), or the built-in placeholder. */
export async function providerFor(userId: string, workspaceId: string, mode: AiMode): Promise<AssistProvider> {
  const role = await roleIn(userId, workspaceId);
  if (mode === "placeholder") {
    if (!canUsePlaceholder(role)) throw new AppError("forbidden");
    return builtinProvider();
  }
  const creds = await aiCredentials(workspaceId);
  if (!creds) throw new AppError("aiNotConfigured");
  return modelProvider(createLlm(creds));
}

/** Without an explicit choice (scripts, tests): AI_PROVIDER=claude uses the server key; anything else stays on-device. */
export function assistProvider(): AssistProvider {
  return process.env.AI_PROVIDER === "claude" ? claudeProvider() : builtinProvider();
}

async function roleIn(userId: string, workspaceId: string): Promise<Role | null> {
  const [m] = await db.select({ role: memberships.role }).from(memberships).where(and(eq(memberships.userId, userId), eq(memberships.workspaceId, workspaceId))).limit(1);
  return m?.role ?? null;
}
