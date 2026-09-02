import { z } from "zod";
import { listerContenus, STATUTS_CONTENU } from "@/lib/agent-data";
import { withApiKey } from "@/lib/api-auth";

/**
 * Le pipeline de contenus, tel qu'un agent chef de projet le lit.
 *
 * La route ne touche pas la base : elle valide, appelle `agent-data`, et met en
 * forme. C'est ce qui garantit le cloisonnement — il n'y a pas ici de chemin
 * par lequel l'oublier.
 */
export const dynamic = "force-dynamic";

/**
 * Les filtres, en français comme les valeurs qu'ils acceptent : demander
 * `?status=validation` quand la valeur elle-même est française serait un
 * mélange que personne ne retient.
 */
const Filtres = z.object({
  client: z.uuid({ error: "« client » attend l'identifiant d'un client (uuid)." }).optional(),
  statut: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : undefined))
    .pipe(
      z
        .array(
          z.enum(STATUTS_CONTENU, {
            error: `« statut » accepte : ${STATUTS_CONTENU.join(", ")}.`,
          }),
        )
        .optional(),
    ),
  debut: z.iso.date({ error: "« debut » attend une date au format AAAA-MM-JJ." }).optional(),
  fin: z.iso.date({ error: "« fin » attend une date au format AAAA-MM-JJ." }).optional(),
  limite: z.coerce
    .number({ error: "« limite » attend un nombre." })
    .int()
    .min(1)
    .max(200, { error: "« limite » ne peut pas dépasser 200." })
    .default(50),
});

export const GET = withApiKey("pipeline:read", async (request, cle) => {
  const brut = Object.fromEntries(new URL(request.url).searchParams);
  const lu = Filtres.safeParse(brut);
  if (!lu.success) {
    // Le premier problème suffit à corriger l'appel, et une liste d'erreurs
    // internes de Zod ne se lit pas.
    return Response.json({ error: lu.error.issues[0].message }, { status: 400 });
  }

  const contenus = await listerContenus(cle, lu.data);
  return Response.json({ contenus, nombre: contenus.length, limite: lu.data.limite });
});
