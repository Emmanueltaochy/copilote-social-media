import type { Tone } from "@/lib/tone";

export type AdSet = {
  name: string;
  spend: string;
  impressions: string;
  leads: string;
  cpl: string;
  roas: string;
  state: string;
  tone: Tone;
};

export type Creative = {
  name: string;
  kind: string;
  tag: string;
  tagTone: Tone;
  cpl: string;
  spend: string;
  note: string;
  /** The best performer gets a gold border — the only card that does. */
  best?: boolean;
};

export type Campaign = {
  id: string;
  name: string;
  client: string;
  platform: string;
  dotTone: Tone;
  status: string;
  statusTone: Tone;
  period: string;
  budget: number;
  spent: number;
  freshness: string;
  freshnessTone: Tone;
  kpis: { label: string; value: string; delta: string; tone: Tone }[];
  sets: AdSet[];
  creatives: Creative[];
};

export const CAMPAIGNS: Campaign[] = [
  {
    id: "c1",
    name: "Rentrée déco",
    client: "Centrakor",
    platform: "Meta",
    dotTone: "warn",
    status: "Budget presque épuisé",
    statusTone: "warn",
    period: "Du 1er au 31 août · budget 3 500 €",
    budget: 3500,
    spent: 3290,
    freshness: "Chiffres mis à jour ce matin par Samir",
    freshnessTone: "muted",
    kpis: [
      { label: "Dépense", value: "3 290 €", delta: "94 % du budget", tone: "warn" },
      { label: "Impressions", value: "412 800", delta: "+18 % vs. juillet", tone: "ok" },
      { label: "Leads", value: "401", delta: "+22 % vs. juillet", tone: "ok" },
      { label: "CPL", value: "8,20 €", delta: "−1,10 € vs. juillet", tone: "ok" },
      { label: "ROAS", value: "4,20", delta: "+0,6 vs. juillet", tone: "ok" },
    ],
    sets: [
      { name: "Rentrée scolaire · 25-45 ans", spend: "1 480 €", impressions: "186 400", leads: "212", cpl: "6,98 €", roas: "5,10", state: "Active", tone: "ok" },
      { name: "Déco maison · retargeting", spend: "980 €", impressions: "112 300", leads: "121", cpl: "8,10 €", roas: "4,30", state: "Active", tone: "ok" },
      { name: "Meubles jardin · large", spend: "620 €", impressions: "88 100", leads: "52", cpl: "11,92 €", roas: "2,40", state: "À surveiller", tone: "warn" },
      { name: "Test créa vidéo", spend: "210 €", impressions: "26 000", leads: "16", cpl: "13,13 €", roas: "1,80", state: "En pause", tone: "neutral" },
    ],
    creatives: [
      { name: "Carrousel « Rentrée maligne »", kind: "Carrousel", tag: "Meilleure", tagTone: "ok", cpl: "6,40 €", spend: "1 180 €", note: "42 % des leads de la campagne", best: true },
      { name: "Photo « Bureau enfant »", kind: "Photo", tag: "Stable", tagTone: "neutral", cpl: "8,90 €", spend: "940 €", note: "Fatigue à partir du 20 août" },
      { name: "Vidéo « Rangement 30 s »", kind: "Vidéo", tag: "Faible", tagTone: "warn", cpl: "13,10 €", spend: "610 €", note: "À remplacer avant le 28 août" },
      { name: "Photo « Salon complet »", kind: "Photo", tag: "Stable", tagTone: "neutral", cpl: "9,20 €", spend: "560 €", note: "Diffusée depuis le 8 août" },
    ],
  },
  {
    id: "c2",
    name: "Search marque et générique",
    client: "Swap'Îles",
    platform: "Google",
    dotTone: "alert",
    status: "CPL au-dessus de la cible",
    statusTone: "alert",
    period: "Du 1er au 31 août · budget 1 600 €",
    budget: 1600,
    spent: 1150,
    freshness: "Chiffres mis à jour il y a 6 jours par Samir",
    freshnessTone: "warn",
    kpis: [
      { label: "Dépense", value: "1 150 €", delta: "72 % du budget", tone: "neutral" },
      { label: "Impressions", value: "94 200", delta: "−6 % vs. juillet", tone: "warn" },
      { label: "Leads", value: "62", delta: "−18 % vs. juillet", tone: "alert" },
      { label: "CPL", value: "18,40 €", delta: "cible 12,00 €", tone: "alert" },
      { label: "ROAS", value: "2,10", delta: "−0,9 vs. juillet", tone: "alert" },
    ],
    sets: [
      { name: "Marque · exact", spend: "310 €", impressions: "12 400", leads: "34", cpl: "9,12 €", roas: "3,80", state: "Active", tone: "ok" },
      { name: "Générique · vide-grenier", spend: "520 €", impressions: "58 300", leads: "19", cpl: "27,37 €", roas: "1,20", state: "À arrêter", tone: "alert" },
      { name: "Concurrents", spend: "220 €", impressions: "18 900", leads: "7", cpl: "31,43 €", roas: "0,90", state: "À arrêter", tone: "alert" },
      { name: "Display remarketing", spend: "100 €", impressions: "4 600", leads: "2", cpl: "50,00 €", roas: "0,40", state: "En pause", tone: "neutral" },
    ],
    creatives: [
      { name: "Annonce « Vendez près de chez vous »", kind: "Texte", tag: "Meilleure", tagTone: "ok", cpl: "9,10 €", spend: "310 €", note: "55 % des leads de la campagne", best: true },
      { name: "Annonce « Vide-grenier septembre »", kind: "Texte", tag: "Faible", tagTone: "warn", cpl: "27,40 €", spend: "520 €", note: "Requête trop large" },
      { name: "Bannière display 300×250", kind: "Display", tag: "Faible", tagTone: "alert", cpl: "50,00 €", spend: "100 €", note: "À couper immédiatement" },
    ],
  },
  {
    id: "c3",
    name: "Bowl du jour",
    client: "Pitaya",
    platform: "TikTok",
    dotTone: "alert",
    status: "Diffusion arrêtée",
    statusTone: "alert",
    period: "Du 1er au 31 août · budget 400 €",
    budget: 400,
    spent: 152,
    freshness: "Chiffres mis à jour il y a 5 jours par Samir",
    freshnessTone: "warn",
    kpis: [
      { label: "Dépense", value: "152 €", delta: "38 % du budget", tone: "alert" },
      { label: "Impressions", value: "68 400", delta: "+4 % vs. juillet", tone: "neutral" },
      { label: "Leads", value: "48", delta: "−12 % vs. juillet", tone: "warn" },
      { label: "CPL", value: "3,17 €", delta: "−0,40 € vs. juillet", tone: "ok" },
      { label: "ROAS", value: "6,40", delta: "+1,2 vs. juillet", tone: "ok" },
    ],
    sets: [
      { name: "Déjeuner · Saint-Denis", spend: "92 €", impressions: "41 200", leads: "31", cpl: "2,97 €", roas: "6,80", state: "Arrêtée", tone: "alert" },
      { name: "Étudiants · campus", spend: "60 €", impressions: "27 200", leads: "17", cpl: "3,53 €", roas: "5,60", state: "Arrêtée", tone: "alert" },
    ],
    creatives: [
      { name: "Reel « Bowl signature »", kind: "Vidéo", tag: "Meilleure", tagTone: "ok", cpl: "2,90 €", spend: "92 €", note: "Le CPL le plus bas de tous les comptes", best: true },
      { name: "Reel « Préparation express »", kind: "Vidéo", tag: "Stable", tagTone: "neutral", cpl: "3,50 €", spend: "60 €", note: "Diffusion interrompue le 22 août" },
    ],
  },
];
