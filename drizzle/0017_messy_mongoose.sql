CREATE TYPE "public"."quote_status" AS ENUM('nouvelle', 'en_cours', 'envoye', 'clos');--> statement-breakpoint
ALTER TYPE "public"."notification_kind" ADD VALUE 'devis';--> statement-breakpoint
CREATE TABLE "quote_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"requested_by_id" uuid,
	"subject" text NOT NULL,
	"kind" text DEFAULT 'autre' NOT NULL,
	"details" text,
	"budget" text,
	"deadline" date,
	"status" "quote_status" DEFAULT 'nouvelle' NOT NULL,
	"agency_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "quote_requests" ADD CONSTRAINT "quote_requests_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_requests" ADD CONSTRAINT "quote_requests_requested_by_id_users_id_fk" FOREIGN KEY ("requested_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "quote_requests_client_idx" ON "quote_requests" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "quote_requests_status_idx" ON "quote_requests" USING btree ("status");