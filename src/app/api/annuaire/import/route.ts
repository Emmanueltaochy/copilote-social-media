import { revalidatePath } from "next/cache";
import { withApiKey } from "@/lib/api-auth";
import { devinerFichier, importer, type Fichier } from "@/lib/annuaire-import";

/**
 * Import des fichiers de l'agent ventes (prospects.json, sans-site.json).
 *
 *   POST /api/annuaire/import?fichier=prospects|sans-site
 *   Authorization: Bearer tpk_…   (clé portant le droit « annuaire:write »)
 *   Corps : le fichier JSON tel quel.
 *
 * Renvoyer le même fichier met les fiches à jour, sans doublon. Le paramètre
 * `fichier` est facultatif : la forme du JSON suffit à le reconnaître.
 */
export const dynamic = "force-dynamic";

/** Les deux fichiers font aujourd'hui quelques centaines de kilo-octets. */
const TAILLE_MAX = 5 * 1024 * 1024;

export const POST = withApiKey("annuaire:write", async (request) => {
  const longueur = Number(request.headers.get("content-length") ?? 0);
  if (longueur > TAILLE_MAX) {
    return Response.json({ error: "Fichier trop gros (5 Mo au plus)." }, { status: 413 });
  }
  const texte = await request.text();
  if (texte.length > TAILLE_MAX) {
    return Response.json({ error: "Fichier trop gros (5 Mo au plus)." }, { status: 413 });
  }

  let corps: unknown;
  try {
    corps = JSON.parse(texte);
  } catch {
    return Response.json({ error: "Le corps n'est pas du JSON valide." }, { status: 400 });
  }

  const demande = new URL(request.url).searchParams.get("fichier");
  const reconnu = devinerFichier(corps);
  if (demande && demande !== "prospects" && demande !== "sans-site") {
    return Response.json({ error: "« fichier » vaut prospects ou sans-site." }, { status: 400 });
  }
  const fichier = (demande as Fichier | null) ?? reconnu;
  if (!fichier || (reconnu && reconnu !== fichier)) {
    return Response.json(
      { error: "Forme inconnue : attendu prospects.json ou sans-site.json (une liste « prospects »)." },
      { status: 422 },
    );
  }
  const liste = (corps as { prospects?: unknown[] }).prospects ?? [];
  if (liste.length > 5000) {
    return Response.json({ error: "Plus de 5 000 fiches : découpez le fichier." }, { status: 413 });
  }

  const bilan = await importer(corps, fichier);
  revalidatePath("/contacts");
  revalidatePath("/");
  return Response.json(bilan, { status: bilan.erreurs.length ? 207 : 200 });
});
