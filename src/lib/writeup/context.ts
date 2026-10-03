/** Everything a written analysis is allowed to draw on. Built on the server, consumed by writers. */
export type WriteupContext = {
  project: { name: string; description: string | null };
  aim: string;
  questions: { id: string; text: string }[];
  statements: { id: string; text: string; kind: "hypothesis" | "proposition" | "assumption" }[];
  /** Extracted text of the uploaded thesis or proposal (truncated), if any. */
  proposal: { name: string; text: string | null } | null;
  studies: { name: string; type: string; responses: number; sessions: number }[];
  respondents: number;
  conversations: number;
  codes: {
    name: string;
    path: string[];
    definition: string | null;
    qualPassages: number;
    qualPeople: number;
    quantPassages: number;
    quantShare: number;
    quotes: { text: string; who: string | null; source: "conversation" | "survey" }[];
  }[];
  themes: { name: string; description: string | null; codes: string[] }[];
  survey: { study: string; question: string; summary: string }[];
  memos: string[];
};
