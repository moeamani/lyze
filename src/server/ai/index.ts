import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
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

/**
 * Where generated text comes from: "lyze" (Lyze AI, the server's model, no key needed), "own" (the
 * workspace's own provider and key) or "placeholder" (the built-in offline generator, Dev Mode only).
 */
export type AiMode = "lyze" | "own" | "placeholder";
export const AI_MODES: readonly AiMode[] = ["lyze", "own", "placeholder"];

/** The assistant for one request. */
export async function providerFor(userId: string, workspaceId: string, mode: AiMode): Promise<AssistProvider> {
  if (mode === "placeholder") {
    const [u] = await db.select({ devMode: users.devMode }).from(users).where(eq(users.id, userId)).limit(1);
    if (!u?.devMode) throw new AppError("forbidden");
    return builtinProvider();
  }
  const source = mode === "own" ? "own" : "lyze";
  const creds = await aiCredentials(workspaceId, source);
  if (!creds) throw new AppError("aiNotConfigured");
  return modelProvider(createLlm(creds), source === "lyze" ? "lyze" : undefined);
}

/** Without an explicit choice (scripts, tests): AI_PROVIDER=claude uses the server key; anything else stays on-device. */
export function assistProvider(): AssistProvider {
  return process.env.AI_PROVIDER === "claude" ? claudeProvider() : builtinProvider();
}
