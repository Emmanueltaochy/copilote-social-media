ALTER TABLE "clients" ADD COLUMN "web_billing" text DEFAULT 'forfait' NOT NULL;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "web_hourly_rate_cents" integer DEFAULT 0 NOT NULL;