CREATE TYPE "public"."consent_method" AS ENUM('online', 'written', 'verbal');--> statement-breakpoint
CREATE TYPE "public"."participant_status" AS ENUM('recruited', 'eligible', 'ineligible', 'scheduled', 'completed', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."session_kind" AS ENUM('interview', 'focus_group', 'field_notes', 'diary');--> statement-breakpoint
CREATE TYPE "public"."session_status" AS ENUM('scheduled', 'in_progress', 'completed', 'cancelled', 'no_show');--> statement-breakpoint
CREATE TYPE "public"."transcript_status" AS ENUM('processing', 'ready', 'failed');--> statement-breakpoint
CREATE TABLE "interview_guides" (
	"study_id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"doc" jsonb NOT NULL,
	"consent" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "participants" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"study_id" text NOT NULL,
	"code" text NOT NULL,
	"name" text,
	"email" text,
	"phone" text,
	"external_id" text,
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "participant_status" DEFAULT 'recruited' NOT NULL,
	"notes" text,
	"consent_token" text NOT NULL,
	"consent_at" timestamp with time zone,
	"consent_method" "consent_method",
	"consent_name" text,
	"consent_version" integer,
	"consent_sent_at" timestamp with time zone,
	"anonymized_at" timestamp with time zone,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "participants_consent_token_unique" UNIQUE("consent_token")
);
--> statement-breakpoint
CREATE TABLE "research_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"study_id" text NOT NULL,
	"kind" "session_kind" NOT NULL,
	"title" text NOT NULL,
	"status" "session_status" DEFAULT 'scheduled' NOT NULL,
	"scheduled_at" timestamp with time zone,
	"duration_min" integer,
	"location" text,
	"interviewer_id" text,
	"media_file_id" text,
	"media_duration_ms" integer,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"summary" text,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "segments" (
	"id" text PRIMARY KEY NOT NULL,
	"transcript_id" text NOT NULL,
	"position" integer NOT NULL,
	"speaker" text,
	"start_ms" integer,
	"end_ms" integer,
	"text" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_notes" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"session_id" text NOT NULL,
	"at_ms" integer,
	"tag" text,
	"text" text NOT NULL,
	"author_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_participants" (
	"session_id" text NOT NULL,
	"participant_id" text NOT NULL,
	CONSTRAINT "session_participants_session_id_participant_id_pk" PRIMARY KEY("session_id","participant_id")
);
--> statement-breakpoint
CREATE TABLE "transcripts" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"session_id" text NOT NULL,
	"provider" text NOT NULL,
	"status" "transcript_status" DEFAULT 'processing' NOT NULL,
	"language" text,
	"speakers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transcripts_session_id_unique" UNIQUE("session_id")
);
--> statement-breakpoint
ALTER TABLE "interview_guides" ADD CONSTRAINT "interview_guides_study_id_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."studies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_guides" ADD CONSTRAINT "interview_guides_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_study_id_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."studies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_sessions" ADD CONSTRAINT "research_sessions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_sessions" ADD CONSTRAINT "research_sessions_study_id_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."studies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_sessions" ADD CONSTRAINT "research_sessions_interviewer_id_users_id_fk" FOREIGN KEY ("interviewer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_sessions" ADD CONSTRAINT "research_sessions_media_file_id_files_id_fk" FOREIGN KEY ("media_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_sessions" ADD CONSTRAINT "research_sessions_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "segments" ADD CONSTRAINT "segments_transcript_id_transcripts_id_fk" FOREIGN KEY ("transcript_id") REFERENCES "public"."transcripts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_notes" ADD CONSTRAINT "session_notes_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_notes" ADD CONSTRAINT "session_notes_session_id_research_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."research_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_notes" ADD CONSTRAINT "session_notes_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_participants" ADD CONSTRAINT "session_participants_session_id_research_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."research_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_participants" ADD CONSTRAINT "session_participants_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcripts" ADD CONSTRAINT "transcripts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcripts" ADD CONSTRAINT "transcripts_session_id_research_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."research_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "participants_study_code_idx" ON "participants" USING btree ("study_id","code");--> statement-breakpoint
CREATE INDEX "participants_study_status_idx" ON "participants" USING btree ("study_id","status");--> statement-breakpoint
CREATE INDEX "sessions_study_scheduled_idx" ON "research_sessions" USING btree ("study_id","scheduled_at");--> statement-breakpoint
CREATE INDEX "segments_transcript_position_idx" ON "segments" USING btree ("transcript_id","position");--> statement-breakpoint
CREATE INDEX "session_notes_session_idx" ON "session_notes" USING btree ("session_id","at_ms");--> statement-breakpoint
CREATE INDEX "session_participants_participant_idx" ON "session_participants" USING btree ("participant_id");