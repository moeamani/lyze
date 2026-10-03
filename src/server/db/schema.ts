import {
  type AnyPgColumn,
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { newId } from "@/lib/ids";
import { ROLES } from "@/lib/permissions";
import { STUDY_STATUSES, STUDY_TYPES } from "@/lib/studies";
import type { FormDoc } from "@/lib/forms/schema";
import type { AnswerValue } from "@/lib/forms/answers";
import type { AnalysisSettings } from "@/lib/analysis/settings";
import type { ConsentDoc, GuideDoc } from "@/lib/interviews/guide";
import { PARTICIPANT_STATUSES, CONSENT_METHODS } from "@/lib/interviews/participants";
import { SESSION_KINDS, SESSION_STATUSES, TRANSCRIPT_STATUSES, type Speakers } from "@/lib/interviews/sessions";

const createdAt = () =>
  timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

// ── Auth.js tables (shape required by @auth/drizzle-adapter) ────────────────

export const users = pgTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => newId("usr")),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("email_verified", { withTimezone: true, mode: "date" }),
  image: text("image"),
  locale: text("locale"),
  createdAt: createdAt(),
});

export const accounts = pgTable(
  "accounts",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { withTimezone: true, mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { withTimezone: true, mode: "date" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

// ── Workspaces, members, invites ────────────────────────────────────────────

export const roleEnum = pgEnum("role", ROLES);

export const workspaces = pgTable("workspaces", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => newId("ws")),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdById: text("created_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const memberships = pgTable(
  "memberships",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: roleEnum("role").notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.userId] }), index("memberships_user_idx").on(t.userId)],
);

export const invites = pgTable(
  "invites",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId("inv")),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: roleEnum("role").notNull(),
    token: text("token").notNull().unique(),
    invitedById: text("invited_by_id").references(() => users.id, { onDelete: "set null" }),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true, mode: "date" }),
    createdAt: createdAt(),
  },
  (t) => [index("invites_workspace_idx").on(t.workspaceId)],
);

// ── Projects & studies ──────────────────────────────────────────────────────

export const projects = pgTable(
  "projects",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId("prj")),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    color: text("color").notNull().default("violet"),
    /** Custom folder on the projects page (null = ungrouped). */
    groupId: text("group_id").references((): AnyPgColumn => projectGroups.id, { onDelete: "set null" }),
    archivedAt: timestamp("archived_at", { withTimezone: true, mode: "date" }),
    createdById: text("created_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("projects_workspace_idx").on(t.workspaceId)],
);

export const studyTypeEnum = pgEnum("study_type", STUDY_TYPES);
export const studyStatusEnum = pgEnum("study_status", STUDY_STATUSES);

export const studies = pgTable(
  "studies",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId("std")),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    type: studyTypeEnum("type").notNull(),
    status: studyStatusEnum("status").notNull().default("draft"),
    isDemo: boolean("is_demo").notNull().default(false),
    createdById: text("created_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("studies_project_idx").on(t.projectId),
    index("studies_workspace_updated_idx").on(t.workspaceId, t.updatedAt),
  ],
);

// ── Audit log ───────────────────────────────────────────────────────────────

export const auditEvents = pgTable(
  "audit_events",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId("evt")),
    workspaceId: text("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
    actorId: text("actor_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("audit_workspace_created_idx").on(t.workspaceId, t.createdAt)],
);

// ── Dev mailbox (only written when no SMTP server is configured) ────────────

export const devMailbox = pgTable("dev_mailbox", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => newId("mail")),
  to: text("to").notNull(),
  subject: text("subject").notNull(),
  text: text("text").notNull(),
  url: text("url"),
  createdAt: createdAt(),
});

// ── Forms & responses ───────────────────────────────────────────────────────

export const forms = pgTable("forms", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => newId("frm")),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  studyId: text("study_id")
    .notNull()
    .unique()
    .references(() => studies.id, { onDelete: "cascade" }),
  /** Short id used in public links: /f/{publicId}. */
  publicId: text("public_id").notNull().unique(),
  draft: jsonb("draft").$type<FormDoc>().notNull(),
  publishedVersion: integer("published_version"),
  publishedAt: timestamp("published_at", { withTimezone: true, mode: "date" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Immutable snapshots. Responses always point at the version they answered. */
export const formVersions = pgTable(
  "form_versions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId("fv")),
    formId: text("form_id")
      .notNull()
      .references(() => forms.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    doc: jsonb("doc").$type<FormDoc>().notNull(),
    publishedById: text("published_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("form_versions_form_version_idx").on(t.formId, t.version)],
);

export const formInvites = pgTable(
  "form_invites",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId("fi")),
    formId: text("form_id")
      .notNull()
      .references(() => forms.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    token: text("token").notNull().unique(),
    sentAt: timestamp("sent_at", { withTimezone: true, mode: "date" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("form_invites_form_email_idx").on(t.formId, t.email)],
);

export const RESPONSE_STATUSES = ["partial", "complete", "screened_out", "over_quota"] as const;
export type ResponseStatus = (typeof RESPONSE_STATUSES)[number];
export const responseStatusEnum = pgEnum("response_status", RESPONSE_STATUSES);

export const responses = pgTable(
  "responses",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId("rsp")),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    studyId: text("study_id")
      .notNull()
      .references(() => studies.id, { onDelete: "cascade" }),
    formId: text("form_id")
      .notNull()
      .references(() => forms.id, { onDelete: "cascade" }),
    formVersion: integer("form_version").notNull(),
    status: responseStatusEnum("status").notNull().default("partial"),
    /** Secret that lets a respondent resume (and only that respondent). */
    resumeToken: text("resume_token").notNull().unique(),
    inviteId: text("invite_id").references(() => formInvites.id, { onDelete: "set null" }),
    /** The person behind this response, when known (mixed methods: same person, several sources). */
    participantId: text("participant_id").references((): AnyPgColumn => participants.id, { onDelete: "set null" }),
    deviceId: text("device_id"),
    locale: text("locale"),
    currentPageId: text("current_page_id"),
    quotaIds: text("quota_ids").array().notNull().default([]),
    meta: jsonb("meta").$type<{ userAgent?: string; referrer?: string; embed?: boolean }>().notNull().default({}),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: updatedAt(),
    submittedAt: timestamp("submitted_at", { withTimezone: true, mode: "date" }),
    durationMs: integer("duration_ms"),
  },
  (t) => [
    index("responses_study_idx").on(t.studyId, t.startedAt),
    index("responses_form_status_idx").on(t.formId, t.status),
    index("responses_device_idx").on(t.formId, t.deviceId),
  ],
);

export const answers = pgTable(
  "answers",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId("ans")),
    responseId: text("response_id")
      .notNull()
      .references(() => responses.id, { onDelete: "cascade" }),
    questionId: text("question_id").notNull(),
    value: jsonb("value").$type<AnswerValue>().notNull(),
    /** Denormalized for fast stats (scales, numbers, yes/no). */
    numeric: doublePrecision("numeric"),
    /** Denormalized for search (open text, "other" text). */
    text: text("text"),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("answers_response_question_idx").on(t.responseId, t.questionId), index("answers_question_idx").on(t.questionId)],
);

export const files = pgTable(
  "files",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId("fil")),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    responseId: text("response_id").references(() => responses.id, { onDelete: "cascade" }),
    storage: text("storage").notNull(),
    key: text("key").notNull(),
    name: text("name").notNull(),
    mime: text("mime").notNull(),
    size: integer("size").notNull(),
    uploadedById: text("uploaded_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("files_response_idx").on(t.responseId)],
);

/** Data preparation rules per study (exclusions, recodes, computed scores). */
export const studyAnalysis = pgTable("study_analysis", {
  studyId: text("study_id")
    .primaryKey()
    .references(() => studies.id, { onDelete: "cascade" }),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  settings: jsonb("settings").$type<AnalysisSettings>().notNull(),
  updatedAt: updatedAt(),
});

// ── Interviews: guides, participants, sessions, transcripts, notes ─────────

/** One guide (and consent form) per study, stored as documents like forms. */
export const interviewGuides = pgTable("interview_guides", {
  studyId: text("study_id")
    .primaryKey()
    .references(() => studies.id, { onDelete: "cascade" }),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  doc: jsonb("doc").$type<GuideDoc>().notNull(),
  consent: jsonb("consent").$type<ConsentDoc>(),
  updatedAt: updatedAt(),
});

export const participantStatusEnum = pgEnum("participant_status", PARTICIPANT_STATUSES);
export const consentMethodEnum = pgEnum("consent_method", CONSENT_METHODS);

export const participants = pgTable(
  "participants",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId("par")),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    studyId: text("study_id")
      .notNull()
      .references(() => studies.id, { onDelete: "cascade" }),
    /** Pseudonym shown everywhere analysis happens (P01, P02…). */
    code: text("code").notNull(),
    name: text("name"),
    email: text("email"),
    phone: text("phone"),
    /** Id in a panel or another system; also used to match people across studies. */
    externalId: text("external_id"),
    attributes: jsonb("attributes").$type<Record<string, string>>().notNull().default({}),
    status: participantStatusEnum("status").notNull().default("recruited"),
    notes: text("notes"),
    /** Secret for the participant's own consent page. */
    consentToken: text("consent_token").notNull().unique(),
    consentAt: timestamp("consent_at", { withTimezone: true, mode: "date" }),
    consentMethod: consentMethodEnum("consent_method"),
    consentName: text("consent_name"),
    consentVersion: integer("consent_version"),
    consentSentAt: timestamp("consent_sent_at", { withTimezone: true, mode: "date" }),
    anonymizedAt: timestamp("anonymized_at", { withTimezone: true, mode: "date" }),
    createdById: text("created_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("participants_study_code_idx").on(t.studyId, t.code), index("participants_study_status_idx").on(t.studyId, t.status)],
);

export const sessionKindEnum = pgEnum("session_kind", SESSION_KINDS);
export const sessionStatusEnum = pgEnum("session_status", SESSION_STATUSES);

export const researchSessions = pgTable(
  "research_sessions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId("ses")),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    studyId: text("study_id")
      .notNull()
      .references(() => studies.id, { onDelete: "cascade" }),
    kind: sessionKindEnum("kind").notNull(),
    title: text("title").notNull(),
    status: sessionStatusEnum("status").notNull().default("scheduled"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true, mode: "date" }),
    durationMin: integer("duration_min"),
    /** Room, address or meeting link. */
    location: text("location"),
    interviewerId: text("interviewer_id").references(() => users.id, { onDelete: "set null" }),
    mediaFileId: text("media_file_id").references(() => files.id, { onDelete: "set null" }),
    mediaDurationMs: integer("media_duration_ms"),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }),
    endedAt: timestamp("ended_at", { withTimezone: true, mode: "date" }),
    summary: text("summary"),
    createdById: text("created_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("sessions_study_scheduled_idx").on(t.studyId, t.scheduledAt)],
);

export const sessionParticipants = pgTable(
  "session_participants",
  {
    sessionId: text("session_id")
      .notNull()
      .references(() => researchSessions.id, { onDelete: "cascade" }),
    participantId: text("participant_id")
      .notNull()
      .references(() => participants.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.sessionId, t.participantId] }), index("session_participants_participant_idx").on(t.participantId)],
);

export const transcriptStatusEnum = pgEnum("transcript_status", TRANSCRIPT_STATUSES);

export const transcripts = pgTable("transcripts", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => newId("trn")),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  sessionId: text("session_id")
    .notNull()
    .unique()
    .references(() => researchSessions.id, { onDelete: "cascade" }),
  /** mock | openai | import | manual */
  provider: text("provider").notNull(),
  status: transcriptStatusEnum("status").notNull().default("processing"),
  language: text("language"),
  speakers: jsonb("speakers").$type<Speakers>().notNull().default({}),
  error: text("error"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const segments = pgTable(
  "segments",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId("seg")),
    transcriptId: text("transcript_id")
      .notNull()
      .references(() => transcripts.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    speaker: text("speaker"),
    startMs: integer("start_ms"),
    endMs: integer("end_ms"),
    text: text("text").notNull(),
  },
  (t) => [index("segments_transcript_position_idx").on(t.transcriptId, t.position)],
);

export const sessionNotes = pgTable(
  "session_notes",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId("note")),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    sessionId: text("session_id")
      .notNull()
      .references(() => researchSessions.id, { onDelete: "cascade" }),
    /** Milliseconds into the session/recording; null for notes added afterwards. */
    atMs: integer("at_ms"),
    tag: text("tag"),
    text: text("text").notNull(),
    authorId: text("author_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("session_notes_session_idx").on(t.sessionId, t.atMs)],
);

// ── Qualitative coding: codebook, codings, themes, memos ───────────────────

/** Themes group codes (one theme per code, like columns on a board). */
export const themes = pgTable(
  "themes",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId("thm")),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    color: text("color").notNull().default("1"),
    position: integer("position").notNull().default(0),
    createdById: text("created_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("themes_project_idx").on(t.projectId, t.position)],
);

/** Codes belong to a project, so transcripts and survey answers across its studies share them. */
export const codes = pgTable(
  "codes",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId("cod")),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    parentId: text("parent_id"),
    name: text("name").notNull(),
    /** Palette slot "1"…"8" (the validated categorical palette). */
    color: text("color").notNull().default("1"),
    definition: text("definition"),
    position: integer("position").notNull().default(0),
    themeId: text("theme_id").references(() => themes.id, { onDelete: "set null" }),
    themePosition: integer("theme_position").notNull().default(0),
    createdById: text("created_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("codes_project_idx").on(t.projectId), index("codes_parent_idx").on(t.parentId)],
);

export const CODING_SOURCES = ["human", "ai"] as const;
export const codingSourceEnum = pgEnum("coding_source", CODING_SOURCES);

/**
 * A coded passage: a range inside one transcript segment or one open-text answer.
 * AI suggestions are rows with source "ai" and no approvedAt until a person accepts them.
 */
export const codeApplications = pgTable(
  "code_applications",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId("cap")),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    codeId: text("code_id")
      .notNull()
      .references(() => codes.id, { onDelete: "cascade" }),
    segmentId: text("segment_id").references(() => segments.id, { onDelete: "cascade" }),
    answerId: text("answer_id").references(() => answers.id, { onDelete: "cascade" }),
    /** UTF-16 offsets into the segment/answer text. */
    start: integer("start").notNull(),
    end: integer("end").notNull(),
    quote: text("quote").notNull(),
    source: codingSourceEnum("source").notNull().default("human"),
    approvedAt: timestamp("approved_at", { withTimezone: true, mode: "date" }),
    /** Why the assistant suggested it (shown with the suggestion). */
    reason: text("reason"),
    starred: boolean("starred").notNull().default(false),
    createdById: text("created_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("codings_project_idx").on(t.projectId),
    index("codings_code_idx").on(t.codeId),
    index("codings_segment_idx").on(t.segmentId),
    index("codings_answer_idx").on(t.answerId),
  ],
);

export const MEMO_TARGETS = ["project", "code", "theme", "segment", "answer", "session"] as const;
export type MemoTarget = (typeof MEMO_TARGETS)[number];
export const memoTargetEnum = pgEnum("memo_target", MEMO_TARGETS);

export const memos = pgTable(
  "memos",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId("mem")),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    targetType: memoTargetEnum("target_type").notNull(),
    targetId: text("target_id"),
    title: text("title"),
    body: text("body").notNull(),
    authorId: text("author_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("memos_target_idx").on(t.projectId, t.targetType, t.targetId)],
);

// ── Relations ───────────────────────────────────────────────────────────────

export const workspacesRelations = relations(workspaces, ({ many }) => ({
  memberships: many(memberships),
  projects: many(projects),
}));

export const membershipsRelations = relations(memberships, ({ one }) => ({
  workspace: one(workspaces, { fields: [memberships.workspaceId], references: [workspaces.id] }),
  user: one(users, { fields: [memberships.userId], references: [users.id] }),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  workspace: one(workspaces, { fields: [projects.workspaceId], references: [workspaces.id] }),
  studies: many(studies),
}));

export const studiesRelations = relations(studies, ({ one }) => ({
  project: one(projects, { fields: [studies.projectId], references: [projects.id] }),
}));

export const auditEventsRelations = relations(auditEvents, ({ one }) => ({
  actor: one(users, { fields: [auditEvents.actorId], references: [users.id] }),
}));

export type User = typeof users.$inferSelect;
export type Workspace = typeof workspaces.$inferSelect;
export type Membership = typeof memberships.$inferSelect;
export type Invite = typeof invites.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type Study = typeof studies.$inferSelect;
export type AuditEvent = typeof auditEvents.$inferSelect;
export type Form = typeof forms.$inferSelect;
export type FormVersion = typeof formVersions.$inferSelect;
export type ResponseRow = typeof responses.$inferSelect;
export type AnswerRow = typeof answers.$inferSelect;
export type FileRow = typeof files.$inferSelect;
export type Participant = typeof participants.$inferSelect;
export type ResearchSession = typeof researchSessions.$inferSelect;
export type Transcript = typeof transcripts.$inferSelect;
export type SegmentRow = typeof segments.$inferSelect;
export type SessionNote = typeof sessionNotes.$inferSelect;
export type Code = typeof codes.$inferSelect;
export type Theme = typeof themes.$inferSelect;
export type CodeApplication = typeof codeApplications.$inferSelect;
export type Memo = typeof memos.$inferSelect;

// ── Phase 6: groups, notifications, research brief, written analyses ─────────

export const projectGroups = pgTable(
  "project_groups",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId("grp")),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    position: integer("position").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("project_groups_ws_idx").on(t.workspaceId, t.position)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId("ntf")),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
    /** Message key under `notifications.kinds` (e.g. "responses", "transcript", "consent"). */
    kind: text("kind").notNull(),
    /** Values for the message, plus `count` when repeats are folded together. */
    data: jsonb("data").$type<Record<string, string | number>>().notNull().default({}),
    href: text("href"),
    /** Repeats with the same group key fold into one unread notification. */
    groupKey: text("group_key"),
    readAt: timestamp("read_at", { withTimezone: true, mode: "date" }),
    createdAt: createdAt(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.createdAt)],
);

export type BriefStatement = { id: string; text: string; kind: "hypothesis" | "proposition" | "assumption" };

/** What the project is trying to find out: the context any written analysis is built on. */
export const projectBriefs = pgTable("project_briefs", {
  projectId: text("project_id")
    .primaryKey()
    .references(() => projects.id, { onDelete: "cascade" }),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  aim: text("aim").notNull().default(""),
  questions: jsonb("questions").$type<{ id: string; text: string }[]>().notNull().default([]),
  statements: jsonb("statements").$type<BriefStatement[]>().notNull().default([]),
  /** Uploaded thesis / proposal: the file, plus its text when it could be extracted. */
  proposalFileId: text("proposal_file_id").references(() => files.id, { onDelete: "set null" }),
  proposalName: text("proposal_name"),
  proposalText: text("proposal_text"),
  updatedAt: updatedAt(),
});

export const writeups = pgTable(
  "writeups",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId("wrt")),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    /** Markdown. */
    body: text("body").notNull(),
    provider: text("provider").notNull(),
    createdById: text("created_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("writeups_project_idx").on(t.projectId, t.createdAt)],
);

export type ProjectGroup = typeof projectGroups.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type ProjectBrief = typeof projectBriefs.$inferSelect;
export type Writeup = typeof writeups.$inferSelect;
