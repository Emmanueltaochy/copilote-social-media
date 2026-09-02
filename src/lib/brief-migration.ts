import "server-only";

import { and, asc, eq, isNull, sql as raw } from "drizzle-orm";
import type { ChampBrief, OptionChamp, SectionBrief, StructureBrief } from "@/data/brief-structure";
import { briefFields, briefs, clients, db } from "@/db";

/**
 * Conversion des briefs de `brief_fields` vers `structure_snapshot` + `answers`.
 *
 * Écrite en JavaScript et non en SQL, pour trois raisons qui viennent des
 * exigences : une migration SQL est tout-ou-rien — un seul brief bancal ferait
 * échouer les autres —, elle ne sait pas journaliser brief par brief, et elle
 * ne peut pas nommer ce qui diverge. Ici chaque brief est converti dans sa
 * propre transaction : ce qui échoue est signalé, le reste passe.
 *
 * Idempotente : ne traite que les briefs sans `structure_snapshot`. La relancer
 * ne recopie rien et ne coûte qu'une requête.
 *
 * Elle ne lève jamais. Un brief non converti garde ses `brief_fields`
 * intactes — rien n'est perdu, et la panne est visible dans le journal plutôt
 * que dans un serveur qui refuse de démarrer.
 */

/**
 * Le type JSON correspondant à chaque ancien `kind`.
 *
 * ⚠️ NE PAS « CORRIGER » `oui_non` VERS `checkbox`.
 *
 * La colonne `brief_fields.answer` est du texte, et l'ancien formulaire y
 * écrivait littéralement « Oui » ou « Non » — jamais un booléen. La convertir
 * en case à cocher obligerait à interpréter cette chaîne, donc à décider ce
 * que valent « oui », « OUI », « Non applicable » ou une réponse saisie avant
 * que la liste ne soit figée. Chaque interprétation est un endroit où l'on se
 * trompe, et on se tromperait sur des réponses déjà données par des clients.
 *
 * En `radio` avec deux options, la valeur traverse sans être touchée : ce qui
 * était affiché hier s'affiche encore demain, à l'identique.
 *
 * Conséquence assumée : les modèles neufs utilisent `checkbox` pour une
 * question oui/non, les briefs convertis restent en `radio`. **Cette
 * divergence est voulue et ne se rattrape pas.** Uniformiser reviendrait à
 * réécrire des réponses passées pour satisfaire une cohérence de surface.
 */
const TYPE_DEPUIS_KIND: Record<string, ChampBrief["type"]> = {
  texte: "text",
  long: "textarea",
  choix: "select",
  oui_non: "radio",
  url: "url",
  nombre: "number",
};

const OUI_NON: OptionChamp[] = [
  { value: "Oui", label: "Oui" },
  { value: "Non", label: "Non" },
];

type LigneHeritee = typeof briefFields.$inferSelect;

/** Construit la structure et les réponses d'un brief à partir de ses anciennes lignes. */
export function convertirLignes(lignes: LigneHeritee[]): {
  structure: StructureBrief;
  answers: Record<string, unknown>;
} {
  const sections: SectionBrief[] = [];
  const answers: Record<string, unknown> = {};
  // L'ordre d'apparition fait foi : c'est celui dans lequel le client a lu le
  // questionnaire, et le renuméroter le rendrait méconnaissable.
  const indexParSection = new Map<string, number>();

  for (const ligne of lignes) {
    const titre = ligne.section;
    let position = indexParSection.get(titre);
    if (position === undefined) {
      position = sections.length;
      indexParSection.set(titre, position);
      // Identifiant tiré du rang et non du titre : deux sections peuvent
      // porter le même nom, et un identifiant en double casserait les
      // conditions d'affichage.
      sections.push({ id: `section-${position + 1}`, title: titre, fields: [] });
    }

    const champ: ChampBrief = {
      // L'identifiant de la ligne : unique par construction, donc aucune
      // collision possible entre deux questions au libellé identique.
      id: ligne.id,
      label: ligne.label,
      type: TYPE_DEPUIS_KIND[ligne.kind] ?? "text",
      required: ligne.required,
    };
    if (ligne.help) champ.help = ligne.help;
    if (ligne.kind === "oui_non") champ.options = OUI_NON;
    else if (ligne.options.length > 0) {
      champ.options = ligne.options.map((o) => ({ value: o, label: o }));
    }

    sections[position].fields.push(champ);

    // Une réponse vide n'est pas une réponse : la recopier ferait croire que
    // le champ est rempli, et fausserait la barre de progression.
    if (ligne.answer !== null && ligne.answer !== "") answers[ligne.id] = ligne.answer;
  }

  return { structure: { sections }, answers };
}

export type RapportConversion = {
  traites: number;
  convertis: number;
  echecs: { id: string; titre: string; erreur: string }[];
  divergences: { id: string; titre: string; detail: string }[];
};

export async function convertirBriefsHerites(): Promise<RapportConversion> {
  const rapport: RapportConversion = { traites: 0, convertis: 0, echecs: [], divergences: [] };

  // Ne remonter que ce qui reste à faire : un brief déjà converti, ou né en
  // JSON, n'a rien à voir ici.
  const aFaire = await db
    .select({ id: briefs.id, titre: briefs.title })
    .from(briefs)
    .where(
      and(
        isNull(briefs.structureSnapshot),
        raw`exists (select 1 from brief_fields f where f.brief_id = ${briefs.id})`,
      ),
    );

  if (aFaire.length === 0) return rapport;

  for (const brief of aFaire) {
    rapport.traites += 1;
    try {
      const lignes = await db
        .select()
        .from(briefFields)
        .where(eq(briefFields.briefId, brief.id))
        .orderBy(asc(briefFields.position), asc(briefFields.label));

      const { structure, answers } = convertirLignes(lignes);

      // La vérification porte sur deux nombres, pas un : le total des champs
      // doit être conservé, et le total des réponses aussi. Comparer les seuls
      // champs laisserait passer une réponse perdue en silence.
      const champsAttendus = lignes.length;
      const champsObtenus = structure.sections.reduce((n, s) => n + s.fields.length, 0);
      const reponsesAttendues = lignes.filter((l) => l.answer !== null && l.answer !== "").length;
      const reponsesObtenues = Object.keys(answers).length;

      if (champsAttendus !== champsObtenus || reponsesAttendues !== reponsesObtenues) {
        rapport.divergences.push({
          id: brief.id,
          titre: brief.titre,
          detail: `champs ${champsAttendus} → ${champsObtenus}, réponses ${reponsesAttendues} → ${reponsesObtenues}`,
        });
        // On n'écrit pas ce qu'on ne sait pas expliquer : le brief garde ses
        // anciennes lignes et sera repris à la main.
        continue;
      }

      await db
        .update(briefs)
        .set({ structureSnapshot: structure, answers, legacyMigratedAt: new Date() })
        .where(and(eq(briefs.id, brief.id), isNull(briefs.structureSnapshot)));

      rapport.convertis += 1;
    } catch (error) {
      // Un brief qui échoue ne doit pas emporter les suivants.
      rapport.echecs.push({
        id: brief.id,
        titre: brief.titre,
        erreur: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return rapport;
}

/** Journalise le rapport : nommément, jamais noyé dans un total. */
export function journaliserConversion(r: RapportConversion): void {
  if (r.traites === 0) return;
  console.log(`[pilot] briefs à convertir : ${r.traites} · convertis : ${r.convertis}`);

  for (const d of r.divergences) {
    console.error(`[pilot] DIVERGENCE brief « ${d.titre} » (${d.id}) : ${d.detail} — non converti`);
  }
  for (const e of r.echecs) {
    console.error(`[pilot] ÉCHEC brief « ${e.titre} » (${e.id}) : ${e.erreur}`);
  }

  const restants = r.divergences.length + r.echecs.length;
  if (restants > 0) {
    console.error(
      `[pilot] ${restants} brief(s) non converti(s). Leurs brief_fields sont intactes ; ` +
        `ils s'afficheront à l'ancienne jusqu'à reprise manuelle.`,
    );
  }
}

/**
 * Combien de briefs restent à convertir.
 *
 * Ce compteur n'est pas une curiosité : il commande la survie du rendu
 * historique. Tant qu'il n'est pas à zéro, il existe des briefs dont la
 * structure ne vit que dans `brief_fields`, et retirer l'ancien affichage les
 * rendrait **inouvrables — en silence, côté client, sur le portail**. C'est le
 * genre de panne qu'on découvre par un appel.
 *
 * La suppression de l'ancien rendu est donc conditionnée à ce compteur, jamais
 * à une date ni au fait que « la migration est passée ».
 */
export async function countUnconvertedBriefs(): Promise<number> {
  const [ligne] = await db
    .select({ n: raw<number>`count(*)::int` })
    .from(briefs)
    .where(
      and(
        isNull(briefs.legacyMigratedAt),
        raw`exists (select 1 from brief_fields f where f.brief_id = ${briefs.id})`,
      ),
    );
  return ligne?.n ?? 0;
}

/**
 * Les briefs non convertis, nommés — pour le bandeau d'alerte de `/web/briefs`.
 *
 * Nommément et non en nombre : « 3 briefs non convertis » n'indique pas
 * lesquels reprendre, et un journal serveur n'est lu par personne.
 */
export async function listUnconvertedBriefs(): Promise<
  { id: string; titre: string; clientNomCourt: string }[]
> {
  return db
    .select({ id: briefs.id, titre: briefs.title, clientNomCourt: clients.shortName })
    .from(briefs)
    .innerJoin(clients, eq(clients.id, briefs.clientId))
    .where(
      and(
        isNull(briefs.legacyMigratedAt),
        raw`exists (select 1 from brief_fields f where f.brief_id = ${briefs.id})`,
      ),
    )
    .orderBy(asc(briefs.createdAt));
}
