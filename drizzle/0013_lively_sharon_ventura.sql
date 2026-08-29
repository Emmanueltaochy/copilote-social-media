ALTER TABLE "client_files" ADD COLUMN "visibility" text DEFAULT 'interne' NOT NULL;--> statement-breakpoint
-- Ce qu'un client a déposé lui-même reste visible pour lui : le passer en
-- interne le ferait disparaître de son propre portail. Les livrables web déjà
-- publiés sont dans le même cas — ils ont été mis en ligne pour être vus.
UPDATE "client_files" SET "visibility" = 'client'
WHERE "uploaded_by_id" IN (SELECT "id" FROM "users" WHERE "role" = 'client');
--> statement-breakpoint
UPDATE "client_files" SET "visibility" = 'client'
WHERE "id" IN (SELECT "file_id" FROM "web_deliverables" WHERE "file_id" IS NOT NULL);
