import { z } from "zod";
import { ajouterCommentaire } from "@/lib/agent-data";
import { withApiKey } from "@/lib/api-auth";

/**
 * Une remarque dans le fil d'un contenu.
 *
 * C'est ainsi qu'un chef de projet relance : sur le contenu concerné, là où
 * celui qui le fabrique regardera. La remarque n'est attribuée à personne de
 * l'équipe — l'attribuer à quelqu'un serait un faux.
 */
export const dynamic = "force-dynamic";

type Contexte = { params: Promise<{ id: string }> };

const Commentaire = z.object({
  texte: z.string().trim().min(2, { error: "La remarque est vide." }).max(5000),
});

export const POST = withApiKey<Contexte>("pipeline:write", async (request, cle, ctx) => {
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) {
    return Response.json({ error: "Identifiant de contenu invalide." }, { status: 400 });
  }

  let brut: unknown;
  try {
    brut = await request.json();
  } catch {
    return Response.json({ error: "Corps de requête illisible : attendu du JSON." }, { status: 400 });
  }

  const lu = Commentaire.safeParse(brut);
  if (!lu.success) {
    return Response.json({ error: lu.error.issues[0].message }, { status: 400 });
  }

  const r = await ajouterCommentaire(cle, id, lu.data.texte);
  if (!r.ok) return Response.json({ error: r.message }, { status: r.statut });
  return Response.json({ commentaire: r.valeur }, { status: 201 });
});
