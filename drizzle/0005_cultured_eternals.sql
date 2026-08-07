ALTER TABLE "contract_lines" ADD COLUMN "kind" "content_kind" DEFAULT 'feed' NOT NULL;--> statement-breakpoint
ALTER TABLE "contract_lines" ADD COLUMN "network" "network" DEFAULT 'instagram' NOT NULL;--> statement-breakpoint
-- Reprise des lignes déjà saisies : le libellé est du texte libre, mais quand
-- il dit clairement « reel » ou « story », le deviner évite de tout reprendre à
-- la main. La valeur reste visible et modifiable sur la fiche du client : c'est
-- une aide au démarrage, pas une vérité.
UPDATE "contract_lines" SET "kind" = 'reel'
  WHERE "kind" = 'feed' AND lower("label") ~ '(reel|réel|rééls|reels)';--> statement-breakpoint
UPDATE "contract_lines" SET "kind" = 'story'
  WHERE "kind" = 'feed' AND lower("label") ~ '(story|stories|storie)';--> statement-breakpoint
UPDATE "contract_lines" SET "kind" = 'carrousel'
  WHERE "kind" = 'feed' AND lower("label") ~ '(carrousel|carousel|carrousels)';--> statement-breakpoint
UPDATE "contract_lines" SET "network" = 'tiktok'
  WHERE lower("label") ~ 'tiktok';--> statement-breakpoint
UPDATE "contract_lines" SET "network" = 'linkedin'
  WHERE lower("label") ~ 'linkedin';--> statement-breakpoint
UPDATE "contract_lines" SET "network" = 'facebook'
  WHERE lower("label") ~ '(facebook|\mfb\M)';
