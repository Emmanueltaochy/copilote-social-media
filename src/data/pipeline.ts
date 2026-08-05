import type { Network } from "./content";

export type PipelineCard = {
  client: string;
  title: string;
  network: Network;
  owner: string;
  initial: string;
  /** Either a date or a waiting time, depending on the stage. */
  due: string;
  badge?: string;
};

export type PipelineStage = { label: string; cards: PipelineCard[] };

const card = (
  client: string,
  title: string,
  network: Network,
  owner: string,
  initial: string,
  due: string,
  badge?: string,
): PipelineCard => ({ client, title, network, owner, initial, due, badge });

/** Nine stages, from idea to published. A content only ever moves forward. */
export const PIPELINE: PipelineStage[] = [
  {
    label: "Idée",
    cards: [
      card("Taochy VIP", "Carrousel « Bilan de saison »", "LI", "Léa", "L", "5 sept."),
      card("Swap'Îles", "Série « Vendeurs de l'île »", "IG", "Léa", "L", "8 sept."),
    ],
  },
  {
    label: "Brief",
    cards: [
      card("Swap'Îles", "Post feed « Objectif septembre »", "IG", "Léa", "L", "31 août", "Retard 2 j"),
      card("Pokya", "Reel « Recette du chef »", "TT", "Kevin", "K", "2 sept."),
      card("Centrakor", "Carrousel « Rentrée scolaire »", "FB", "Léa", "L", "3 sept."),
    ],
  },
  {
    label: "Tournage",
    cards: [
      card("Cap Marine", "Reel « Port de Saint-Gilles »", "IG", "Noa", "N", "27 août"),
      card("AC Gym", "Série « Coachs et adhérents »", "TT", "Noa", "N", "28 août"),
    ],
  },
  {
    label: "Dérush",
    cards: [
      card("Optique de Bourbon", "Rushes collection solaire", "IG", "Noa", "N", "24 août", "Retard 1 j"),
    ],
  },
  {
    label: "Création",
    cards: [
      card("Hair by M", "Story « Avant / après »", "IG", "Kevin", "K", "26 août"),
      card("Pokya", "Post feed « Livraison express »", "IG", "Kevin", "K", "28 août"),
      card("AC Gym", "Story « Nouveaux horaires »", "IG", "Kevin", "K", "31 août"),
      card("Stéphane Plaza", "Retouches 4 visuels de biens", "LI", "Kevin", "K", "29 août"),
    ],
  },
  {
    label: "Révision interne",
    cards: [
      card("AC Gym", "Post feed « Nouveau coach »", "FB", "Léa", "L", "26 août"),
      card("Optique de Bourbon", "Carrousel « Collection solaire »", "IG", "Léa", "L", "26 août"),
      card("Stéphane Plaza", "Reel « Visite guidée T4 »", "LI", "Léa", "L", "28 août"),
    ],
  },
  {
    label: "Validation client",
    cards: [
      card("Cap Marine", "Reel « Sortie coucher de soleil »", "IG", "Client", "C", "6 j d'attente", "Relance à envoyer"),
      card("Swap'Îles", "Carrousel « Vide-grenier de septembre »", "IG", "Client", "C", "5 j d'attente", "Relance à envoyer"),
      card("Centrakor", "Story « Rentrée déco »", "IG", "Client", "C", "1 j d'attente"),
      card("Pitaya", "Post feed « Menu du midi »", "TT", "Client", "C", "8 h d'attente"),
    ],
  },
  {
    label: "Prêt à publier",
    cards: [
      card("Cap Marine", "Post feed « Sortie catamaran »", "IG", "Léa", "L", "11:00 dépassé", "Non publié"),
      card("Pitaya", "Reel « Bowl du jour »", "TT", "Léa", "L", "Aujourd'hui 12:30"),
      card("AC Gym", "Post feed « Défi d'août »", "FB", "Léa", "L", "Aujourd'hui 17:00"),
      card("Vite Frais Bien Frais", "Story « Panier du soir »", "IG", "Léa", "L", "Aujourd'hui 18:30"),
      card("Centrakor", "Post feed « Meubles de jardin »", "FB", "Léa", "L", "27 août 11:00"),
    ],
  },
  {
    label: "Publié",
    cards: [
      card("Casabona", "Story « Braderie de rentrée »", "IG", "Léa", "L", "Aujourd'hui 09:03"),
      card("Roulé Mon Z'Avirons", "Post feed « Tournée du samedi »", "FB", "Léa", "L", "21 août"),
      card("Vite Frais Bien Frais", "Post feed « Panier express »", "IG", "Léa", "L", "19 août"),
    ],
  },
];

/** A badge that names a missed deadline, rather than just a nudge. */
export const isLateBadge = (badge?: string) => !!badge && /Retard|Non publié/.test(badge);
