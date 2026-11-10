CREATE TABLE "audience_daily" (
	"client_id" uuid NOT NULL,
	"network" text NOT NULL,
	"day" date NOT NULL,
	"followers" integer NOT NULL,
	CONSTRAINT "audience_daily_client_id_network_day_pk" PRIMARY KEY("client_id","network","day")
);
--> statement-breakpoint
CREATE TABLE "integrations" (
	"id" text PRIMARY KEY NOT NULL,
	"token" text,
	"account_id" text,
	"last_sync_at" timestamp with time zone,
	"last_error" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_posts" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" uuid NOT NULL,
	"network" text NOT NULL,
	"kind" text DEFAULT 'post' NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	"text" text,
	"image_url" text,
	"url" text,
	"reach" integer DEFAULT 0 NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	"interactions" integer DEFAULT 0 NOT NULL,
	"saves" integer DEFAULT 0 NOT NULL,
	"engagement" text,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "metricool_brand_id" text;--> statement-breakpoint
ALTER TABLE "contents" ADD COLUMN "metricool_post_id" text;--> statement-breakpoint
ALTER TABLE "contents" ADD COLUMN "metricool_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "audience_daily" ADD CONSTRAINT "audience_daily_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_posts" ADD CONSTRAINT "social_posts_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audience_daily_day_idx" ON "audience_daily" USING btree ("day");--> statement-breakpoint
CREATE INDEX "social_posts_client_idx" ON "social_posts" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "social_posts_published_idx" ON "social_posts" USING btree ("published_at");