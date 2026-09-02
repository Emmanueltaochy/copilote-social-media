import { z } from "zod";
import { agregatPipeline } from "@/lib/agent-data";
import { withApiKey } from "@/lib/api-auth";

/**
 * L'état du pipeline en un appel, anomalies comprises.
 *
 * Les comptages passent par le même verrou que les listes. Sans cela, un
 * agrégat juste sur le mauvais ensemble ressemblerait à un agrégat juste : une
 * liste qui fuit se voit dans le JSON, un COUNT qui fuit ne se voit jamais.
 */
export const dynamic = "force-dynamic";

const Filtres = z.object({
  // Au-delà de combien de jours une validation client devient une relance.
  jours: z.coerce
    .number({ error: "« jours » attend un nombre." })
    .int()
    .min(1)
    .max(90, { error: "« jours » ne peut pas dépasser 90." })
    .default(3),
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

  return Response.json(await agregatPipeline(cle, lu.data));
});
