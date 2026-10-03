import "server-only";
import type { WriteupContext } from "@/lib/writeup/context";
import type { CodeHint, CodingSuggestion, Unit } from "@/lib/qual/suggest";
import { builtinProvider } from "./builtin";
import { claudeProvider } from "./claude";

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
  writeAnalysis(input: { context: WriteupContext; language: string; proposalPdf?: Uint8Array | null }): Promise<{ title: string; body: string }>;
}

/** AI_PROVIDER=claude uses Claude (credentials from ANTHROPIC_API_KEY); anything else stays on-device. */
export function assistProvider(): AssistProvider {
  return process.env.AI_PROVIDER === "claude" ? claudeProvider() : builtinProvider();
}
