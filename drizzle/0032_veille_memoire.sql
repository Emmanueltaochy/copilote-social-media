CREATE TABLE "veille_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"network" text NOT NULL,
	"external_id" text NOT NULL,
	"handle" text NOT NULL,
	"published_at" timestamp with time zone,
	"format" text DEFAULT 'publication' NOT NULL,
	"raw_type" text,
	"url" text,
	"image_url" text,
	"video_url" text,
	"caption" text,
	"likes" integer DEFAULT 0 NOT NULL,
	"comments" integer DEFAULT 0 NOT NULL,
	"shares" integer DEFAULT 0 NOT NULL,
	"views" bigint DEFAULT 0 NOT NULL,
	"interactions" bigint DEFAULT 0 NOT NULL,
	"engagement" double precision,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metrics_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "veille_sync" (
	"client_id" uuid PRIMARY KEY NOT NULL,
	"recent_at" timestamp with time zone,
	"lease_until" timestamp with time zone,
	"backfill_status" text,
	"backfill_started_at" timestamp with time zone,
	"backfill_done_at" timestamp with time zone,
	"backfill_state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_error" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "veille_posts" ADD CONSTRAINT "veille_posts_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "veille_sync" ADD CONSTRAINT "veille_sync_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "veille_posts_unique" ON "veille_posts" USING btree ("client_id","network","external_id");--> statement-breakpoint
CREATE INDEX "veille_posts_client_date_idx" ON "veille_posts" USING btree ("client_id","published_at");