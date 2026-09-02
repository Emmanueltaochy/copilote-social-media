import { z } from "zod";
import { lireContenu, modifierContenu, STATUTS_CONTENU } from "@/lib/agent-data";
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

const FORMATS = ["feed", "story", "reel", "carrousel", "autre"] as const;

/**
 * Les seules colonnes qu'un agent peut écrire.
 *
 * `publieLe`, `publieUrl` et le publiant n'y sont pas et n'y seront pas : ce
 * sont les trois colonnes qui attestent qu'une personne a vu le post en ligne,
 * et le suivi calcule les retards dessus.
 *
 * `null` est distingué de l'absence : effacer une échéance se dit
 * `{"echeanceLe": null}`, ne pas y toucher se dit en n'écrivant rien.
 */
const Modifs = z
  .object({
    titre: z.string().trim().min(2).max(200).optional(),
    statut: z.enum(STATUTS_CONTENU, {
      error: `« statut » accepte : ${STATUTS_CONTENU.join(", ")}.`,
    }).optional(),
    format: z.enum(FORMATS, { error: `« format » accepte : ${FORMATS.join(", ")}.` }).optional(),
    reseaux: z.array(z.string().trim().min(1)).max(10).optional(),
    consignes: z.string().max(5000).optional(),
    legende: z.string().max(5000).optional(),
    hashtags: z.array(z.string().trim().min(1)).max(50).optional(),
    prevuLe: z.iso.datetime().nullable().optional(),
    echeanceLe: z.iso.datetime().nullable().optional(),
    responsable: z.uuid().nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    error: "Rien à modifier : le corps est vide.",
  });

export const PATCH = withApiKey<Contexte>("pipeline:write", async (request, cle, ctx) => {
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

  const lu = Modifs.safeParse(brut);
  if (!lu.success) {
    return Response.json({ error: lu.error.issues[0].message }, { status: 400 });
  }

  const { responsable, ...reste } = lu.data;
  const r = await modifierContenu(cle, id, {
    ...reste,
    ...(responsable !== undefined ? { responsableId: responsable } : {}),
  });

  if (!r.ok) return Response.json({ error: r.message }, { status: r.statut });
  return Response.json({ contenu: r.valeur });
});
