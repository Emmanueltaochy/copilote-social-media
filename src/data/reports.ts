import type { Tone } from "@/lib/tone";

export type PostStat = {
  kind: string;
  title: string;
  date: string;
  /** "—" means never captured — the gap the stats screen exists to close. */
  reach: string;
  engagement: string;
  clicks: string;
};

export const POSTS: PostStat[] = [
  { kind: "FEED", title: "Carrousel « Flotte 2026 »", date: "04/08", reach: "6 420", engagement: "412", clicks: "88" },
  { kind: "STO", title: "Story « Test de vue offert »", date: "06/08", reach: "3 180", engagement: "96", clicks: "24" },
  { kind: "REEL", title: "Reel « Balayage été »", date: "10/08", reach: "11 240", engagement: "1 020", clicks: "142" },
  { kind: "FEED", title: "Post feed « Vendeur du mois »", date: "11/08", reach: "4 860", engagement: "318", clicks: "61" },
  { kind: "REEL", title: "Reel « Bowl signature »", date: "13/08", reach: "9 740", engagement: "742", clicks: "119" },
  { kind: "FEED", title: "Post feed « Panier express »", date: "19/08", reach: "5 210", engagement: "286", clicks: "74" },
  { kind: "STO", title: "Story « Braderie de rentrée »", date: "25/08", reach: "4 130", engagement: "168", clicks: "39" },
  { kind: "FEED", title: "Post feed « Coulisses studio »", date: "14/08", reach: "3 420", engagement: "204", clicks: "45" },
  { kind: "REEL", title: "Reel « Sortie coucher de soleil »", date: "20/08", reach: "—", engagement: "—", clicks: "—" },
];

export const REPORT_ADS = [
  { name: "Meta · Notoriété locale", spend: "1 200 €", leads: "148", cpl: "8,11 €", roas: "3,90" },
  { name: "Google · Recherche marque", spend: "600 €", leads: "64", cpl: "9,38 €", roas: "4,60" },
];

export const NEXT_MONTH = [
  "Rattraper les 3 contenus non publiés en août avec deux publications supplémentaires la première semaine de septembre.",
  "Remplacer la vidéo « Rangement 30 s » qui fatigue depuis le 20 août par la créa carrousel la plus performante.",
  "Programmer un shooting en début de mois pour éviter la pénurie de visuels constatée en deuxième quinzaine.",
];

export const DATA_FRESHNESS: { label: string; age: string; tone: Tone }[] = [
  { label: "Statistiques Instagram", age: "il y a 9 j · Léa", tone: "alert" },
  { label: "Chiffres Meta Ads", age: "ce matin · Samir", tone: "ok" },
  { label: "Chiffres Google Ads", age: "il y a 6 j · Samir", tone: "warn" },
];

export const REPORT_CLIENTS = ["Cap Marine", "AC Gym", "Centrakor", "Pitaya"];
