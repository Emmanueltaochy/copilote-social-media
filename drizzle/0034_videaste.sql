ALTER TYPE "public"."user_role" ADD VALUE 'videaste';--> statement-breakpoint
CREATE TABLE "shoot_video_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"video_id" uuid NOT NULL,
	"author_id" uuid,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shoot_videos" ADD COLUMN "shot_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shoot_videos" ADD COLUMN "shot_by_id" uuid;--> statement-breakpoint
ALTER TABLE "shoots" ADD COLUMN "on_site_contact" text;--> statement-breakpoint
ALTER TABLE "shoots" ADD COLUMN "rushes_url" text;--> statement-breakpoint
ALTER TABLE "shoots" ADD COLUMN "rushes_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shoots" ADD COLUMN "rushes_by_id" uuid;--> statement-breakpoint
ALTER TABLE "shoot_video_notes" ADD CONSTRAINT "shoot_video_notes_video_id_shoot_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."shoot_videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shoot_video_notes" ADD CONSTRAINT "shoot_video_notes_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shoot_video_notes_video_idx" ON "shoot_video_notes" USING btree ("video_id");--> statement-breakpoint
ALTER TABLE "shoot_videos" ADD CONSTRAINT "shoot_videos_shot_by_id_users_id_fk" FOREIGN KEY ("shot_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shoots" ADD CONSTRAINT "shoots_rushes_by_id_users_id_fk" FOREIGN KEY ("rushes_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;