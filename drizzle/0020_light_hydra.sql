CREATE TABLE "brief_template_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"structure" jsonb NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brief_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category" text,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"icon" text,
	"structure" jsonb NOT NULL,
	"scope" text DEFAULT 'global' NOT NULL,
	"departments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brief_templates_scope_coherent" CHECK (("brief_templates"."scope" = 'global' and jsonb_array_length("brief_templates"."departments") = 0)
          or ("brief_templates"."scope" = 'department' and jsonb_array_length("brief_templates"."departments") > 0))
);
--> statement-breakpoint
ALTER TABLE "briefs" ADD COLUMN "template_id" uuid;--> statement-breakpoint
ALTER TABLE "briefs" ADD COLUMN "template_version" integer;--> statement-breakpoint
ALTER TABLE "briefs" ADD COLUMN "structure_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "briefs" ADD COLUMN "answers" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "briefs" ADD COLUMN "legacy_migrated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "brief_template_versions" ADD CONSTRAINT "brief_template_versions_template_id_brief_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."brief_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brief_template_versions" ADD CONSTRAINT "brief_template_versions_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brief_templates" ADD CONSTRAINT "brief_templates_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "brief_template_versions_key" ON "brief_template_versions" USING btree ("template_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "brief_templates_slug_key" ON "brief_templates" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "brief_templates_active_idx" ON "brief_templates" USING btree ("is_active");--> statement-breakpoint
ALTER TABLE "briefs" ADD CONSTRAINT "briefs_template_id_brief_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."brief_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "briefs_template_idx" ON "briefs" USING btree ("template_id");