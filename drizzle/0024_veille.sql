CREATE TABLE "trend_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"summary" text NOT NULL,
	"trends" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ideas" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"posts_analysed" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trend_reports" ADD CONSTRAINT "trend_reports_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "trend_reports_client_idx" ON "trend_reports" USING btree ("client_id");