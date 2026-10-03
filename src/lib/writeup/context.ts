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
  /** Survey questions with their numbers, for writing a results section. */
  items: {
    study: string;
    page: string;
    question: string;
    type: string;
    kind: "choice" | "multi" | "scale" | "text";
    n: number;
    total: number;
    mean: number | null;
    sd: number | null;
    /** Scale range for agreement/rating items (null for counts like "cups per day"). */
    bounds: [number, number] | null;
    categories: { label: string; count: number; percent: number }[];
    words: string[];
  }[];
  /** Survey responses started (all statuses), next to `respondents` who completed. */
  started: number;
  memos: string[];
};
