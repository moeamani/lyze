import {
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
