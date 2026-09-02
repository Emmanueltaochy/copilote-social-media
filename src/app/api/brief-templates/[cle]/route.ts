import { z } from "zod";
import { validerStructure } from "@/lib/brief-structure";
import { peutEcrire, peutSupprimer } from "@/lib/brief-templates-access";
import {
  lireModele,
  lireModeleParId,
  modifierModele,
  supprimerModele,
  usageDesModeles,
  versionsDuModele,
} from "@/lib/brief-templates-data";
import { estRefuse, exigeEquipe } from "@/lib/api-session";
import type { User } from "@/db";

/**
 * Un modèle : le lire, le modifier, le supprimer.
 *
 * La clé d'adresse accepte le slug ou l'identifiant. Un seul segment
 * dynamique, parce que Next n'en admet qu'un par niveau — et parce qu'obliger
 * à connaître lequel des deux la route attend est une friction gratuite.
 */
export const dynamic = "force-dynamic";

type Contexte = { params: Promise<{ cle: string }> };

const EST_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const retrouver = (user: User, cle: string) =>
  EST_UUID.test(cle) ? lireModeleParId(user, cle) : lireModele(user, cle);

/** Introuvable et interdit rendent le même 404 : distinguer confirmerait l'existence. */
const introuvable = () => Response.json({ error: "Modèle introuvable." }, { status: 404 });

export async function GET(_request: Request, ctx: Contexte) {
  const garde = await exigeEquipe();
  if (estRefuse(garde)) return garde.refus;

  const { cle } = await ctx.params;
  const modele = await retrouver(garde.user, cle);
  if (!modele) return introuvable();

  const [versions, usage] = await Promise.all([
    versionsDuModele(modele.id),
    usageDesModeles([modele.id]),
  ]);

  return Response.json({
    modele,
    versions,
    briefsCrees: usage.get(modele.id) ?? 0,
    // Ce que le compte a le droit de faire : l'interface s'en sert pour ne pas
    // proposer un bouton qui répondra 403.
    droits: {
      modifier: peutEcrire(garde.user, modele),
      supprimer: peutSupprimer(garde.user, modele),
    },
  });
}

const Modifs = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    description: z.string().max(500).nullish(),
    category: z.string().max(80).nullish(),
    tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
    icon: z.string().max(16).nullish(),
    isActive: z.boolean().optional(),
    structure: z.unknown().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { error: "Rien à modifier : le corps est vide." });

export async function PATCH(request: Request, ctx: Contexte) {
  const garde = await exigeEquipe();
  if (estRefuse(garde)) return garde.refus;

  const { cle } = await ctx.params;
  const modele = await retrouver(garde.user, cle);
  if (!modele) return introuvable();

  if (!peutEcrire(garde.user, modele)) {
    return Response.json(
      {
        error:
          modele.scope === "global"
            ? "Un modèle global ne se modifie que par la direction."
            : "Ce modèle appartient à un autre pôle.",
      },
      { status: 403 },
    );
  }

  let brut: unknown;
  try {
    brut = await request.json();
  } catch {
    return Response.json({ error: "Corps de requête illisible : attendu du JSON." }, { status: 400 });
  }

  const lu = Modifs.safeParse(brut);
  if (!lu.success) return Response.json({ error: lu.error.issues[0].message }, { status: 400 });

  const { structure: brute, ...reste } = lu.data;
  let structure;
  if (brute !== undefined) {
    const valide = validerStructure(brute);
    if (!valide.ok) {
      return Response.json({ error: "Structure invalide.", details: valide.erreurs }, { status: 422 });
    }
    structure = valide.structure;
  }

  try {
    const apres = await modifierModele(garde.user, modele, {
      ...reste,
      ...(structure !== undefined ? { structure } : {}),
    });
    return Response.json({ modele: { id: apres.id, slug: apres.slug, version: apres.version } });
  } catch (error) {
    // La version attendue n'était plus celle en base : quelqu'un a modifié
    // entre-temps. 409, pas 500 — la demande était bonne, l'état a bougé.
    if (error instanceof Error && error.message.includes("modifié entre-temps")) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    console.error("[pilot] modification de modèle", error);
    return Response.json({ error: "Erreur interne." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, ctx: Contexte) {
  const garde = await exigeEquipe();
  if (estRefuse(garde)) return garde.refus;

  const { cle } = await ctx.params;
  const modele = await retrouver(garde.user, cle);
  if (!modele) return introuvable();

  if (modele.isSystem) {
    return Response.json(
      {
        error:
          "Un modèle système ne se supprime pas : duplique-le pour obtenir une copie modifiable, ou archive-le.",
      },
      { status: 403 },
    );
  }
  if (!peutSupprimer(garde.user, modele)) {
    return Response.json({ error: "Ce modèle appartient à un autre pôle." }, { status: 403 });
  }

  await supprimerModele(modele.id);
  // Les briefs déjà créés ne bougent pas : leur `template_id` passe à vide,
  // leur `structure_snapshot` reste intact. On perd la traçabilité, jamais le
  // questionnaire.
  return Response.json({ ok: true });
}
