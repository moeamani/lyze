import { eq } from "drizzle-orm";
import {
  interviewGuides,
  participants,
  researchSessions,
  segments,
  sessionNotes,
  sessionParticipants,
  transcripts,
  users,
} from "@/server/db/schema";
import { newId, newToken } from "@/lib/ids";
import { DEFAULT_CONSENT, guideTemplate } from "@/lib/interviews/guide";
import { parseTranscript } from "@/lib/interviews/transcript";
import type { Speakers } from "@/lib/interviews/sessions";
import type { db } from "@/server/db";
import { userHandle } from "@/server/db/user-handle";

/**
 * The demo interview study: a guide and consent form, five café regulars at different stages,
 * two completed interviews with transcripts and notes, one coming up, and a field-notes entry.
 * Transcripts are written as an import would arrive, so there is no recording to store.
 */

const PEOPLE = [
  { name: "Maya Chen", email: "maya.chen@example.com", status: "completed", attributes: { "Cups per day": "3", "Usually takes": "Black", "Age group": "25–34" } },
  { name: "Tom Okafor", email: "tom.okafor@example.com", status: "completed", attributes: { "Cups per day": "1", "Usually takes": "With milk", "Age group": "45–54" } },
  { name: "Lina Haddad", email: "lina.haddad@example.com", status: "scheduled", attributes: { "Cups per day": "2", "Usually takes": "Espresso drinks", "Age group": "35–44" } },
  { name: "Sam Rivera", email: "sam.rivera@example.com", status: "eligible", attributes: { "Cups per day": "4", "Usually takes": "Cold brew", "Age group": "18–24" } },
  { name: "Jo Park", email: null, status: "recruited", attributes: { "Cups per day": "0", "Age group": "55–64" } },
] as const;

const MAYA = `[00:00:04] Interviewer: Thanks for joining, Maya. Walk me through your morning, from waking up to starting work.
[00:00:12] Maya: Alarm at six-thirty, and honestly the first thing I do is put the kettle on. Before my phone, before anything.
[00:00:24] Interviewer: Where does coffee come in?
[00:00:27] Maya: Right away. I make a pour-over — it takes four minutes and that's the only four minutes in the day that are mine.
[00:00:41] Interviewer: Is it the same on weekends?
[00:00:44] Maya: Weekends are slower. Two cups, sometimes three, on the balcony. It's more of a ritual than about caffeine.
[00:01:02] Interviewer: What would your morning be like without coffee?
[00:01:06] Maya: Chaotic. I'd probably still get up, but I'd miss the pause. The coffee is the excuse for the pause, if that makes sense.
[00:01:24] Interviewer: Have you ever tried to cut down?
[00:01:27] Maya: Last spring. I was at five cups and sleeping badly. I went down to three and moved the last one before noon.
[00:01:45] Interviewer: What made you try?
[00:01:48] Maya: My smartwatch, embarrassingly. It kept telling me my sleep score was terrible. The afternoon cup was the culprit.
[00:02:06] Interviewer: How did it go?
[00:02:09] Maya: First week was rough — headaches. After that, fine. I'd like to drink less still, but not give up the morning one.
[00:02:27] Interviewer: Is there anything about coffee we haven't talked about that matters to you?
[00:02:31] Maya: Price, maybe. Café coffee has gotten expensive, so I only buy one when I'm meeting someone. It's social now, not a habit.`;

const TOM = `[00:00:03] Interviewer: Thanks, Tom. Walk me through your morning.
[00:00:08] Tom: Kids first. Breakfast, lunches, the school run. My coffee happens after I drop them off.
[00:00:19] Interviewer: Where do you get it?
[00:00:21] Tom: The café on the corner by the school. Flat white. The barista knows my order, which I like more than I should.
[00:00:35] Interviewer: Why that way?
[00:00:37] Tom: It marks the switch from dad mode to work mode. Ten minutes where nobody needs anything from me.
[00:00:52] Interviewer: What would you miss most without it?
[00:00:55] Tom: The people, honestly. It's a tiny community. I'd miss the routine more than the drink.
[00:01:10] Interviewer: Have you ever tried to cut down?
[00:01:13] Tom: Not really — I only have the one. My doctor said one is fine. I'd go decaf before I'd skip the café.
[00:01:28] Interviewer: Anything else that matters to you?
[00:01:31] Tom: That it's quiet. If they put music on loud I'd find another place.`;

function transcriptRows(text: string, codes: { interviewer: string; participant: { id: string; code: string; name: string } }) {
  const { segments: segs } = parseTranscript(text);
  const speakers: Speakers = {
    S1: { name: codes.interviewer, role: "interviewer" },
    S2: { name: codes.participant.code, role: "participant", participantId: codes.participant.id },
  };
  return {
    speakers,
    segments: segs.map((s, position) => ({ position, speaker: s.speaker === "Interviewer" ? "S1" : "S2", startMs: s.startMs, endMs: s.endMs, text: s.text })),
  };
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function seedDemoInterviews(tx: Tx, { workspaceId, studyId, userId, now = new Date() }: { workspaceId: string; studyId: string; userId: string; now?: Date }) {
  const [user] = await tx.select({ name: users.name, email: userHandle }).from(users).where(eq(users.id, userId)).limit(1);
  const interviewer = user?.name || user?.email?.split("@")[0] || "Interviewer";
  const day = 86_400_000;

  await tx.insert(interviewGuides).values({ studyId, workspaceId, doc: guideTemplate("coffee"), consent: { ...DEFAULT_CONSENT, version: 1 } });

  const people = PEOPLE.map((p, i) => ({
    id: newId("par"),
    workspaceId,
    studyId,
    code: `P${String(i + 1).padStart(2, "0")}`,
    name: p.name,
    email: p.email,
    status: p.status,
    attributes: { ...p.attributes } as Record<string, string>,
    consentToken: newToken(),
    createdById: userId,
    ...(i === 0 ? { consentAt: new Date(now.getTime() - 9 * day), consentMethod: "online" as const, consentName: p.name, consentVersion: 1 } : {}),
    ...(i === 1 ? { consentAt: new Date(now.getTime() - 6 * day), consentMethod: "verbal" as const, consentName: p.name, consentVersion: 1 } : {}),
    ...(i === 2 ? { consentSentAt: new Date(now.getTime() - day) } : {}),
    ...(i === 4 ? { notes: "Met at the café counter. Prefers a phone call — no email." } : {}),
  }));
  await tx.insert(participants).values(people);
  const [maya, tom, lina] = people;

  const at = (daysFromNow: number, hour: number) => {
    const d = new Date(now.getTime() + daysFromNow * day);
    d.setUTCHours(hour, 0, 0, 0);
    return d;
  };
  const sessions = [
    { id: newId("ses"), kind: "interview" as const, title: "Interview · P01", status: "completed" as const, scheduledAt: at(-8, 9), durationMin: 45, location: "Café Lumen, back table", startedAt: at(-8, 9), endedAt: at(-8, 10), summary: "Coffee is the excuse for a pause. Cut from five to three cups for sleep; keeps the morning ritual. Café visits are now social, not habitual (price)." },
    { id: newId("ses"), kind: "interview" as const, title: "Interview · P02", status: "completed" as const, scheduledAt: at(-5, 15), durationMin: 30, location: "https://meet.example.com/lyze-demo", startedAt: at(-5, 15), endedAt: at(-5, 16), summary: null },
    { id: newId("ses"), kind: "interview" as const, title: "Interview · P03", status: "scheduled" as const, scheduledAt: at(2, 10), durationMin: 45, location: "Café Lumen, back table", startedAt: null, endedAt: null, summary: null },
    { id: newId("ses"), kind: "field_notes" as const, title: "Morning rush at Café Lumen", status: "completed" as const, scheduledAt: at(-10, 7), durationMin: null, location: "Café Lumen", startedAt: null, endedAt: at(-10, 8), summary: null },
  ];
  await tx.insert(researchSessions).values(sessions.map((s) => ({ ...s, workspaceId, studyId, interviewerId: userId, createdById: userId })));
  await tx.insert(sessionParticipants).values([
    { sessionId: sessions[0]!.id, participantId: maya!.id },
    { sessionId: sessions[1]!.id, participantId: tom!.id },
    { sessionId: sessions[2]!.id, participantId: lina!.id },
  ]);

  const write = async (sessionId: string, provider: string, t: { speakers: Speakers; segments: { position: number; speaker: string | null; startMs: number | null; endMs: number | null; text: string }[] }) => {
    const id = newId("trn");
    await tx.insert(transcripts).values({ id, workspaceId, sessionId, provider, status: "ready", language: "en", speakers: t.speakers });
    await tx.insert(segments).values(t.segments.map((s) => ({ ...s, transcriptId: id })));
  };
  await write(sessions[0]!.id, "import", transcriptRows(MAYA, { interviewer, participant: { id: maya!.id, code: maya!.code, name: maya!.name } }));
  await write(sessions[1]!.id, "import", transcriptRows(TOM, { interviewer, participant: { id: tom!.id, code: tom!.code, name: tom!.name } }));
  await write(sessions[3]!.id, "manual", {
    speakers: { S1: { name: interviewer, role: "interviewer" } },
    segments: [
      "7:40 — queue of nine, almost everyone on their phone. Two people order without looking up; the barista starts their drinks before they reach the till.",
      "Regulars get a nod and a name. Newcomers read the menu board for a long time and most pick the first thing listed.",
      "8:05 — the school-run wave: parents with strollers, short visits, takeaway cups. The café goes quiet again by 8:20.",
    ].map((text, position) => ({ position, speaker: "S1", startMs: null, endMs: null, text })),
  });

  await tx.insert(sessionNotes).values([
    { workspaceId, sessionId: sessions[0]!.id, atMs: 30_000, tag: "quote", text: "“The only four minutes in the day that are mine.”", authorId: userId },
    { workspaceId, sessionId: sessions[0]!.id, atMs: 70_000, tag: "highlight", text: "Coffee as an excuse for a pause — echoes survey Q7 stories.", authorId: userId },
    { workspaceId, sessionId: sessions[0]!.id, atMs: 110_000, tag: "pain", text: "Afternoon cup hurt her sleep; tracked by a smartwatch.", authorId: userId },
    { workspaceId, sessionId: sessions[0]!.id, atMs: 152_000, tag: "idea", text: "Price pushes café visits from habit to social occasion.", authorId: userId },
    { workspaceId, sessionId: sessions[1]!.id, atMs: 40_000, tag: "quote", text: "“Ten minutes where nobody needs anything from me.”", authorId: userId },
    { workspaceId, sessionId: sessions[1]!.id, atMs: 58_000, tag: "follow_up", text: "Ask other parents about the café as a transition ritual.", authorId: userId },
  ]);
}
