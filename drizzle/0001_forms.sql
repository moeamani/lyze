CREATE TYPE "public"."response_status" AS ENUM('partial', 'complete', 'screened_out', 'over_quota');--> statement-breakpoint
CREATE TABLE "answers" (
	"id" text PRIMARY KEY NOT NULL,
	"response_id" text NOT NULL,
	"question_id" text NOT NULL,
	"value" jsonb NOT NULL,
	"numeric" double precision,
	"text" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"response_id" text,
	"storage" text NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"uploaded_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "form_invites" (
	"id" text PRIMARY KEY NOT NULL,
	"form_id" text NOT NULL,
	"email" text NOT NULL,
	"token" text NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "form_invites_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "form_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"form_id" text NOT NULL,
	"version" integer NOT NULL,
	"doc" jsonb NOT NULL,
	"published_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "forms" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"study_id" text NOT NULL,
	"public_id" text NOT NULL,
	"draft" jsonb NOT NULL,
	"published_version" integer,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "forms_study_id_unique" UNIQUE("study_id"),
	CONSTRAINT "forms_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "responses" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"study_id" text NOT NULL,
	"form_id" text NOT NULL,
	"form_version" integer NOT NULL,
	"status" "response_status" DEFAULT 'partial' NOT NULL,
	"resume_token" text NOT NULL,
	"invite_id" text,
	"device_id" text,
	"locale" text,
	"current_page_id" text,
	"quota_ids" text[] DEFAULT '{}' NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_at" timestamp with time zone,
	"duration_ms" integer,
	CONSTRAINT "responses_resume_token_unique" UNIQUE("resume_token")
);
--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_response_id_responses_id_fk" FOREIGN KEY ("response_id") REFERENCES "public"."responses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_response_id_responses_id_fk" FOREIGN KEY ("response_id") REFERENCES "public"."responses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_uploaded_by_id_users_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_invites" ADD CONSTRAINT "form_invites_form_id_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."forms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_versions" ADD CONSTRAINT "form_versions_form_id_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."forms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_versions" ADD CONSTRAINT "form_versions_published_by_id_users_id_fk" FOREIGN KEY ("published_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forms" ADD CONSTRAINT "forms_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forms" ADD CONSTRAINT "forms_study_id_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."studies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "responses" ADD CONSTRAINT "responses_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "responses" ADD CONSTRAINT "responses_study_id_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."studies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "responses" ADD CONSTRAINT "responses_form_id_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."forms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "responses" ADD CONSTRAINT "responses_invite_id_form_invites_id_fk" FOREIGN KEY ("invite_id") REFERENCES "public"."form_invites"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "answers_response_question_idx" ON "answers" USING btree ("response_id","question_id");--> statement-breakpoint
CREATE INDEX "answers_question_idx" ON "answers" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX "files_response_idx" ON "files" USING btree ("response_id");--> statement-breakpoint
CREATE UNIQUE INDEX "form_invites_form_email_idx" ON "form_invites" USING btree ("form_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "form_versions_form_version_idx" ON "form_versions" USING btree ("form_id","version");--> statement-breakpoint
CREATE INDEX "responses_study_idx" ON "responses" USING btree ("study_id","started_at");--> statement-breakpoint
CREATE INDEX "responses_form_status_idx" ON "responses" USING btree ("form_id","status");--> statement-breakpoint
CREATE INDEX "responses_device_idx" ON "responses" USING btree ("form_id","device_id");