import { answers, responses } from "@/server/db/schema";
import { newId, newToken } from "@/lib/ids";
import { answerColumns, OTHER, type AnswerValue } from "@/lib/forms/answers";
import type { FormDoc, Question } from "@/lib/forms/schema";
import type { db } from "@/server/db";

/**
 * Synthetic responses for the demo survey, so a new workspace has something to analyze right
 * away. Deterministic (seeded) and shaped with real-looking patterns: heavier drinkers report
 * "energy" and "habit" and want to cut down; people who drink for taste enjoy it more.
 */

const STORIES = [
  "A slow flat white on the balcony before anyone else is awake.",
  "Espresso at the counter of the tiny café near the station, two minutes of quiet.",
  "Honestly any coffee that arrives before my first meeting.",
  "Pour-over on Sunday mornings with my partner, no phones.",
  "Cold brew in summer, walking to work along the river.",
  "The first sip after dropping the kids at school. Peace!",
  "A big mug while I plan my day. The ritual matters more than the taste.",
  "Café con leche at my grandmother's kitchen table.",
  "Black, strong, and fast. I drink it for the energy, not the flavor.",
  "Oat latte from the cart outside the library during exam season.",
  "I'm trying to cut down, so one really good cup is my treat.",
  "Moka pot coffee that reminds me of home.",
  "Shared with colleagues at 10:30 — it's our team ritual.",
  "Too much coffee makes me jittery, so I savor a small one slowly.",
  "Iced latte with friends on a Saturday afternoon.",
  "Freshly ground beans, a quiet kitchen, and the smell before the taste.",
];

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(x)));

export async function seedDemoResponses(
  tx: Pick<typeof db, "insert">,
  input: { workspaceId: string; studyId: string; formId: string; doc: FormDoc; count?: number; now?: Date },
) {
  const all = input.doc.pages.flatMap((p) => p.questions);
  const byTitle = (prefix: string) => all.find((q) => q.title.startsWith(prefix));
  const qCups = byTitle("How many cups");
  const qHow = byTitle("How do you usually");
  const qWhy = byTitle("Why do you drink");
  const qEnjoy = byTitle("How much do you enjoy");
  const qFocus = byTitle("Coffee helps me focus");
  const qLess = byTitle("I'd like to drink less");
  const qStory = byTitle("Tell us about");
  if (!qCups || !qHow || !qWhy || !qEnjoy || !qFocus || !qLess || !qStory) return;
  const opts = (q: Question) => ("options" in q.config ? (q.config.options as { id: string }[]).map((o) => o.id) : []);
  const how = opts(qHow);
  const why = opts(qWhy); // Energy, Taste, Habit, Social ritual, Focus
  const rand = rng(20261003);
  const now = input.now ?? new Date();
  const count = input.count ?? 48;

  const responseRows: (typeof responses.$inferInsert)[] = [];
  const answerRows: (typeof answers.$inferInsert)[] = [];

  for (let i = 0; i < count; i++) {
    const id = newId("rsp");
    const cups = clamp(Math.floor(rand() * 4) + (rand() < 0.3 ? 2 : 0) + (rand() < 0.08 ? -2 : 0), 0, 8);
    const forTaste = rand() < 0.45 + (cups <= 2 ? 0.2 : -0.1);
    const values: [Question, AnswerValue][] = [[qCups, cups]];
    if (cups > 0) {
      const r = rand();
      values.push([qHow, r < 0.05 ? { choice: OTHER, other: rand() < 0.5 ? "Turkish coffee" : "Filter with honey" } : { choice: how[Math.floor(r * how.length)]! }]);
      const picks = new Set<string>();
      if (rand() < 0.35 + cups * 0.1) picks.add(why[0]!);
      if (forTaste) picks.add(why[1]!);
      if (rand() < 0.2 + cups * 0.1) picks.add(why[2]!);
      if (rand() < 0.3) picks.add(why[3]!);
      if (rand() < 0.25 + cups * 0.05) picks.add(why[4]!);
      if (!picks.size) picks.add(why[1]!);
      values.push([qWhy, { choices: [...picks] }]);
      const enjoy = clamp(3 + (forTaste ? 1.2 : -0.3) + (rand() - 0.5) * 2, 1, 5);
      values.push([qEnjoy, enjoy]);
      const focus = clamp(2.4 + cups * 0.35 + (rand() - 0.5) * 2.2, 1, 5);
      values.push([qFocus, focus]);
      values.push([qLess, clamp(1.4 + cups * 0.5 + (rand() - 0.5) * 2, 1, 5)]);
      if (rand() < 0.7) values.push([qStory, STORIES[Math.floor(rand() * STORIES.length)]!]);
    }

    const partial = i % 16 === 7;
    const speeder = i % 23 === 11;
    const kept = partial ? values.slice(0, 2) : values;
    const started = new Date(now.getTime() - (count - i) * 4.7 * 3600_000 - rand() * 3600_000);
    const duration = speeder ? 6000 + Math.floor(rand() * 4000) : 40_000 + Math.floor(rand() * 260_000);
    responseRows.push({
      id,
      workspaceId: input.workspaceId,
      studyId: input.studyId,
      formId: input.formId,
      formVersion: 1,
      status: partial ? "partial" : "complete",
      resumeToken: newToken(),
      locale: "en",
      startedAt: started,
      submittedAt: partial ? null : new Date(started.getTime() + duration),
      durationMs: partial ? null : duration,
      meta: { userAgent: "Lyze demo data" },
    });
    for (const [q, value] of kept) answerRows.push({ responseId: id, questionId: q.id, value, ...answerColumns(q, value) });
  }

  await tx.insert(responses).values(responseRows);
  if (answerRows.length) await tx.insert(answers).values(answerRows);
}
