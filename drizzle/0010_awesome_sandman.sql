ALTER TABLE "clients" ADD COLUMN "web_maintenance_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "web_hours_sold" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "time_entries" ADD COLUMN "pole" text DEFAULT 'social' NOT NULL;