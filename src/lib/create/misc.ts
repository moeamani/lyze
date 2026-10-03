import { emptyGuide, guideDocSchema, guideQuestion, newSectionId, type GuideDoc } from "@/lib/interviews/guide";
import { parseDelimited } from "@/lib/interviews/participants";
import { toRespondent } from "./form";

// ── Interview guide ────────────────────────────────────────────────────────

export const GUIDE_CSV_EXAMPLE = `section,minutes,goal,question,probes,note
Warm-up,5,Put them at ease,Tell me a little about your mornings.,What time do you get up?|Who else is around?,
Coffee routine,10,Understand the ritual,Walk me through the last time you made coffee at home.,What did you use?|Where did you drink it?,Listen for where the pause happens
Coffee routine,,,What would your morning be like without it?,What would you miss most?,
Cutting down,8,Reasons and strategies,Have you ever tried to drink less coffee?,What made you try?|What helped?|What got in the way?,
Wrap-up,2,,Is there anything we haven't talked about that matters to you?,,Thank them and explain next steps
`;

/** Read an interview guide CSV: one row per question; rows with the same section are grouped. */
export function parseGuideCsv(input: string): { guide: GuideDoc; errors: { line: number; message: string }[] } {
  const [head, ...body] = parseDelimited(input);
  const errors: { line: number; message: string }[] = [];
  const guide = emptyGuide();
  if (!head) return { guide, errors: [{ line: 1, message: "empty" }] };
  const cols = head.map((h) => h.trim().toLowerCase());
  const at = (r: string[], n: string) => (cols.indexOf(n) >= 0 ? (r[cols.indexOf(n)] ?? "").trim() : "");
  if (!cols.includes("question")) return { guide, errors: [{ line: 1, message: "missingQuestionColumn" }] };
  body.forEach((r, i) => {
    if (r.every((c) => !c.trim())) return;
    const text = at(r, "question");
    if (!text) return void errors.push({ line: i + 2, message: "invalidRow" });
    const title = at(r, "section") || "Questions";
    let section = guide.sections.find((s) => s.title === title);
    if (!section) {
      section = { id: newSectionId(), title, minutes: 0, questions: [], ...(at(r, "goal") ? { goal: at(r, "goal") } : {}) };
      guide.sections.push(section);
    }
    const minutes = Number(at(r, "minutes"));
    if (Number.isFinite(minutes) && minutes > 0) section.minutes += Math.round(minutes);
    const note = at(r, "note");
    section.questions.push(guideQuestion(text, at(r, "probes").split("|").map((p) => p.trim()).filter(Boolean), note || undefined));
  });
  return { guide: guideDocSchema.parse(guide), errors };
}

/** The built-in guide draft: a warm-up, one section per research question, a wrap-up. */
export function draftGuide(brief: { questions: { text: string }[]; statements: { text: string }[] }): GuideDoc {
  const guide = emptyGuide();
  guide.intro = "Thanks for taking the time. There are no right or wrong answers; I'm interested in your own experience. Is it OK if I record so I can listen properly instead of taking notes?";
  guide.outro = "That's everything I wanted to ask. Is there anything we didn't cover that you think matters? Thank you, this really helps.";
  guide.sections.push({ id: newSectionId(), title: "Warm-up", minutes: 5, questions: [guideQuestion("Tell me a little about yourself and a typical day.", ["What does a normal morning look like?"])] });
  brief.questions.forEach((q, i) => {
    guide.sections.push({
      id: newSectionId(),
      title: `RQ${i + 1}`,
      goal: q.text,
      minutes: 8,
      questions: [guideQuestion(toRespondent(q.text), ["Can you tell me about a specific time?", "Why do you think that is?", "How did that feel?"])],
    });
  });
  if (brief.statements.length)
    guide.sections.push({
      id: newSectionId(),
      title: "Reactions",
      goal: "Hear their view on the project's assumptions without leading them",
      minutes: 6,
      questions: brief.statements.map((s) => guideQuestion(`Some people say: "${toRespondent(s.text).replace(/\.$/, "")}". How does that fit your experience?`, ["Can you give an example?"])),
    });
  guide.sections.push({ id: newSectionId(), title: "Wrap-up", minutes: 2, questions: [guideQuestion("Is there anything we haven't talked about that matters to you?", [])] });
  return guideDocSchema.parse(guide);
}

// ── Participants (generated test people) ───────────────────────────────────

const FIRST = ["Sara", "Omid", "Lena", "Ravi", "Maya", "Tom", "Niloufar", "Ade", "Chen", "Lucía", "Jonas", "Amira", "Kian", "Elif", "Noah", "Zahra"];
const LAST = ["Karimi", "Okafor", "Schmidt", "Rossi", "Nguyen", "Haddad", "Silva", "Novak", "Ahmadi", "Berg", "Moreau", "Tanaka"];
const AGES = ["18-24", "25-34", "35-44", "45-54", "55+"];
const SEGMENTS = ["Daily drinker", "Weekend drinker", "Cutting down"];

export const PEOPLE_CSV_EXAMPLE = `name,email,phone,id,age group,segment
Sara Karimi,sara@example.com,+1 555 0101,PANEL-001,25-34,Daily drinker
Omid Haddad,omid@example.com,,PANEL-002,35-44,Cutting down
Lena Schmidt,,,PANEL-003,18-24,Weekend drinker
`;

/** Made-up participants for trying things out; emails use example.com so nothing is ever sent to a real person. */
export function fakePeople(n: number, r: () => number) {
  return Array.from({ length: n }, (_, i) => {
    const first = FIRST[Math.floor(r() * FIRST.length)]!;
    const last = LAST[Math.floor(r() * LAST.length)]!;
    return {
      name: `${first} ${last}`,
      email: `${first}.${last}.${i + 1}@example.com`.toLowerCase(),
      attributes: { "age group": AGES[Math.floor(r() * AGES.length)]!, segment: SEGMENTS[Math.floor(r() * SEGMENTS.length)]!, test: "generated" },
    };
  });
}

// ── Codebook ────────────────────────────────────────────────────────────────

export const CODEBOOK_CSV_EXAMPLE = `code,parent,definition,color
Ritual,,Coffee as a repeated meaningful part of the day,3
Pause,Ritual,A moment of quiet or time for oneself,2
Social,Ritual,Coffee shared with others or tied to a place,5
Cost,,Price or money,4
Health & sleep,,Effects on sleep or health,6
`;

export type CodeRow = { name: string; parent: string | null; definition: string | null; color: string | null };

/** Read a codebook CSV. Parents may be listed before or after their children. */
export function parseCodebookCsv(input: string): { rows: CodeRow[]; errors: { line: number; message: string }[] } {
  const [head, ...body] = parseDelimited(input);
  const errors: { line: number; message: string }[] = [];
  if (!head) return { rows: [], errors: [{ line: 1, message: "empty" }] };
  const cols = head.map((h) => h.trim().toLowerCase());
  const nameCol = cols.findIndex((c) => c === "code" || c === "name");
  if (nameCol < 0) return { rows: [], errors: [{ line: 1, message: "missingCodeColumn" }] };
  const at = (r: string[], n: string) => (cols.indexOf(n) >= 0 ? (r[cols.indexOf(n)] ?? "").trim() : "");
  const rows: CodeRow[] = [];
  body.forEach((r, i) => {
    const name = (r[nameCol] ?? "").trim().slice(0, 80);
    if (!name) {
      if (r.some((c) => c.trim())) errors.push({ line: i + 2, message: "invalidRow" });
      return;
    }
    const color = at(r, "color");
    rows.push({ name, parent: at(r, "parent") || null, definition: at(r, "definition") || null, color: /^[1-8]$/.test(color) ? color : null });
  });
  return { rows, errors };
}
