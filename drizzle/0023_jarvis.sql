CREATE TABLE "agent_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text DEFAULT 'Nouvelle conversation' NOT NULL,
	"messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"log" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "drive_file_id" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "publish_mode" text DEFAULT 'validation' NOT NULL;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "posting_plan" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "drive_folder_id" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "abby_customer_id" text;--> statement-breakpoint
ALTER TABLE "web_projects" ADD COLUMN "abby_estimate_id" text;--> statement-breakpoint
ALTER TABLE "agent_threads" ADD CONSTRAINT "agent_threads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_threads_user_idx" ON "agent_threads" USING btree ("user_id");