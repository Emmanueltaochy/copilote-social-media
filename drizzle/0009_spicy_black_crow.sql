ALTER TABLE "clients" ADD COLUMN "departments" jsonb DEFAULT '["social"]'::jsonb NOT NULL;--> statement-breakpoint
-- Les clients existants restent au pôle social : c'est le seul métier qui
-- existait quand ils ont été créés. Le pôle web se coche au cas par cas.
UPDATE "clients" SET "departments" = '["social"]'::jsonb
  WHERE jsonb_array_length("departments") = 0;
