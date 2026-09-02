import { z } from "zod";
import { creerBriefDepuisModele } from "@/lib/brief-templates-data";
import { estRefuse, exigeEquipe } from "@/lib/api-session";

/**
 * Crée un brief à partir d'un modèle.
 *
 * Le snapshot est écrit dans la même transaction que la lecture du modèle.
 * Sans cela, un `PATCH` glissé entre les deux produirait un brief dont la
 * structure ne correspond à aucune version connue — ni celle qu'il déclare,
 * ni celle en base. On ne s'en apercevrait qu'en cherchant à comprendre, des
 * mois plus tard, pourquoi deux briefs du même modèle ne posent pas les mêmes
 * questions.
 */
export const dynamic = "force-dynamic";

const Creation = z.object({
  template_slug: z.string().trim().min(1, { error: "« template_slug » est requis." }).max(80),
  client_id: z.uuid({ error: "« client_id » attend l'identifiant d'un client (uuid)." }),
  titre: z.string().trim().max(200).optional(),
});

export async function POST(request: Request) {
  const garde = await exigeEquipe();
  if (estRefuse(garde)) return garde.refus;

  let brut: unknown;
  try {
    brut = await request.json();
  } catch {
    return Response.json({ error: "Corps de requête illisible : attendu du JSON." }, { status: 400 });
  }

  const lu = Creation.safeParse(brut);
  if (!lu.success) return Response.json({ error: lu.error.issues[0].message }, { status: 400 });

  const r = await creerBriefDepuisModele(
    garde.user,
    lu.data.template_slug,
    lu.data.client_id,
    lu.data.titre,
  );
  if (!r.ok) return Response.json({ error: r.message }, { status: r.statut });

  return Response.json({ brief: { id: r.id } }, { status: 201 });
}
