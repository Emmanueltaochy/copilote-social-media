import { z } from "zod";
import { formaterErreurs, validerStructure } from "@/lib/brief-structure";
import { peutCreer } from "@/lib/brief-templates-access";
import { creerModele, slugLibre } from "@/lib/brief-templates-data";
import { estRefuse, exigeEquipe } from "@/lib/api-session";

/**
 * Importe un modèle depuis un fichier JSON.
 *
 * Passe par le validateur de la structure et rend **exactement les mêmes
 * messages** que partout ailleurs : celui qui colle du JSON à la main doit
 * lire le chemin du champ fautif, pas un « import impossible ».
 */
export const dynamic = "force-dynamic";

/**
 * Un modèle, même très fourni, pèse quelques dizaines de kilo-octets. Le
 * plafond n'est pas là pour les modèles honnêtes : il évite qu'un fichier de
 * plusieurs mégaoctets soit analysé en mémoire avant d'être refusé.
 */
const TAILLE_MAX = 512 * 1024;

const Enveloppe = z.object({
  slug: z
    .string()
    .trim()
    .min(3)
    .max(80)
    .regex(/^[a-z0-9][a-z0-9-]*$/, { error: "Le slug n'accepte que minuscules, chiffres et tirets." }),
  name: z.string().trim().min(2).max(120),
  description: z.string().max(500).nullish(),
  category: z.string().max(80).nullish(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  icon: z.string().max(16).nullish(),
  scope: z.enum(["global", "department"]).default("department"),
  departments: z.array(z.enum(["social", "web"])).max(2).optional(),
  structure: z.unknown(),
});

export async function POST(request: Request) {
  const garde = await exigeEquipe();
  if (estRefuse(garde)) return garde.refus;

  const annonce = Number(request.headers.get("content-length") ?? 0);
  if (annonce > TAILLE_MAX) {
    return Response.json(
      { error: `Fichier trop volumineux (${Math.round(annonce / 1024)} Ko, maximum 512 Ko).` },
      { status: 413 },
    );
  }

  const texte = await request.text();
  // L'en-tête peut mentir ou manquer : on revérifie sur ce qu'on a réellement lu.
  if (texte.length > TAILLE_MAX) {
    return Response.json({ error: "Fichier trop volumineux (maximum 512 Ko)." }, { status: 413 });
  }

  let brut: unknown;
  try {
    brut = JSON.parse(texte);
  } catch (error) {
    // Le message de l'analyseur donne la position du caractère fautif : c'est
    // exactement ce qu'il faut pour retrouver une virgule en trop.
    return Response.json(
      { error: `JSON illisible : ${error instanceof Error ? error.message : "format invalide"}` },
      { status: 400 },
    );
  }

  const lu = Enveloppe.safeParse(brut);
  if (!lu.success) {
    return Response.json(
      { error: lu.error.issues[0].message, champ: lu.error.issues[0].path.join(".") },
      { status: 400 },
    );
  }

  const departments = lu.data.scope === "global" ? [] : (lu.data.departments ?? []);
  if (!peutCreer(garde.user, { scope: lu.data.scope, departments })) {
    return Response.json(
      { error: "Tu n'as pas le droit de créer un modèle avec cette portée." },
      { status: 403 },
    );
  }

  const structure = validerStructure(lu.data.structure);
  if (!structure.ok) {
    return Response.json(
      {
        error: "Structure invalide.",
        details: structure.erreurs,
        // La même chose en une phrase par ligne, prête à afficher telle quelle.
        lisible: formaterErreurs(structure.erreurs),
      },
      { status: 422 },
    );
  }

  // Un import ne remplace jamais un modèle existant : il en crée un à côté,
  // sur un slug libre. Écraser silencieusement le travail de quelqu'un parce
  // que deux fichiers portent le même slug serait la pire des surprises.
  const slug = await slugLibre(lu.data.slug);
  const modele = await creerModele(garde.user, {
    slug,
    name: lu.data.name,
    description: lu.data.description ?? null,
    category: lu.data.category ?? null,
    tags: lu.data.tags ?? [],
    icon: lu.data.icon ?? null,
    structure: structure.structure,
    scope: lu.data.scope,
    departments,
  });

  return Response.json(
    {
      modele: { id: modele.id, slug: modele.slug, name: modele.name },
      slugModifie: slug !== lu.data.slug ? { demande: lu.data.slug, retenu: slug } : null,
    },
    { status: 201 },
  );
}
