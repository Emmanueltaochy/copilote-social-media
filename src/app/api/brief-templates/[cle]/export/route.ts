import { lireModele, lireModeleParId } from "@/lib/brief-templates-data";
import { estRefuse, exigeEquipe } from "@/lib/api-session";

/**
 * Télécharge un modèle en JSON.
 *
 * Le nom porte le slug **et la version** : six mois plus tard, deux fichiers
 * du même modèle traînent dans un dossier de téléchargements, et rien d'autre
 * ne dit lequel est lequel.
 */
export const dynamic = "force-dynamic";

type Contexte = { params: Promise<{ cle: string }> };
const EST_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_request: Request, ctx: Contexte) {
  const garde = await exigeEquipe();
  if (estRefuse(garde)) return garde.refus;

  const { cle } = await ctx.params;
  const modele = EST_UUID.test(cle)
    ? await lireModeleParId(garde.user, cle)
    : await lireModele(garde.user, cle);
  if (!modele) return Response.json({ error: "Modèle introuvable." }, { status: 404 });

  // Le fichier est réimportable tel quel : ni identifiant, ni date, ni auteur —
  // rien qui appartienne à cette base-ci.
  const contenu = JSON.stringify(
    {
      slug: modele.slug,
      name: modele.name,
      description: modele.description,
      category: modele.category,
      tags: modele.tags,
      icon: modele.icon,
      version: modele.version,
      structure: modele.structure,
    },
    null,
    2,
  );

  return new Response(contenu, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${modele.slug}-v${modele.version}.json"`,
    },
  });
}
