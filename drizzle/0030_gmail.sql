CREATE TABLE "gmail_sync" (
	"id" text PRIMARY KEY NOT NULL,
	"account" text,
	"folders" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"lease_until" timestamp with time zone,
	"last_run_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"last_result" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "directory_events_source_idx" ON "directory_events" USING btree ("source","awaiting_reply","occurred_at");