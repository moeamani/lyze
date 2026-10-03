import type { Answers } from "./answers";
import { evaluateGroup } from "./logic";
import type { FormDoc } from "./schema";

/** Quotas this set of answers counts toward. */
export function matchingQuotas(doc: Pick<FormDoc, "pages" | "settings">, answers: Answers): string[] {
  return doc.settings.quotas.filter((q) => evaluateGroup(q.when, doc, answers)).map((q) => q.id);
}
