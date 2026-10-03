import { clusterTexts, extractiveSummary } from "@/lib/qual/nlp";
import { draftFormRows } from "@/lib/create/form";
import { draftGuide } from "@/lib/create/misc";
import { composeWriteup } from "@/lib/writeup/compose";
import { draftThemeDescription, suggestCodings } from "@/lib/qual/suggest";
import type { AssistProvider } from "./index";

/** Built-in assistant: deterministic text heuristics, no network. Good enough to triage. */
export function builtinProvider(): AssistProvider {
  return {
    name: "builtin",
    async suggestCodings({ units, codes, existing }) {
      return suggestCodings(units, codes, existing);
    },
    async summarize({ paragraphs }) {
      const fromParticipants = paragraphs.filter((p) => p.who !== "interviewer").map((p) => p.text);
      return extractiveSummary(fromParticipants.length ? fromParticipants : paragraphs.map((p) => p.text), 5);
    },
    async cluster({ texts }) {
      return clusterTexts(texts).map((c) => ({ label: c.label, description: c.terms.length ? `Answers mentioning ${c.terms.join(", ")}.` : null, members: c.members, representative: c.representative }));
    },
    async draftTheme({ name, codes, quotes }) {
      return draftThemeDescription(name, codes, quotes);
    },
    async draftQuestionnaire({ brief }) {
      return draftFormRows(brief);
    },
    async draftGuide({ brief }) {
      return draftGuide(brief);
    },
    async draftCodebook({ samples }) {
      const clusters = await this.cluster({ question: "", texts: samples });
      return clusters.map((c) => ({ name: c.label, parent: null, definition: c.description ?? "" }));
    },
    async writeAnalysis({ context }) {
      return composeWriteup(context);
    },
  };
}
