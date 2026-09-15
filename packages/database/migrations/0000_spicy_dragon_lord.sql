CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pgcrypto;--> statement-breakpoint
CREATE TYPE "public"."knowledge_kind" AS ENUM('business_profile', 'service', 'opening_hours', 'contact', 'tone', 'faq', 'policy', 'forbidden_claim', 'document');--> statement-breakpoint
CREATE TYPE "public"."knowledge_status" AS ENUM('draft', 'approved', 'retired');--> statement-breakpoint
CREATE TYPE "public"."review_workflow_status" AS ENUM('received', 'generating', 'pending_approval', 'scheduled_auto', 'publishing', 'published', 'rejected', 'needs_attention');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('owner', 'admin', 'editor', 'approver');--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"location_ids" uuid[] DEFAULT ARRAY[]::uuid[] NOT NULL,
	"star_ratings" integer[] NOT NULL,
	"languages" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"comment_mode" text DEFAULT 'any' NOT NULL,
	"categories" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"action" text NOT NULL,
	"delay_minutes" integer DEFAULT 10 NOT NULL,
	"daily_limit" integer DEFAULT 20 NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"consent_version" text,
	"consented_by" uuid,
	"consented_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "device_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"platform" text NOT NULL,
	"provider" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "google_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"google_account_name" text,
	"encrypted_refresh_token" text NOT NULL,
	"token_key_version" text NOT NULL,
	"scopes" text[] NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"last_error_code" text,
	"connected_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"content" text NOT NULL,
	"search_text" text NOT NULL,
	"embedding" vector(768),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"location_id" uuid,
	"kind" "knowledge_kind" NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"language" text NOT NULL,
	"status" "knowledge_status" DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"valid_from" timestamp with time zone,
	"valid_until" timestamp with time zone,
	"author_id" uuid NOT NULL,
	"sha256" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"google_account_name" text NOT NULL,
	"google_location_name" text NOT NULL,
	"display_name" text NOT NULL,
	"default_language" text DEFAULT 'it' NOT NULL,
	"tone" text DEFAULT 'professionale, umano e conciso' NOT NULL,
	"manual_approval_count" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "member_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memberships_tenant_id_user_id_pk" PRIMARY KEY("tenant_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "processed_events" (
	"message_id" text PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "publish_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"review_case_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"attempt" integer NOT NULL,
	"status" text NOT NULL,
	"provider_status" integer,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "reply_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"review_case_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"text" text NOT NULL,
	"language" text NOT NULL,
	"category" text NOT NULL,
	"risk_flags" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"knowledge_source_ids" uuid[] DEFAULT ARRAY[]::uuid[] NOT NULL,
	"unsupported_claims" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"requires_human_review" boolean NOT NULL,
	"validation" jsonb NOT NULL,
	"model" text NOT NULL,
	"provider" text NOT NULL,
	"prompt_version" text NOT NULL,
	"request_id" text,
	"human_instruction" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"google_review_name" text NOT NULL,
	"google_create_time" timestamp with time zone NOT NULL,
	"google_update_time" timestamp with time zone NOT NULL,
	"reviewer_display_name" text NOT NULL,
	"star_rating" integer NOT NULL,
	"comment" text DEFAULT '' NOT NULL,
	"content_expires_at" timestamp with time zone NOT NULL,
	"existing_reply" text,
	"status" "review_workflow_status" DEFAULT 'received' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"language" text,
	"category" text,
	"risk_flags" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"scheduled_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"published_reply" text,
	"active_draft_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"default_language" text DEFAULT 'it' NOT NULL,
	"automation_kill_switch" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identity_uid" text NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"mfa_enrolled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_identity_uid_unique" UNIQUE("identity_uid")
);
--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_rules" ADD CONSTRAINT "automation_rules_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_rules" ADD CONSTRAINT "automation_rules_consented_by_users_id_fk" FOREIGN KEY ("consented_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_tokens" ADD CONSTRAINT "device_tokens_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_tokens" ADD CONSTRAINT "device_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_connections" ADD CONSTRAINT "google_connections_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_connections" ADD CONSTRAINT "google_connections_connected_by_users_id_fk" FOREIGN KEY ("connected_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_source_id_knowledge_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."knowledge_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_sources" ADD CONSTRAINT "knowledge_sources_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_sources" ADD CONSTRAINT "knowledge_sources_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_sources" ADD CONSTRAINT "knowledge_sources_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publish_attempts" ADD CONSTRAINT "publish_attempts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publish_attempts" ADD CONSTRAINT "publish_attempts_review_case_id_review_cases_id_fk" FOREIGN KEY ("review_case_id") REFERENCES "public"."review_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reply_drafts" ADD CONSTRAINT "reply_drafts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reply_drafts" ADD CONSTRAINT "reply_drafts_review_case_id_review_cases_id_fk" FOREIGN KEY ("review_case_id") REFERENCES "public"."review_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reply_drafts" ADD CONSTRAINT "reply_drafts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_cases" ADD CONSTRAINT "review_cases_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_cases" ADD CONSTRAINT "review_cases_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_events_tenant_time_idx" ON "audit_events" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "automation_rules_tenant_idx" ON "automation_rules" USING btree ("tenant_id","enabled");--> statement-breakpoint
CREATE UNIQUE INDEX "device_tokens_token_uidx" ON "device_tokens" USING btree ("token");--> statement-breakpoint
CREATE INDEX "google_connections_tenant_idx" ON "google_connections" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_chunks_source_ordinal_uidx" ON "knowledge_chunks" USING btree ("source_id","ordinal");--> statement-breakpoint
CREATE INDEX "knowledge_chunks_tenant_idx" ON "knowledge_chunks" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "knowledge_sources_lookup_idx" ON "knowledge_sources" USING btree ("tenant_id","location_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "locations_tenant_google_uidx" ON "locations" USING btree ("tenant_id","google_location_name");--> statement-breakpoint
CREATE INDEX "locations_tenant_idx" ON "locations" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "publish_attempts_idempotency_uidx" ON "publish_attempts" USING btree ("idempotency_key","attempt");--> statement-breakpoint
CREATE INDEX "publish_attempts_review_idx" ON "publish_attempts" USING btree ("review_case_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reply_drafts_revision_uidx" ON "reply_drafts" USING btree ("review_case_id","revision");--> statement-breakpoint
CREATE INDEX "reply_drafts_tenant_idx" ON "reply_drafts" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "review_cases_tenant_google_uidx" ON "review_cases" USING btree ("tenant_id","google_review_name");--> statement-breakpoint
CREATE INDEX "review_cases_inbox_idx" ON "review_cases" USING btree ("tenant_id","status","created_at");--> statement-breakpoint
CREATE INDEX "review_cases_expiry_idx" ON "review_cases" USING btree ("content_expires_at");
