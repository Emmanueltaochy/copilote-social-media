ALTER TABLE "contents" ADD COLUMN "networks" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "contract_lines" ADD COLUMN "networks" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
-- Reprise de l'existant : chaque contenu et chaque ligne de contrat portait
-- déjà un réseau. On le recopie dans la liste pour que l'affichage et les
-- cases à cocher partent de la vérité d'aujourd'hui plutôt que d'un tableau
-- vide qui ferait croire qu'aucun réseau n'a été choisi.
UPDATE "contents" SET "networks" = jsonb_build_array("network"::text)
  WHERE jsonb_array_length("networks") = 0;--> statement-breakpoint
UPDATE "contract_lines" SET "networks" = jsonb_build_array("network"::text)
  WHERE jsonb_array_length("networks") = 0;
