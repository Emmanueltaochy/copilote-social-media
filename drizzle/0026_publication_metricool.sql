ALTER TYPE "public"."notification_kind" ADD VALUE 'publication_bloquee';--> statement-breakpoint
ALTER TABLE "contents" ADD COLUMN "metricool_state" text;--> statement-breakpoint
ALTER TABLE "contents" ADD COLUMN "metricool_networks" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "contents" ADD COLUMN "metricool_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "contents" ADD COLUMN "publish_blocker" text;