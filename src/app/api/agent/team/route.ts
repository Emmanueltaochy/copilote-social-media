import { listerEquipe } from "@/lib/agent-data";
import { withApiKey } from "@/lib/api-auth";

/**
 * Les personnes du pôle, et leur charge par statut.
 *
 * Première ressource bornée par le pôle et non par le client : quelqu'un de
 * l'agence n'appartient à aucun client. La charge, elle, reste bornée par le
 * périmètre de la clé — un agrégat qui déborde ressemble à un agrégat juste.
 */
export const dynamic = "force-dynamic";

export const GET = withApiKey("pipeline:read", async (_request, cle) => {
  const equipe = await listerEquipe(cle);
  return Response.json({ equipe, nombre: equipe.length });
});
