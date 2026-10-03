import type { StudyType } from "@/lib/studies";

export const SESSION_KINDS = ["interview", "focus_group", "field_notes", "diary"] as const;
export type SessionKind = (typeof SESSION_KINDS)[number];

export const SESSION_STATUSES = ["scheduled", "in_progress", "completed", "cancelled", "no_show"] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const TRANSCRIPT_STATUSES = ["processing", "ready", "failed"] as const;
export type TranscriptStatus = (typeof TRANSCRIPT_STATUSES)[number];

export const SPEAKER_ROLES = ["interviewer", "participant", "other"] as const;
export type SpeakerRole = (typeof SPEAKER_ROLES)[number];
export type Speaker = { name: string; role: SpeakerRole; participantId?: string | null };
export type Speakers = Record<string, Speaker>;

/** Conversations are recorded and transcribed; notes and diary entries are written. */
export function isConversation(kind: SessionKind): boolean {
  return kind === "interview" || kind === "focus_group";
}

/** Focus groups hold several participants; everything else has at most one. */
export function maxParticipants(kind: SessionKind): number {
  return kind === "focus_group" ? 12 : 1;
}

export function defaultKind(type: StudyType): SessionKind {
  switch (type) {
    case "observation":
      return "field_notes";
    case "diary":
      return "diary";
    default:
      return "interview";
  }
}

/** Kinds offered first for a study type (all kinds stay available). */
export function kindsFor(type: StudyType): SessionKind[] {
  const first = defaultKind(type);
  return [first, ...SESSION_KINDS.filter((k) => k !== first)];
}

export const QUICK_TAGS = ["quote", "pain", "idea", "follow_up", "highlight"] as const;
export type QuickTag = (typeof QUICK_TAGS)[number];

/**
 * A note may start with `#tag` to tag it while typing: "#pricing too expensive for students".
 * Tags are lowercased and limited to letters, digits, `_` and `-`.
 */
export function parseNote(raw: string): { tag: string | null; text: string } {
  const trimmed = raw.trim();
  const m = trimmed.match(/^#([\p{L}\p{N}_-]{1,40})(?:\s+|$)([\s\S]*)$/u);
  if (!m) return { tag: null, text: trimmed };
  return { tag: m[1]!.toLowerCase(), text: m[2]!.trim() };
}
