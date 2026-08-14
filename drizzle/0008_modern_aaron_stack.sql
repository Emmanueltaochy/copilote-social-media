CREATE TYPE "public"."deliverable_status" AS ENUM('en_attente', 'valide', 'modifications');--> statement-breakpoint
CREATE TABLE "web_deliverables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"label" text NOT NULL,
	"note" text,
	"url" text,
	"file_id" uuid,
	"status" "deliverable_status" DEFAULT 'en_attente' NOT NULL,
	"client_note" text,
	"responded_at" timestamp with time zone,
	"position" integer DEFAULT 0 NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "web_deliverables" ADD CONSTRAINT "web_deliverables_project_id_web_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."web_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "web_deliverables" ADD CONSTRAINT "web_deliverables_file_id_client_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."client_files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "web_deliverables" ADD CONSTRAINT "web_deliverables_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "web_deliverables_project_idx" ON "web_deliverables" USING btree ("project_id");