import { z } from "zod";
import { validerStructure } from "@/lib/brief-structure";
import { peutCreer } from "@/lib/brief-templates-access";
import { categoriesVisibles, creerModele, listerModeles, slugLibre } from "@/lib/brief-templates-data";
import { estRefuse, exigeEquipe } from "@/lib/api-session";

/** La galerie des modèles, et la création d'un modèle. */
export const dynamic = "force-dynamic";

const Filtres = z.object({
  category: z.string().max(80).optional(),
  tag: z.string().max(80).optional(),
  q: z.string().max(200).optional(),
  inactifs: z.coerce.boolean().optional(),
});

export async function GET(request: Request) {
  const garde = await exigeEquipe();
  if (estRefuse(garde)) return garde.refus;

  const lu = Filtres.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!lu.success) return Response.json({ error: lu.error.issues[0].message }, { status: 400 });

  const [modeles, categories] = await Promise.all([
    listerModeles(garde.user, lu.data),
    categoriesVisibles(garde.user),
  ]);
  return Response.json({ modeles, categories, nombre: modeles.length });
}

const Creation = z.object({
  slug: z
    .string()
    .trim()
    .min(3, { error: "Le slug fait au moins 3 caractères." })
    .max(80)
    .regex(/^[a-z0-9][a-z0-9-]*$/, {
      error: "Le slug n'accepte que minuscules, chiffres et tirets.",
    }),
  name: z.string().trim().min(2, { error: "Donne un nom au modèle." }).max(120),
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

  let brut: unknown;
  try {
    brut = await request.json();
  } catch {
    return Response.json({ error: "Corps de requête illisible : attendu du JSON." }, { status: 400 });
  }

  const lu = Creation.safeParse(brut);
  if (!lu.success) return Response.json({ error: lu.error.issues[0].message }, { status: 400 });

  const departments = lu.data.scope === "global" ? [] : (lu.data.departments ?? []);
  if (!peutCreer(garde.user, { scope: lu.data.scope, departments })) {
    return Response.json(
      {
        error:
          lu.data.scope === "global"
            ? "Un modèle global ne se crée que par la direction."
            : "Tu ne peux créer un modèle que pour un pôle dont tu fais partie.",
      },
      { status: 403 },
    );
  }

  // La structure passe par le même validateur que l'import : un modèle créé
  // par l'API ne doit pas pouvoir entrer dans un état qu'un import refuserait.
  const structure = validerStructure(lu.data.structure);
  if (!structure.ok) return Response.json({ error: "Structure invalide.", details: structure.erreurs }, { status: 422 });

  // Le slug demandé est suffixé s'il est pris : la création aboutit toujours,
  // et la réponse dit lequel a été retenu.
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

  return Response.json({ modele: { id: modele.id, slug: modele.slug } }, { status: 201 });
}
