import type { ContentStatus, Network } from "./content";

export type CalendarEntry = {
  day: number;
  client: string;
  title: string;
  network: Network;
  time: string;
  status: ContentStatus;
  format: string;
};

const raw: [number, string, string, Network, string, ContentStatus, string][] = [
  [3, "Casabona", "Post feed « Soldes d'hiver »", "IG", "08:30", "done", "feed"],
  [3, "AC Gym", "Reel « Circuit training »", "TT", "18:00", "done", "reel"],
  [4, "Cap Marine", "Carrousel « Flotte 2026 »", "IG", "10:00", "done", "carrousel"],
  [5, "Pokya", "Post feed « Nouveau menu »", "FB", "11:30", "done", "feed"],
  [6, "Optique de Bourbon", "Story « Test de vue offert »", "IG", "09:00", "done", "story"],
  [7, "Centrakor", "Post feed « Rangement malin »", "FB", "17:00", "done", "feed"],
  [10, "Hair by M", "Reel « Balayage été »", "IG", "12:00", "done", "reel"],
  [11, "Swap'Îles", "Post feed « Vendeur du mois »", "IG", "10:30", "done", "feed"],
  [12, "Stéphane Plaza", "Carrousel « Villa Saint-Leu »", "LI", "09:30", "done", "carrousel"],
  [13, "Pitaya", "Reel « Bowl signature »", "TT", "12:30", "done", "reel"],
  [14, "Taochy VIP", "Post feed « Coulisses studio »", "LI", "16:00", "done", "feed"],
  [17, "Centrakor", "Story « Rentrée déco »", "IG", "09:00", "client", "story"],
  [18, "AC Gym", "Post feed « Nouveau coach »", "FB", "18:30", "review", "feed"],
  [19, "Vite Frais Bien Frais", "Post feed « Panier express »", "IG", "07:30", "done", "feed"],
  [20, "Cap Marine", "Reel « Sortie coucher de soleil »", "IG", "18:00", "client", "reel"],
  [21, "Roulé Mon Z'Avirons", "Post feed « Tournée du samedi »", "FB", "10:00", "done", "feed"],
  [24, "Swap'Îles", "Carrousel « Vide-grenier de septembre »", "IG", "11:00", "client", "carrousel"],
  [25, "Casabona", "Story « Braderie de rentrée »", "IG", "09:00", "done", "story"],
  [25, "Cap Marine", "Post feed « Sortie catamaran »", "IG", "11:00", "missed", "feed"],
  [25, "Pitaya", "Reel « Bowl du jour »", "TT", "12:30", "ready", "reel"],
  [25, "AC Gym", "Post feed « Défi d'août »", "FB", "17:00", "ready", "feed"],
  [25, "Vite Frais Bien Frais", "Story « Panier du soir »", "IG", "18:30", "ready", "story"],
  [26, "Optique de Bourbon", "Carrousel « Collection solaire »", "IG", "10:00", "review", "carrousel"],
  [26, "Hair by M", "Story « Avant / après »", "IG", "15:00", "prod", "story"],
  [27, "Cap Marine", "Reel « Tournage port de Saint-Gilles »", "IG", "19:00", "prod", "reel"],
  [27, "Centrakor", "Post feed « Meubles de jardin »", "FB", "11:00", "ready", "feed"],
  [28, "Pokya", "Post feed « Livraison express »", "IG", "12:00", "prod", "feed"],
  [28, "Stéphane Plaza", "Reel « Visite guidée T4 »", "LI", "17:30", "review", "reel"],
  [29, "Taochy VIP", "Carrousel « Bilan de saison »", "LI", "10:00", "idea", "carrousel"],
  [31, "Swap'Îles", "Post feed « Objectif septembre »", "IG", "09:30", "idea", "feed"],
  [31, "AC Gym", "Story « Nouveaux horaires »", "IG", "08:00", "prod", "story"],
];

export const CALENDAR: CalendarEntry[] = raw.map(
  ([day, client, title, network, time, status, format]) => ({
    day,
    client,
    title,
    network,
    time,
    status,
    format,
  }),
);

export const WEEK_DAYS = [
  "Lundi",
  "Mardi",
  "Mercredi",
  "Jeudi",
  "Vendredi",
  "Samedi",
  "Dimanche",
];

/**
 * August 2026 starts on a Saturday, so the Monday-first grid opens with the
 * last 5 days of July. 42 cells = 6 rows of 7, the only layout that never
 * reflows between months.
 */
export const LEADING_BLANKS = 5;
export const CELL_COUNT = 42;
