CREATE TABLE "shoot_video_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"video_id" uuid NOT NULL,
	"author_id" uuid,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shoot_videos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shoot_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"references" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"script" text,
	"speaker" text,
	"prep" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"prep_done" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"duration_sec" integer,
	"format" text,
	"status" text DEFAULT 'a_preparer' NOT NULL,
	"visible_to_client" boolean DEFAULT true NOT NULL,
	"content_id" uuid,
	"client_ready_at" timestamp with time zone,
	"client_ready_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shoots" ADD COLUMN "published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shoot_video_comments" ADD CONSTRAINT "shoot_video_comments_video_id_shoot_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."shoot_videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shoot_video_comments" ADD CONSTRAINT "shoot_video_comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shoot_videos" ADD CONSTRAINT "shoot_videos_shoot_id_shoots_id_fk" FOREIGN KEY ("shoot_id") REFERENCES "public"."shoots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shoot_videos" ADD CONSTRAINT "shoot_videos_content_id_contents_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."contents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shoot_videos" ADD CONSTRAINT "shoot_videos_client_ready_by_id_users_id_fk" FOREIGN KEY ("client_ready_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shoot_video_comments_video_idx" ON "shoot_video_comments" USING btree ("video_id");--> statement-breakpoint
CREATE INDEX "shoot_videos_shoot_idx" ON "shoot_videos" USING btree ("shoot_id","position");