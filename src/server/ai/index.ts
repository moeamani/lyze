import "server-only";
import type { QuestionRow } from "@/lib/create/form";
import type { GuideDoc } from "@/lib/interviews/guide";
import type { WriteupContext } from "@/lib/writeup/context";
import type { CodeHint, CodingSuggestion, Unit } from "@/lib/qual/suggest";
import { builtinProvider } from "./builtin";
import { claudeProvider } from "./claude";

export type DraftBrief = { aim: string; questions: { text: string }[]; statements: { text: string; kind: string }[] };

export type ClusterResult = { label: string; description: string | null; members: number[]; representative: number };

/**
 * The research assistant. Everything it returns is a suggestion: codings are stored as pending
 * until a person accepts them, and summaries/clusters/descriptions are shown for review first.
 */
export interface AssistProvider {
  readonly name: "builtin" | "claude";
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

/** AI_PROVIDER=claude uses Claude (credentials from ANTHROPIC_API_KEY); anything else stays on-device. */
export function assistProvider(): AssistProvider {
  return process.env.AI_PROVIDER === "claude" ? claudeProvider() : builtinProvider();
}
