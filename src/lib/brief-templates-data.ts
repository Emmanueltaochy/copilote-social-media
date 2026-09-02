import "server-only";

import { and, asc, desc, eq, inArray, or, type SQL, sql as raw } from "drizzle-orm";
import type { StructureBrief } from "@/data/brief-structure";
import {
  briefs,
  briefTemplates,
  briefTemplateVersions,
  clients,
  db,
  users,
  type BriefTemplate,
  type User,
} from "@/db";
import { departmentsOf } from "./auth";
import { peutLire } from "./brief-templates-access";

/**
 * L'accès aux modèles de brief.
 *
 * Les routes ne composent pas de requête : elles valident, appellent d'ici, et
 * mettent en forme. Le filtre de visibilité vit donc à un seul endroit, ce qui
 * est la seule façon de ne pas l'oublier dans la neuvième route.
 */

/* ------------------------------------------------------------ visibilité -- */

/**
 * Ce qu'un compte a le droit de voir, en SQL.
 *
 * Doublon apparent avec `peutLire()` — il n'en est pas un, et la différence
 * compte : celui-ci filtre une liste avant qu'elle ne sorte de la base,
 * celui-là tranche sur une ligne déjà chargée. Les deux disent la même règle,
 * et le test d'autorisation les confronte pour qu'ils ne divergent jamais.
 */
function visiblePar(user: User): SQL {
  // Un `or` de conditions paramétrées, et non une liste construite par
  // concaténation : les pôles viennent aujourd'hui d'un ensemble fermé, mais
  // un jour quelqu'un passera ici une valeur venue d'ailleurs. C'est le motif
  // de `duPole()` dans db/queries.ts, appliqué à plusieurs pôles.
  const surUnPole = departmentsOf(user).map(
    (pole) => raw`${briefTemplates.departments} ? ${pole}`,
  );

  return or(
    eq(briefTemplates.scope, "global"),
    and(eq(briefTemplates.scope, "department"), or(...surUnPole)),
  ) as SQL;
}

export type FiltresModeles = { category?: string; tag?: string; q?: string; inactifs?: boolean };

export async function listerModeles(user: User, filtres: FiltresModeles = {}) {
  const bornes: SQL[] = [visiblePar(user)];
  if (!filtres.inactifs) bornes.push(eq(briefTemplates.isActive, true));
  if (filtres.category) bornes.push(eq(briefTemplates.category, filtres.category));
  if (filtres.tag) bornes.push(raw`${briefTemplates.tags} ? ${filtres.tag}`);
  if (filtres.q) {
    // Recherche sur le nom et la description : c'est ce dont on se souvient
    // d'un modèle six mois plus tard, pas de son slug.
    const motif = `%${filtres.q}%`;
    bornes.push(
      or(
        raw`${briefTemplates.name} ilike ${motif}`,
        raw`coalesce(${briefTemplates.description}, '') ilike ${motif}`,
      ) as SQL,
    );
  }

  return db
    .select({
      id: briefTemplates.id,
      slug: briefTemplates.slug,
      name: briefTemplates.name,
      description: briefTemplates.description,
      category: briefTemplates.category,
      tags: briefTemplates.tags,
      icon: briefTemplates.icon,
      scope: briefTemplates.scope,
      departments: briefTemplates.departments,
      isSystem: briefTemplates.isSystem,
      isActive: briefTemplates.isActive,
      version: briefTemplates.version,
      structure: briefTemplates.structure,
      updatedAt: briefTemplates.updatedAt,
    })
    .from(briefTemplates)
    .where(and(...bornes))
    .orderBy(desc(briefTemplates.isSystem), asc(briefTemplates.name));
}

/** Un modèle par son slug, si le compte a le droit de le voir. */
export async function lireModele(user: User, slug: string): Promise<BriefTemplate | null> {
  const [modele] = await db
    .select()
    .from(briefTemplates)
    .where(eq(briefTemplates.slug, slug))
    .limit(1);
  // Introuvable et interdit rendent la même chose : distinguer confirmerait
  // l'existence d'un modèle d'un autre pôle.
  return modele && peutLire(user, modele) ? modele : null;
}

export async function lireModeleParId(user: User, id: string): Promise<BriefTemplate | null> {
  const [modele] = await db.select().from(briefTemplates).where(eq(briefTemplates.id, id)).limit(1);
  return modele && peutLire(user, modele) ? modele : null;
}

/* --------------------------------------------------------------- slugs -- */

/**
 * Un slug libre, suffixé si besoin : `modele-ecole`, puis `-2`, `-3`…
 *
 * La duplication doit toujours aboutir. Échouer sur un slug déjà pris
 * obligerait à en inventer un avant même d'avoir vu la copie, alors que
 * personne ne sait comment il veut l'appeler à cet instant.
 */
export async function slugLibre(souhaite: string): Promise<string> {
  const base = souhaite.replace(/-\d+$/, "");
  const pris = new Set(
    (
      await db
        .select({ slug: briefTemplates.slug })
        .from(briefTemplates)
        .where(raw`${briefTemplates.slug} = ${base} or ${briefTemplates.slug} like ${`${base}-%`}`)
    ).map((r) => r.slug),
  );
  if (!pris.has(base)) return base;
  for (let n = 2; n < 1000; n += 1) {
    if (!pris.has(`${base}-${n}`)) return `${base}-${n}`;
  }
  // Mille copies du même modèle : on ne devine plus l'intention, on tranche.
  return `${base}-${Date.now()}`;
}

/* ------------------------------------------------------------- écritures -- */

export type NouveauModele = {
  slug: string;
  name: string;
  description?: string | null;
  category?: string | null;
  tags?: string[];
  icon?: string | null;
  structure: StructureBrief;
  scope: "global" | "department";
  departments: string[];
  isSystem?: boolean;
};

export async function creerModele(user: User, v: NouveauModele): Promise<BriefTemplate> {
  const [modele] = await db
    .insert(briefTemplates)
    .values({
      slug: v.slug,
      name: v.name,
      description: v.description ?? null,
      category: v.category ?? null,
      tags: v.tags ?? [],
      icon: v.icon ?? null,
      structure: v.structure,
      scope: v.scope,
      departments: v.scope === "global" ? [] : v.departments,
      isSystem: v.isSystem ?? false,
      createdById: user.id,
    })
    .returning();
  return modele;
}

export type ModifsModele = Partial<
  Pick<NouveauModele, "name" | "description" | "category" | "tags" | "icon" | "structure">
> & { isActive?: boolean };

/**
 * Modifie un modèle, en archivant l'état précédent.
 *
 * Les deux écritures tiennent dans **une seule transaction** : si l'archivage
 * échoue, la modification n'a pas lieu. Dans l'ordre inverse, on obtiendrait
 * une version incrémentée dont personne ne sait ce qu'elle a remplacé — c'est
 * précisément la situation où l'on voudrait revenir en arrière et où l'on ne
 * peut plus.
 *
 * La version n'est incrémentée que si la structure change. Corriger une faute
 * dans la description ne crée pas une version : l'historique doit rester
 * lisible, donc ne porter que ce qui a modifié le questionnaire.
 */
export async function modifierModele(
  user: User,
  modele: BriefTemplate,
  modifs: ModifsModele,
): Promise<BriefTemplate> {
  const structureChange =
    modifs.structure !== undefined &&
    JSON.stringify(modifs.structure) !== JSON.stringify(modele.structure);

  return db.transaction(async (tx) => {
    if (structureChange) {
      await tx.insert(briefTemplateVersions).values({
        templateId: modele.id,
        version: modele.version,
        structure: modele.structure,
        createdById: user.id,
      });
    }

    const [apres] = await tx
      .update(briefTemplates)
      .set({
        ...(modifs.name !== undefined ? { name: modifs.name } : {}),
        ...(modifs.description !== undefined ? { description: modifs.description } : {}),
        ...(modifs.category !== undefined ? { category: modifs.category } : {}),
        ...(modifs.tags !== undefined ? { tags: modifs.tags } : {}),
        ...(modifs.icon !== undefined ? { icon: modifs.icon } : {}),
        ...(modifs.structure !== undefined ? { structure: modifs.structure } : {}),
        ...(modifs.isActive !== undefined ? { isActive: modifs.isActive } : {}),
        ...(structureChange ? { version: modele.version + 1 } : {}),
        updatedAt: new Date(),
      })
      // La version attendue dans le `where` : deux modifications simultanées ne
      // peuvent pas produire deux archives portant le même numéro.
      .where(and(eq(briefTemplates.id, modele.id), eq(briefTemplates.version, modele.version)))
      .returning();

    if (!apres) {
      throw new Error("Le modèle a été modifié entre-temps : recharge et recommence.");
    }
    return apres;
  });
}

export async function supprimerModele(id: string): Promise<void> {
  await db.delete(briefTemplates).where(eq(briefTemplates.id, id));
}

/** Une copie éditable, jamais système, sur un slug libre. */
export async function dupliquerModele(user: User, source: BriefTemplate): Promise<BriefTemplate> {
  return creerModele(user, {
    slug: await slugLibre(`${source.slug}-copie`),
    name: `${source.name} (copie)`,
    description: source.description,
    category: source.category,
    tags: source.tags,
    icon: source.icon,
    structure: source.structure,
    // La copie appartient à qui la fait : un membre d'équipe qui duplique un
    // modèle global obtient un modèle de son pôle, qu'il peut modifier.
    scope: user.role === "direction" && source.scope === "global" ? "global" : "department",
    departments:
      user.role === "direction" && source.scope === "global" ? [] : departmentsOf(user),
    isSystem: false,
  });
}

/* ------------------------------------------------- création d'un brief -- */

/**
 * Crée un brief à partir d'un modèle, snapshot compris.
 *
 * Lecture et écriture dans **une seule transaction**. Sans elle, un `PATCH`
 * glissé entre les deux produirait un brief dont le snapshot ne correspond à
 * aucune version connue : ni celle qu'il déclare, ni celle qui est en base.
 * On ne s'en apercevrait qu'en cherchant à comprendre, des mois plus tard,
 * pourquoi deux briefs du même modèle ne posent pas les mêmes questions.
 */
export async function creerBriefDepuisModele(
  user: User,
  slug: string,
  clientId: string,
  titre?: string,
): Promise<{ ok: true; id: string } | { ok: false; statut: 403 | 404; message: string }> {
  return db.transaction(async (tx) => {
    const [modele] = await tx
      .select()
      .from(briefTemplates)
      .where(and(eq(briefTemplates.slug, slug), eq(briefTemplates.isActive, true)))
      .limit(1);

    if (!modele || !peutLire(user, modele)) {
      return { ok: false, statut: 404, message: "Modèle introuvable." } as const;
    }

    const [client] = await tx
      .select({ id: clients.id, nom: clients.shortName })
      .from(clients)
      .where(eq(clients.id, clientId))
      .limit(1);
    if (!client) return { ok: false, statut: 404, message: "Client introuvable." } as const;

    const [brief] = await tx
      .insert(briefs)
      .values({
        clientId,
        title: titre?.trim() || modele.name,
        templateId: modele.id,
        templateVersion: modele.version,
        structureSnapshot: modele.structure,
        answers: {},
        createdById: user.id,
      })
      .returning({ id: briefs.id });

    return { ok: true, id: brief.id } as const;
  });
}

/* ------------------------------------------------------------ utilitaires -- */

/** Les catégories réellement utilisées, pour le filtre de la galerie. */
export async function categoriesVisibles(user: User): Promise<string[]> {
  const lignes = await db
    .selectDistinct({ category: briefTemplates.category })
    .from(briefTemplates)
    .where(and(visiblePar(user), raw`${briefTemplates.category} is not null`));
  return lignes.map((l) => l.category).filter((c): c is string => Boolean(c)).sort();
}

/** L'historique d'un modèle, du plus récent au plus ancien. */
export async function versionsDuModele(templateId: string) {
  return db
    .select({
      version: briefTemplateVersions.version,
      createdAt: briefTemplateVersions.createdAt,
      auteur: users.name,
    })
    .from(briefTemplateVersions)
    .leftJoin(users, eq(users.id, briefTemplateVersions.createdById))
    .where(eq(briefTemplateVersions.templateId, templateId))
    .orderBy(desc(briefTemplateVersions.version));
}

/** Combien de briefs sont nés de chaque modèle — la seule utilité de `template_id`. */
export async function usageDesModeles(ids: string[]): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map();
  const lignes = await db
    .select({ templateId: briefs.templateId, combien: raw<number>`count(*)::int` })
    .from(briefs)
    .where(inArray(briefs.templateId, ids))
    .groupBy(briefs.templateId);
  return new Map(lignes.map((l) => [l.templateId as string, l.combien]));
}
