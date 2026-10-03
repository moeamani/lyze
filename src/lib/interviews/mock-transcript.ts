import type { GuideDoc } from "./guide";
import { flatQuestions } from "./guide";
import type { SegmentInput } from "./transcript";

/**
 * The development transcription provider: a believable, deterministic interview built from the
 * study's guide (the interviewer asks the guide questions, the participant answers), timed to fill
 * the recording. Lets every screen be built and tested without a speech-to-text service.
 */

const FALLBACK_QUESTIONS = [
  "Could you start by telling me a bit about yourself?",
  "Walk me through the last time that happened.",
  "What was the hardest part?",
  "How did you work around it?",
  "If you could change one thing, what would it be?",
  "Is there anything else you'd like to add?",
];

const ANSWERS = [
  "Honestly, it depends on the day. On a good day it's easy, but most mornings I'm rushing and it's the first thing that gets dropped.",
  "I think the main thing is time. I never feel like I have enough of it, so I take shortcuts even when I know they're not ideal.",
  "The last time was actually just yesterday. I started, got interrupted twice, and ended up finishing it much later than I wanted.",
  "What frustrates me most is not knowing where things stand. I end up asking around or checking three different places.",
  "I tried a couple of apps for that, but they asked for too much setup. I went back to a simple list on my phone.",
  "My partner does it completely differently, which is funny, because we argue about it more than you'd think.",
  "If I'm honest, cost matters. I'd pay a little more if it saved me time, but not much more.",
  "It's become a bit of a ritual. It's the one quiet moment before everything starts.",
  "I would love it to just work without me thinking about it. Less choice, fewer steps.",
  "I hadn't really thought about it until you asked, but yes, it does affect how the rest of my day goes.",
  "There was one time it went really well — I had planned ahead the night before, which made all the difference.",
  "I guess the thing nobody tells you is how much of it is habit rather than a real decision.",
];

const PROBE_REPLIES = [
  "Mm, I'd say that's mostly about routine.",
  "Probably three or four times a week, more when work is busy.",
  "Yes, exactly. And that's when it gets stressful.",
  "Not really, no. I just accepted it at some point.",
];

/** Small deterministic PRNG so the same seed always gives the same transcript. */
function rng(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function mockTranscript({
  guide,
  durationMs,
  seed,
  participants = 1,
}: {
  guide: GuideDoc | null;
  durationMs: number | null;
  seed: string;
  participants?: number;
}): SegmentInput[] {
  const random = rng(seed);
  const pick = <T>(list: readonly T[]) => list[Math.floor(random() * list.length)]!;
  const questions = guide ? flatQuestions(guide) : [];
  const turns: { speaker: string; text: string }[] = [];
  const voices = Math.max(1, Math.min(participants, 8));
  const answerer = (i: number) => `S${2 + (i % voices)}`;

  if (guide?.intro) turns.push({ speaker: "S1", text: guide.intro });
  const asked = questions.length ? questions.map((q) => ({ text: q.text, probes: q.probes })) : FALLBACK_QUESTIONS.map((text) => ({ text, probes: [] }));
  asked.forEach((q, i) => {
    turns.push({ speaker: "S1", text: q.text });
    turns.push({ speaker: answerer(i), text: pick(ANSWERS) });
    if (voices > 1) turns.push({ speaker: answerer(i + 1), text: pick(ANSWERS) });
    const probe = q.probes[0];
    if (probe && random() < 0.7) {
      turns.push({ speaker: "S1", text: probe });
      turns.push({ speaker: answerer(i), text: pick(PROBE_REPLIES) });
    }
  });
  if (guide?.outro) turns.push({ speaker: "S1", text: guide.outro });

  // Spread the turns over the recording in proportion to how long each one is to say.
  const weights = turns.map((t) => t.text.length + 40);
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const total = durationMs && durationMs > 0 ? durationMs : totalWeight * 65;
  let at = 0;
  return turns.map((t, i) => {
    const span = Math.max(800, Math.round((weights[i]! / totalWeight) * total));
    const seg = { speaker: t.speaker, startMs: at, endMs: Math.min(total, at + span - 300), text: t.text };
    at = Math.min(total, at + span);
    return seg;
  });
}
