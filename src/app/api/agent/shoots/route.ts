import { z } from "zod";
import { listerTournages } from "@/lib/agent-data";
import { withApiKey } from "@/lib/api-auth";

/**
 * Les tournages à venir, leur équipe et ce qu'ils doivent produire.
 *
 * En lecture seule : savoir qu'un tournage a lieu jeudi explique pourquoi rien
 * n'est prêt mercredi, mais le déplacer reviendrait à déplacer l'agenda de
 * plusieurs personnes.
 */
export const dynamic = "force-dynamic";

const Filtres = z.object({
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
  const lu = Filtres.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!lu.success) {
    return Response.json({ error: lu.error.issues[0].message }, { status: 400 });
  }

  const tournages = await listerTournages(cle, lu.data);
  return Response.json({ tournages, nombre: tournages.length });
});
