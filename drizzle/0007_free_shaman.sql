CREATE TYPE "public"."brief_field_kind" AS ENUM('texte', 'long', 'choix', 'oui_non', 'url', 'nombre');--> statement-breakpoint
CREATE TYPE "public"."brief_status" AS ENUM('brouillon', 'envoye', 'en_cours', 'complete');--> statement-breakpoint
CREATE TYPE "public"."web_phase" AS ENUM('cadrage', 'brief', 'maquette', 'integration', 'contenus', 'recette', 'en_ligne', 'maintenance');--> statement-breakpoint
CREATE TYPE "public"."web_project_type" AS ENUM('vitrine', 'ecommerce', 'landing', 'location', 'refonte', 'autre');--> statement-breakpoint
CREATE TABLE "brief_fields" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brief_id" uuid NOT NULL,
	"section" text NOT NULL,
	"label" text NOT NULL,
	"help" text,
	"kind" "brief_field_kind" DEFAULT 'texte' NOT NULL,
	"options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"answer" text,
	"answered_at" timestamp with time zone,
	"answered_by_id" uuid
);
--> statement-breakpoint
CREATE TABLE "briefs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"project_id" uuid,
	"title" text NOT NULL,
	"intro" text,
	"status" "brief_status" DEFAULT 'brouillon' NOT NULL,
	"sent_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" text PRIMARY KEY DEFAULT 'agence' NOT NULL,
	"agency_name" text DEFAULT 'Taochy Consulting' NOT NULL,
	"primary_color" text DEFAULT '#B08D3F' NOT NULL,
	"dark_color" text DEFAULT '#121212' NOT NULL,
	"logo_path" text,
	"portal_welcome" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "web_milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"label" text NOT NULL,
	"due_at" timestamp with time zone,
	"done" boolean DEFAULT false NOT NULL,
	"done_at" timestamp with time zone,
	"waiting_client" boolean DEFAULT false NOT NULL,
	"client_visible" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "web_projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" "web_project_type" DEFAULT 'vitrine' NOT NULL,
	"phase" "web_phase" DEFAULT 'cadrage' NOT NULL,
	"owner_id" uuid,
	"price_cents" integer DEFAULT 0 NOT NULL,
	"due_at" timestamp with time zone,
	"launched_at" timestamp with time zone,
	"domain" text,
	"hosting" text,
	"stack" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "departments" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "brief_fields" ADD CONSTRAINT "brief_fields_brief_id_briefs_id_fk" FOREIGN KEY ("brief_id") REFERENCES "public"."briefs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brief_fields" ADD CONSTRAINT "brief_fields_answered_by_id_users_id_fk" FOREIGN KEY ("answered_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "briefs" ADD CONSTRAINT "briefs_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "briefs" ADD CONSTRAINT "briefs_project_id_web_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."web_projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "briefs" ADD CONSTRAINT "briefs_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "web_milestones" ADD CONSTRAINT "web_milestones_project_id_web_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."web_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "web_projects" ADD CONSTRAINT "web_projects_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "web_projects" ADD CONSTRAINT "web_projects_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "brief_fields_brief_idx" ON "brief_fields" USING btree ("brief_id");--> statement-breakpoint
CREATE INDEX "briefs_client_idx" ON "briefs" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "web_milestones_project_idx" ON "web_milestones" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "web_projects_client_idx" ON "web_projects" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "web_projects_phase_idx" ON "web_projects" USING btree ("phase");--> statement-breakpoint
-- Les comptes existants restent où ils sont : le pôle social, celui qu'ils
-- avaient avant que le web n'existe. La direction obtient les deux, puisque
-- c'est elle qui arbitre entre les deux métiers.
UPDATE "users" SET "departments" = '["social"]'::jsonb
  WHERE jsonb_array_length("departments") = 0 AND "role" = 'equipe';--> statement-breakpoint
UPDATE "users" SET "departments" = '["social","web"]'::jsonb
  WHERE jsonb_array_length("departments") = 0 AND "role" = 'direction';--> statement-breakpoint
INSERT INTO "settings" ("id") VALUES ('agence') ON CONFLICT DO NOTHING;
