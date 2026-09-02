import type { Tone } from "@/lib/tone";

/** Les étapes par lesquelles passe un contenu, dans l'ordre du pipeline. */
export const CONTENT_STAGES = [
  "idee",
  "brief",
  "tournage",
  "derush",
  "creation",
  "revision",
  "validation",
  "pret",
  "publie",
] as const;

export type ContentStatus = (typeof CONTENT_STAGES)[number] | "manque";

/**
 * Les étapes qu'un contenu peut sauter.
 *
 * Déclarées ici plutôt que codées en dur dans la règle de transition : le jour
 * où une étape change de nature, c'est une ligne à déplacer, à l'endroit où le
 * pipeline est décrit.
 *
 * Deux listes, et la distinction compte — voir plus bas.
 */

/**
 * Facultatives par nature.
 *
 * Un carrousel ou une actualité ne se tourne pas, et n'a rien à dérusher :
 * exiger qu'il traverse un tournage à vide obligerait à mentir au pipeline
 * pour le satisfaire, et un pipeline auquel on ment cesse d'être un état des
 * lieux. Le brief suit la même logique — on le saute souvent pour un carrousel
 * ou une actualité, où il n'y a rien à briefer.
 */
const SAUTABLES_PAR_NATURE = ["brief", "tournage", "derush"] as const;

/**
 * Facultatives **faute de modèle**, et non par nature. C'est une dette, pas
 * une décision.
 *
 * La révision interne est obligatoire chez certains clients et inutile chez
 * d'autres. Aucune colonne ne dit lesquels : la contrainte est réelle, elle
 * n'est simplement pas modélisée. La rendre obligatoire pour tous ferait
 * refuser un geste légitime — et une règle qui refuse un geste légitime se
 * fait contourner, ce qui coûte la règle entière, pas seulement ce cas-là.
 *
 * Le jour où `clients` porte un « révision interne exigée », c'est cette
 * liste-ci qu'il faut vider, et la règle de transition qui doit consulter le
 * client plutôt qu'une constante. Ne pas confondre avec la liste au-dessus :
 * celle-là restera vraie.
 */
const SAUTABLES_FAUTE_DE_MODELE = ["revision"] as const;

export const ETAPES_FACULTATIVES: ReadonlySet<ContentStatus> = new Set([
  ...SAUTABLES_PAR_NATURE,
  ...SAUTABLES_FAUTE_DE_MODELE,
]);

export const CONTENT_STATUS: Record<
  ContentStatus,
  { label: string; tone: Tone; solidDot: boolean }
> = {
  idee: { label: "Idée", tone: "muted", solidDot: false },
  brief: { label: "Brief", tone: "muted", solidDot: false },
  tournage: { label: "Tournage", tone: "neutral", solidDot: true },
  derush: { label: "Dérush", tone: "neutral", solidDot: true },
  creation: { label: "En création", tone: "neutral", solidDot: true },
  revision: { label: "Révision interne", tone: "warn", solidDot: true },
  validation: { label: "Validation client", tone: "warn", solidDot: true },
  pret: { label: "Prêt à publier", tone: "info", solidDot: true },
  publie: { label: "Publié", tone: "ok", solidDot: true },
  manque: { label: "Non publié", tone: "alert", solidDot: true },
};

/**
 * Les réseaux visés par un contenu.
 *
 * Un même post part souvent sur Instagram et Facebook : c'est une production,
 * pas deux. La liste fait foi, et le réseau seul sert de repli pour tout ce qui
 * a été saisi avant qu'on puisse en cocher plusieurs.
 */
export function networksOf(x: { network: string; networks?: string[] | null }): string[] {
  return x.networks && x.networks.length > 0 ? x.networks : [x.network];
}

/** « Instagram · Facebook » — l'ordre est celui qui a été coché. */
export function networksLabel(x: { network: string; networks?: string[] | null }): string {
  return networksOf(x)
    .map((n) => NETWORK_LABEL[n] ?? n)
    .join(" · ");
}

export const NETWORK_LABEL: Record<string, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
  google: "Google",
};

/**
 * Le format du contenu.
 *
 * Ce n'est pas une étiquette décorative : un reel se tourne, un carrousel se
 * compose, un post feed se cadre. Le format décide de qui travaille dessus et
 * de ce qu'on attend au moment de valider — il est donc affiché partout où le
 * contenu apparaît.
 */
export const CONTENT_KIND: Record<string, string> = {
  feed: "Post feed",
  story: "Story",
  reel: "Reel vidéo",
  carrousel: "Carrousel",
  autre: "Autre",
};
