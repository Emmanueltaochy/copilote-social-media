import { listerClients } from "@/lib/agent-data";
import { withApiKey } from "@/lib/api-auth";

/**
 * Le portefeuille de la clé : qui elle sert, et ce que chaque contrat promet.
 *
 * Sans les lignes de contrat, un agent voit ce qui existe mais pas ce qui
 * devrait exister — il ne peut donc jamais dire ce qui manque.
 */
export const dynamic = "force-dynamic";

export const GET = withApiKey("pipeline:read", async (_request, cle) => {
  const clients = await listerClients(cle);
  return Response.json({ clients, nombre: clients.length });
});
