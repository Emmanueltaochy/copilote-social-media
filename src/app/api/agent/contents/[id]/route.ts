import { z } from "zod";
import { lireContenu } from "@/lib/agent-data";
import { withApiKey } from "@/lib/api-auth";

/**
 * Un contenu, ses versions et son fil de commentaires.
 *
 * Hors périmètre, la réponse est un 404 et non un 403 : répondre « il existe
 * mais pas pour toi » confirmerait son existence, ce qui est déjà une fuite.
 */
export const dynamic = "force-dynamic";

type Contexte = { params: Promise<{ id: string }> };

export const GET = withApiKey<Contexte>("pipeline:read", async (_request, cle, ctx) => {
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) {
    return Response.json({ error: "Identifiant de contenu invalide." }, { status: 400 });
  }

  const contenu = await lireContenu(cle, id);
  if (!contenu) return Response.json({ error: "Contenu introuvable." }, { status: 404 });

  return Response.json({ contenu });
});
