CREATE TABLE "directory_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid,
	"name" text NOT NULL,
	"contact_name" text,
	"kind" text DEFAULT 'prospect' NOT NULL,
	"source" text DEFAULT 'agence' NOT NULL,
	"activity" text DEFAULT 'agence' NOT NULL,
	"status" text,
	"email" text,
	"phone" text,
	"website" text,
	"city" text,
	"country" text,
	"sector" text,
	"owner" text,
	"next_action" text,
	"next_action_on" date,
	"note" text,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"email_key" text,
	"name_key" text,
	"external_source" text,
	"external_id" text,
	"abby_customer_id" text,
	"links" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_activity_at" timestamp with time zone,
	"imported_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "directory_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"source" text NOT NULL,
	"kind" text DEFAULT 'evenement' NOT NULL,
	"external_id" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"awaiting_reply" boolean DEFAULT false NOT NULL,
	"due_on" date,
	"done_at" timestamp with time zone,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "directory_entries" ADD CONSTRAINT "directory_entries_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "directory_events" ADD CONSTRAINT "directory_events_entry_id_directory_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."directory_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "directory_entries_client_key" ON "directory_entries" USING btree ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "directory_entries_external_key" ON "directory_entries" USING btree ("external_source","external_id");--> statement-breakpoint
CREATE INDEX "directory_entries_email_idx" ON "directory_entries" USING btree ("email_key");--> statement-breakpoint
CREATE INDEX "directory_entries_name_idx" ON "directory_entries" USING btree ("name_key");--> statement-breakpoint
CREATE INDEX "directory_entries_kind_idx" ON "directory_entries" USING btree ("kind","activity");--> statement-breakpoint
CREATE UNIQUE INDEX "directory_events_external_key" ON "directory_events" USING btree ("entry_id","source","external_id");--> statement-breakpoint
CREATE INDEX "directory_events_entry_idx" ON "directory_events" USING btree ("entry_id","occurred_at");