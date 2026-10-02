export const STUDY_TYPES = ["survey", "interview", "mixed", "observation", "diary"] as const;
export type StudyType = (typeof STUDY_TYPES)[number];

export const STUDY_STATUSES = ["draft", "live", "closed"] as const;
export type StudyStatus = (typeof STUDY_STATUSES)[number];

export const PROJECT_COLORS = ["violet", "sky", "emerald", "amber", "rose", "slate"] as const;
export type ProjectColor = (typeof PROJECT_COLORS)[number];

/** Whether a study type collects structured form responses. */
export function collectsResponses(type: StudyType): boolean {
  return type === "survey" || type === "mixed";
}

/** Whether a study type collects sessions (interviews, notes, diary entries). */
export function collectsSessions(type: StudyType): boolean {
  return type !== "survey";
}
