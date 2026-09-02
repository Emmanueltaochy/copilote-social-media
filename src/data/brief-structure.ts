/**
 * La structure d'un modèle de brief.
 *
 * Les types seulement — la validation qui les fait respecter arrive à l'étape
 * suivante, dans `src/lib/brief-structure.ts`. Le partage est le même que pour
 * le pipeline de contenus : `data/` décrit le modèle, `lib/` porte les règles.
 *
 * Pourquoi du JSON plutôt qu'une ligne par champ, comme `brief_fields` le
 * faisait : un modèle porte quinze types de champs, des conditions
 * d'affichage, des colonnes de tableau et des blocs répétables. Une table
 * relationnelle demanderait une colonne par possibilité, et surtout une valeur
 * d'énumération de plus à chaque type ajouté — donc une migration à chaque
 * fois. Ici, ajouter un type est une ligne de validation.
 */

/** Les types de champs. `heading` et `info` ne se remplissent pas : ils cadrent. */
export const TYPES_CHAMP = [
  "text",
  "textarea",
  "email",
  "phone",
  "url",
  "number",
  "currency",
  "date",
  "select",
  "radio",
  "checkbox_group",
  "checkbox",
  "table",
  "repeater",
  "priority_list",
  "heading",
  "info",
] as const;

export type TypeChamp = (typeof TYPES_CHAMP)[number];

/** Les types qui n'attendent aucune réponse : ils ne comptent pas dans la progression. */
export const TYPES_SANS_SAISIE: ReadonlySet<TypeChamp> = new Set(["heading", "info"]);

/** Les types qui exigent une liste d'options. */
export const TYPES_A_OPTIONS: ReadonlySet<TypeChamp> = new Set([
  "select",
  "radio",
  "checkbox_group",
  "priority_list",
]);

export const OPERATEURS_CONDITION = [
  "equals",
  "not_equals",
  "includes",
  "is_empty",
  "is_not_empty",
] as const;

export type OperateurCondition = (typeof OPERATEURS_CONDITION)[number];

/**
 * Une option de choix.
 *
 * `out_of_scope` est le cœur du produit : une option cochée qui sort du
 * forfait porte sa note, l'interface l'affiche au moment du clic, et le
 * récapitulatif la reprend. Le client voit le coût quand il coche, pas à la
 * livraison — c'est toute la différence entre un devis discuté et un devis
 * subi.
 */
export type OptionChamp = {
  value: string;
  label: string;
  out_of_scope?: boolean;
  note?: string;
};

/** Une colonne de tableau. */
export type ColonneTable = {
  key: string;
  label: string;
  type?: TypeChamp;
  width?: string;
};

export type ConditionAffichage = {
  field: string;
  operator: OperateurCondition;
  value?: unknown;
};

export type ChampBrief = {
  /** Unique dans **tout** le modèle, pas seulement dans sa section : c'est la
   *  clé sous laquelle la réponse est rangée, et une condition d'affichage
   *  peut viser un champ d'une autre section. */
  id: string;
  label: string;
  type: TypeChamp;
  required?: boolean;
  help?: string;
  placeholder?: string;
  /** Signale un point qui empêche d'avancer tant qu'il n'est pas tranché. */
  blocking?: boolean;
  default?: unknown;
  options?: OptionChamp[];
  columns?: ColonneTable[];
  /** Pour `repeater` : les champs répétés. */
  fields?: ChampBrief[];
  min?: number;
  max?: number;
  item_label?: string;
  visible_if?: ConditionAffichage;
};

export type SectionBrief = {
  id: string;
  title: string;
  description?: string;
  collapsible?: boolean;
  fields: ChampBrief[];
};

export type StructureBrief = {
  sections: SectionBrief[];
};

/** Les réponses, rangées par identifiant de champ. */
export type ReponsesBrief = Record<string, unknown>;

/* ------------------------------------------------------------ parcours -- */

/** Tous les champs d'une structure, y compris ceux nichés dans un `repeater`. */
export function tousLesChamps(structure: StructureBrief): ChampBrief[] {
  const sortie: ChampBrief[] = [];
  const descendre = (champs: ChampBrief[]) => {
    for (const champ of champs) {
      sortie.push(champ);
      if (champ.fields?.length) descendre(champ.fields);
    }
  };
  for (const section of structure.sections ?? []) descendre(section.fields ?? []);
  return sortie;
}

/** Les champs qui attendent réellement une réponse. */
export const champsASaisir = (structure: StructureBrief): ChampBrief[] =>
  tousLesChamps(structure).filter((c) => !TYPES_SANS_SAISIE.has(c.type));

/** Compte les sections et les champs, pour les cartes de la galerie. */
export function tailleDuModele(structure: StructureBrief): {
  sections: number;
  champs: number;
} {
  return {
    sections: structure.sections?.length ?? 0,
    champs: champsASaisir(structure).length,
  };
}
