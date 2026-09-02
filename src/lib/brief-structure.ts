import { z } from "zod";
import {
  OPERATEURS_CONDITION,
  TYPES_A_OPTIONS,
  TYPES_CHAMP,
  TYPES_SANS_SAISIE,
  type ChampBrief,
  type StructureBrief,
} from "@/data/brief-structure";

/**
 * La validation d'une structure de modèle.
 *
 * Elle sert à un usage précis : quelqu'un colle du JSON écrit à la main et
 * doit pouvoir le corriger sans deviner. D'où deux partis pris.
 *
 * Le premier : **les erreurs portent le chemin exact du champ fautif**, pas un
 * vidage de Zod. « sections[3].fields[7].options : un champ « select » a
 * besoin d'options » se corrige ; « invalid_union at path [...] » se
 * contemple.
 *
 * Le second : **ce qui est cassé est une erreur, jamais un avertissement.**
 * Une condition qui vise un champ inexistant ne se verra pas à l'usage — le
 * champ restera simplement invisible, sans que personne ne comprenne pourquoi.
 * Un avertissement que l'on peut ignorer produit exactement le bug qu'il
 * signalait.
 */

/* ------------------------------------------------------------- la forme -- */

/**
 * Les identifiants servent de clés dans `answers` et de cibles aux conditions
 * d'affichage. Restreindre le jeu de caractères évite d'avoir un jour à se
 * demander si « Raison sociale » et « raison sociale » sont le même champ.
 */
const Identifiant = z
  .string()
  .min(1, { error: "un identifiant ne peut pas être vide" })
  .max(80, { error: "un identifiant dépasse 80 caractères" })
  .regex(/^[A-Za-z0-9_-]+$/, {
    error: "un identifiant n'accepte que lettres, chiffres, tiret et souligné",
  });

const Option = z
  .object({
    value: z.string().min(1, { error: "une option a besoin d'une valeur" }),
    label: z.string().min(1, { error: "une option a besoin d'un libellé" }),
    out_of_scope: z.boolean().optional(),
    note: z.string().optional(),
  })
  .refine((o) => !o.out_of_scope || (o.note ?? "").trim().length > 0, {
    // Une option hors forfait sans note n'affiche rien au moment du clic :
    // c'est précisément le contraire de ce que la fonction sert à faire.
    error: "une option « out_of_scope » doit porter une note expliquant ce qui reste à chiffrer",
    path: ["note"],
  });

const Colonne = z.object({
  key: Identifiant,
  label: z.string().min(1, { error: "une colonne a besoin d'un libellé" }),
  type: z.enum(TYPES_CHAMP).optional(),
  width: z.string().optional(),
});

const Condition = z.object({
  field: Identifiant,
  operator: z.enum(OPERATEURS_CONDITION, {
    error: `« operator » accepte : ${OPERATEURS_CONDITION.join(", ")}`,
  }),
  value: z.unknown().optional(),
});

/**
 * Un champ. Récursif : un `repeater` contient des champs.
 *
 * Les règles propres à chaque type sont vérifiées après coup plutôt que par
 * une union discriminée — une union produit des messages qui énumèrent les
 * dix-sept formes possibles, et l'on cherche ensuite laquelle était visée.
 */
const Champ: z.ZodType<ChampBrief> = z.lazy(() =>
  z
    .object({
      id: Identifiant,
      label: z.string().min(1, { error: "un champ a besoin d'un libellé" }),
      type: z.enum(TYPES_CHAMP, {
        error: `type inconnu — les types acceptés sont : ${TYPES_CHAMP.join(", ")}`,
      }),
      required: z.boolean().optional(),
      help: z.string().optional(),
      placeholder: z.string().optional(),
      blocking: z.boolean().optional(),
      default: z.unknown().optional(),
      options: z.array(Option).optional(),
      columns: z.array(Colonne).optional(),
      fields: z.array(Champ).optional(),
      min: z.number().int().nonnegative().optional(),
      max: z.number().int().positive().optional(),
      item_label: z.string().optional(),
      visible_if: Condition.optional(),
    })
    .superRefine((champ, ctx) => {
      const ajoute = (message: string, path: string[]) =>
        ctx.addIssue({ code: "custom", message, path });

      if (TYPES_A_OPTIONS.has(champ.type) && (champ.options ?? []).length === 0) {
        ajoute(`un champ « ${champ.type} » a besoin d'au moins une option`, ["options"]);
      }
      if (champ.type === "table" && (champ.columns ?? []).length === 0) {
        ajoute("un tableau a besoin d'au moins une colonne", ["columns"]);
      }
      if (champ.type === "repeater" && (champ.fields ?? []).length === 0) {
        ajoute("un bloc répétable a besoin d'au moins un champ", ["fields"]);
      }
      if (TYPES_SANS_SAISIE.has(champ.type) && champ.required) {
        // Un titre obligatoire bloquerait une progression que rien ne peut
        // faire avancer : il n'y a rien à y saisir.
        ajoute(`un champ « ${champ.type} » ne se remplit pas : il ne peut pas être requis`, [
          "required",
        ]);
      }
      if (champ.min !== undefined && champ.max !== undefined && champ.min > champ.max) {
        ajoute(`« min » (${champ.min}) dépasse « max » (${champ.max})`, ["min"]);
      }
      if (champ.visible_if?.field === champ.id) {
        ajoute("un champ ne peut pas dépendre de lui-même", ["visible_if", "field"]);
      }
    }),
);

const Section = z.object({
  id: Identifiant,
  title: z.string().min(1, { error: "une section a besoin d'un titre" }),
  description: z.string().optional(),
  collapsible: z.boolean().optional(),
  fields: z.array(Champ),
});

export const SchemaStructure = z.object({
  sections: z.array(Section).min(1, { error: "un modèle a besoin d'au moins une section" }),
});

/* ------------------------------------------------------- la cohérence -- */

export type ErreurStructure = { chemin: string; message: string };

/** « sections[2].fields[5].options » — lisible, et copiable dans un éditeur. */
function formaterChemin(parties: readonly PropertyKey[]): string {
  return parties.reduce<string>((acc, part) => {
    if (typeof part === "number") return `${acc}[${part}]`;
    return acc ? `${acc}.${String(part)}` : String(part);
  }, "");
}

type ChampSitue = { champ: ChampBrief; chemin: string };

/** Tous les champs avec leur chemin, `repeater` compris. */
function situerLesChamps(structure: StructureBrief): ChampSitue[] {
  const sortie: ChampSitue[] = [];
  structure.sections.forEach((section, s) => {
    const descendre = (champs: ChampBrief[], base: string) => {
      champs.forEach((champ, c) => {
        const chemin = `${base}[${c}]`;
        sortie.push({ champ, chemin });
        if (champ.fields?.length) descendre(champ.fields, `${chemin}.fields`);
      });
    };
    descendre(section.fields ?? [], `sections[${s}].fields`);
  });
  return sortie;
}

/**
 * Les vérifications que la forme seule ne peut pas faire.
 *
 * Elles portent toutes sur des relations entre champs — c'est là que se
 * cachent les défauts qui ne se voient pas à la lecture, et qui se
 * manifestent bien plus tard par un champ qui ne s'affiche jamais.
 */
function verifierLaCoherence(structure: StructureBrief): ErreurStructure[] {
  const erreurs: ErreurStructure[] = [];

  // Sections : identifiants uniques.
  const vuesSections = new Map<string, number>();
  structure.sections.forEach((section, s) => {
    const premier = vuesSections.get(section.id);
    if (premier !== undefined) {
      erreurs.push({
        chemin: `sections[${s}].id`,
        message: `l'identifiant de section « ${section.id} » est déjà utilisé par sections[${premier}]`,
      });
    } else vuesSections.set(section.id, s);
  });

  const situes = situerLesChamps(structure);

  /*
   * Champs : identifiants uniques dans TOUT le modèle, pas seulement dans leur
   * section. Deux raisons, et la seconde est la vraie : les réponses sont
   * rangées à plat par identifiant — un doublon fait que la seconde réponse
   * écrase la première — et une condition d'affichage peut viser un champ
   * d'une autre section, donc l'identifiant doit désigner une seule chose.
   */
  const vus = new Map<string, string>();
  for (const { champ, chemin } of situes) {
    const premier = vus.get(champ.id);
    if (premier !== undefined) {
      erreurs.push({
        chemin: `${chemin}.id`,
        message: `l'identifiant de champ « ${champ.id} » est déjà utilisé par ${premier}`,
      });
    } else vus.set(champ.id, chemin);
  }

  // Conditions : la cible doit exister. Une référence morte est une erreur,
  // pas un avertissement — le champ resterait invisible sans que rien ne le dise.
  const connus = new Set(situes.map((s) => s.champ.id));
  for (const { champ, chemin } of situes) {
    const cible = champ.visible_if?.field;
    if (cible && !connus.has(cible)) {
      erreurs.push({
        chemin: `${chemin}.visible_if.field`,
        message: `« ${cible} » ne correspond à aucun champ du modèle`,
      });
    }
  }

  erreurs.push(...detecterLesCycles(situes));
  return erreurs;
}

/**
 * Les cycles de conditions : A ne s'affiche que si B est rempli, B que si A
 * l'est. Aucun des deux n'apparaît jamais, et rien à l'écran ne l'explique —
 * on cherche le défaut dans le rendu, jamais dans le modèle.
 */
function detecterLesCycles(situes: ChampSitue[]): ErreurStructure[] {
  const erreurs: ErreurStructure[] = [];
  const parId = new Map(situes.map((s) => [s.champ.id, s]));
  const etat = new Map<string, "en_cours" | "fini">();

  const parcourir = (id: string, pile: string[]): void => {
    if (etat.get(id) === "fini") return;
    if (etat.get(id) === "en_cours") {
      const debut = pile.indexOf(id);
      const boucle = [...pile.slice(debut), id].join(" → ");
      const situe = parId.get(id);
      erreurs.push({
        chemin: situe ? `${situe.chemin}.visible_if.field` : id,
        message: `condition circulaire : ${boucle}`,
      });
      return;
    }

    etat.set(id, "en_cours");
    const cible = parId.get(id)?.champ.visible_if?.field;
    if (cible && parId.has(cible)) parcourir(cible, [...pile, id]);
    etat.set(id, "fini");
  };

  for (const { champ } of situes) parcourir(champ.id, []);
  return erreurs;
}

/* --------------------------------------------------------- l'entrée -- */

export type ResultatValidation =
  | { ok: true; structure: StructureBrief }
  | { ok: false; erreurs: ErreurStructure[] };

/**
 * Valide une structure venue de l'extérieur — collée à la main, importée d'un
 * fichier, ou reçue par l'API.
 *
 * La forme d'abord, la cohérence ensuite : signaler une condition circulaire
 * dans un modèle dont trois champs n'ont pas de libellé noierait le message
 * utile. On ne passe à la seconde passe que si la première est propre.
 */
export function validerStructure(entree: unknown): ResultatValidation {
  const lu = SchemaStructure.safeParse(entree);
  if (!lu.success) {
    return {
      ok: false,
      erreurs: lu.error.issues.map((issue) => ({
        chemin: formaterChemin(issue.path) || "(racine)",
        message: issue.message,
      })),
    };
  }

  const structure = lu.data as StructureBrief;
  const erreurs = verifierLaCoherence(structure);
  return erreurs.length > 0 ? { ok: false, erreurs } : { ok: true, structure };
}

/** Une phrase par erreur, prête à afficher. */
export const formaterErreurs = (erreurs: ErreurStructure[]): string =>
  erreurs.map((e) => `${e.chemin} : ${e.message}`).join("\n");
