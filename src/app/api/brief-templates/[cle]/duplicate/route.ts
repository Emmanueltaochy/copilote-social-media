import { dupliquerModele, lireModele, lireModeleParId } from "@/lib/brief-templates-data";
import { estRefuse, exigeEquipe } from "@/lib/api-session";

/**
 * Duplique un modèle.
 *
 * C'est la seule façon de partir d'un modèle système sans le toucher, donc
 * elle doit toujours aboutir : le slug est suffixé s'il est pris plutôt que
 * de refuser.
 */
export const dynamic = "force-dynamic";

type Contexte = { params: Promise<{ cle: string }> };
const EST_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(_request: Request, ctx: Contexte) {
  const garde = await exigeEquipe();
  if (estRefuse(garde)) return garde.refus;

  const { cle } = await ctx.params;
  const source = EST_UUID.test(cle)
    ? await lireModeleParId(garde.user, cle)
    : await lireModele(garde.user, cle);
  if (!source) return Response.json({ error: "Modèle introuvable." }, { status: 404 });

  // Lire suffit pour dupliquer : la copie est neuve et n'appartient qu'à celui
  // qui la fait. Exiger le droit d'écriture sur la source empêcherait ce à
  // quoi la duplication sert — repartir d'un modèle qu'on ne peut pas modifier.
  const copie = await dupliquerModele(garde.user, source);
  return Response.json(
    { modele: { id: copie.id, slug: copie.slug, name: copie.name } },
    { status: 201 },
  );
}
