import type { Tone } from "@/lib/tone";

/** Capacity per person, against a 140 h month. */
export const WORKLOAD: {
  initial: string;
  name: string;
  pct: string;
  label: string;
  tone: Tone;
}[] = [
  { initial: "K", name: "Kevin", pct: "92%", label: "129 h / 140 h", tone: "warn" },
  { initial: "N", name: "Noa", pct: "74%", label: "104 h / 140 h", tone: "neutral" },
  { initial: "L", name: "Léa", pct: "88%", label: "123 h / 140 h", tone: "warn" },
  { initial: "S", name: "Samir", pct: "51%", label: "71 h / 140 h", tone: "ok" },
];

/** What the numbers imply, written as decisions someone can take. */
export const ARBITRATIONS: {
  subject: string;
  impact: string;
  tone: Tone;
  text: string;
}[] = [
  {
    subject: "Swap'Îles",
    impact: "+17 h hors forfait",
    tone: "alert",
    text: "Renégocier le forfait à 2 600 € ou ramener l'engagement de 12 à 9 contenus. En l'état, le compte coûte plus qu'il ne rapporte.",
  },
  {
    subject: "Cap Marine",
    impact: "+4 h hors forfait",
    tone: "warn",
    text: "Les allers-retours de validation ont coûté 4 h de reprises. Imposer une seule série de modifications par contenu.",
  },
  {
    subject: "Kevin",
    impact: "92 % de charge",
    tone: "warn",
    text: "Sortir les retouches immobilières de son planning et les confier à un freelance en septembre.",
  },
  {
    subject: "Samir",
    impact: "51 % de charge",
    tone: "ok",
    text: "Capacité disponible : proposer une campagne ads à Optique de Bourbon et Hair by M, aujourd'hui sans budget média.",
  },
];
