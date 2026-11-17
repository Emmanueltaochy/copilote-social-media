CREATE TABLE "ce_matin_archives" (
	"key" text PRIMARY KEY NOT NULL,
	"column" text NOT NULL,
	"state" text NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"archived_by" uuid,
	"archived_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ce_matin_archives" ADD CONSTRAINT "ce_matin_archives_archived_by_users_id_fk" FOREIGN KEY ("archived_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ce_matin_archives_column_idx" ON "ce_matin_archives" USING btree ("column");