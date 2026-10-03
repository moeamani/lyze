import { z } from "zod";
import { customAlphabet } from "nanoid";

/**
 * An interview guide is one JSON document, like a form: topics (sections) in order, each with a
 * goal, a time budget and questions; every question can carry follow-up probes and a note for the
 * interviewer. The consent form people sign before a session lives next to it.
 */

const id = z.string().min(1).max(64);
const text = (max: number) => z.string().max(max);

export const guideQuestionSchema = z.object({
  id,
  text: text(1000),
  probes: z.array(text(500)).max(20),
  note: text(1000).optional(),
});
export type GuideQuestion = z.infer<typeof guideQuestionSchema>;

export const guideSectionSchema = z.object({
  id,
  title: text(200),
  goal: text(500).optional(),
  minutes: z.number().int().min(0).max(600),
  questions: z.array(guideQuestionSchema).max(100),
});
export type GuideSection = z.infer<typeof guideSectionSchema>;

export const guideDocSchema = z.object({
  intro: text(4000),
  sections: z.array(guideSectionSchema).max(50),
  outro: text(4000),
});
export type GuideDoc = z.infer<typeof guideDocSchema>;

export const consentDocSchema = z.object({
  title: text(200),
  body: text(20_000),
  /** Each statement is a checkbox people must tick. */
  statements: z.array(text(500).min(1)).max(20),
  /** Bumped whenever the text changes, so every signature records what was agreed to. */
  version: z.number().int().min(1),
});
export type ConsentDoc = z.infer<typeof consentDocSchema>;

const shortId = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 10);
export const newSectionId = () => `sec_${shortId()}`;
export const newGuideQuestionId = () => `gq_${shortId()}`;

export function emptyGuide(): GuideDoc {
  return { intro: "", sections: [], outro: "" };
}

export function emptySection(title = ""): GuideSection {
  return { id: newSectionId(), title, minutes: 10, questions: [] };
}

export function guideQuestion(text: string, probes: string[] = [], note?: string): GuideQuestion {
  return { id: newGuideQuestionId(), text, probes, ...(note ? { note } : {}) };
}

export function totalMinutes(guide: GuideDoc): number {
  return guide.sections.reduce((sum, s) => sum + s.minutes, 0);
}

export function questionCount(guide: GuideDoc): number {
  return guide.sections.reduce((sum, s) => sum + s.questions.length, 0);
}

/** Questions in order, with their topic — what the live session view checks off. */
export function flatQuestions(guide: GuideDoc): (GuideQuestion & { sectionId: string; sectionTitle: string })[] {
  return guide.sections.flatMap((s) => s.questions.map((q) => ({ ...q, sectionId: s.id, sectionTitle: s.title })));
}

/**
 * Where each topic should start, in minutes from the beginning, so the live view can say
 * "you're 6 minutes behind".
 */
export function sectionSchedule(guide: GuideDoc): { id: string; startMin: number; endMin: number }[] {
  let at = 0;
  return guide.sections.map((s) => {
    const row = { id: s.id, startMin: at, endMin: at + s.minutes };
    at += s.minutes;
    return row;
  });
}

export const DEFAULT_CONSENT: Omit<ConsentDoc, "version"> = {
  title: "Consent to take part",
  body: [
    "Thank you for considering taking part in this research.",
    "We will talk for about an hour about your experiences. With your permission we will record the conversation so we can listen back and make a written transcript.",
    "Taking part is voluntary. You can skip any question, take a break or stop at any time without giving a reason.",
    "Your name and contact details are kept separately from what you say. Quotes used in reports are anonymous. Recordings are deleted when the study ends.",
    "If you have questions, ask the researcher at any time.",
  ].join("\n\n"),
  statements: [
    "I have read and understood the information above.",
    "I agree to take part and to the session being recorded.",
    "I agree that anonymous quotes may be used in reports.",
  ],
};

// ── Templates ───────────────────────────────────────────────────────────────

export const GUIDE_TEMPLATE_KEYS = ["discovery", "usability", "focusGroup", "coffee"] as const;
export type GuideTemplateKey = (typeof GUIDE_TEMPLATE_KEYS)[number];

function section(title: string, minutes: number, goal: string, questions: GuideQuestion[]): GuideSection {
  return { id: newSectionId(), title, minutes, goal, questions };
}

function discovery(): GuideDoc {
  return {
    intro:
      "Thanks for joining. I'm here to learn from you — there are no right or wrong answers. With your permission I'll record so I can focus on our conversation. Any questions before we start?",
    sections: [
      section("Warm-up", 5, "Build rapport and context.", [
        guideQuestion("Tell me a little about yourself and what a typical week looks like.", ["What takes most of your time?"]),
      ]),
      section("Current experience", 20, "Understand how they do it today.", [
        guideQuestion("Walk me through the last time you did this.", ["What happened just before?", "Who else was involved?", "What tools did you use?"]),
        guideQuestion("What was the hardest part?", ["Why was that hard?", "What did you do about it?"], "Listen for workarounds."),
        guideQuestion("How do you know when it went well?"),
      ]),
      section("Needs and ideas", 15, "Find unmet needs.", [
        guideQuestion("If you had a magic wand, what would you change?", ["Why that first?"]),
        guideQuestion("What have you tried that didn't work?"),
      ]),
      section("Wrap-up", 5, "Close warmly.", [guideQuestion("Is there anything I should have asked but didn't?")]),
    ],
    outro: "Thank you — this was really helpful. Here's what happens next…",
  };
}

function usability(): GuideDoc {
  return {
    intro: "We're testing the product, not you. Please think aloud as you go — tell me what you're looking at, what you expect and anything that surprises you.",
    sections: [
      section("Background", 5, "", [guideQuestion("How do you currently handle this kind of task?")]),
      section("Tasks", 25, "Observe, don't help.", [
        guideQuestion("Task 1: Find … and tell me when you're done.", ["What did you expect to happen?", "How confident are you that it worked?"]),
        guideQuestion("Task 2: Change … to …", ["Was anything confusing?"]),
        guideQuestion("Task 3: Share … with a colleague.", ["Where would you look first?"]),
      ]),
      section("Debrief", 10, "", [
        guideQuestion("Overall, how easy or hard was that?", ["What made it so?"]),
        guideQuestion("What's one thing you would change?"),
      ]),
    ],
    outro: "Thanks so much. Your feedback goes straight to the team.",
  };
}

function focusGroup(): GuideDoc {
  return {
    intro: "Welcome, everyone. We'd like to hear all views — please speak one at a time and feel free to disagree with each other.",
    sections: [
      section("Introductions", 10, "Everyone speaks once early.", [guideQuestion("Please introduce yourself and share one word that comes to mind when you think of the topic.")]),
      section("Experiences", 30, "", [
        guideQuestion("What are your experiences with the topic?", ["Has anyone had a different experience?", "Can you give an example?"]),
        guideQuestion("What works well today?"),
        guideQuestion("What gets in the way?", ["Who else feels this way?"]),
      ]),
      section("Priorities", 15, "Converge on what matters most.", [guideQuestion("If you could change only one thing, what would it be?", ["Let's see a show of hands."])]),
      section("Close", 5, "", [guideQuestion("Any last thoughts?")]),
    ],
    outro: "Thank you all for your time and honesty.",
  };
}

function coffee(): GuideDoc {
  return {
    intro: "Thanks for chatting about your coffee habits. I'll record so I can listen properly — is that OK?",
    sections: [
      section("Morning routine", 10, "How coffee fits into the day.", [
        guideQuestion("Walk me through your morning, from waking up to starting work.", ["Where does coffee come in?", "Is it the same on weekends?"]),
        guideQuestion("How do you usually make or get your coffee?", ["Why that way?"]),
      ]),
      section("Meaning", 10, "Why it matters.", [
        guideQuestion("What would your morning be like without coffee?", ["What would you miss most?"]),
        guideQuestion("Have you ever tried to cut down?", ["What made you try?", "How did it go?"], "Links to survey Q6."),
      ]),
      section("Wrap-up", 5, "", [guideQuestion("Is there anything about coffee we haven't talked about that matters to you?")]),
    ],
    outro: "Thank you! That was lovely.",
  };
}

export function guideTemplate(key: GuideTemplateKey): GuideDoc {
  switch (key) {
    case "discovery":
      return discovery();
    case "usability":
      return usability();
    case "focusGroup":
      return focusGroup();
    case "coffee":
      return coffee();
  }
}
