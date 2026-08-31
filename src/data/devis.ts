import type { Tone } from "@/lib/tone";

/**
 * Ce qu'un client peut demander, et où en est sa demande.
 *
 * Les natures sont écrites du point de vue du client — « un site », « des
 * contenus » — et non dans le vocabulaire de l'agence. Un client ne sait pas
 * ce qu'est un « pôle », il sait ce qu'il veut.
 */
export const DEVIS_KIND: Record<string, { label: string; aide: string }> = {
  site: {
    label: "Un site internet",
    aide: "Création, refonte, boutique en ligne, page de vente.",
  },
  social: {
    label: "Des contenus réseaux sociaux",
    aide: "Publications, reels, community management.",
  },
  shooting: {
    label: "Un shooting photo ou vidéo",
    aide: "Reportage, portraits, tournage produit.",
  },
  ads: {
    label: "De la publicité",
    aide: "Campagnes Meta, Google, TikTok.",
  },
  autre: {
    label: "Autre chose",
    aide: "Décrivez-le, on vous rappelle.",
  },
};

export const DEVIS_STATUS: Record<string, { label: string; client: string; tone: Tone }> = {
  nouvelle: { label: "Nouvelle", client: "Bien reçue", tone: "info" },
  en_cours: { label: "En cours de chiffrage", client: "En cours de chiffrage", tone: "warn" },
  envoye: { label: "Devis envoyé", client: "Devis envoyé", tone: "ok" },
  clos: { label: "Close", client: "Close", tone: "muted" },
};

export const DEVIS_STATUSES = ["nouvelle", "en_cours", "envoye", "clos"] as const;
export type DevisStatus = (typeof DEVIS_STATUSES)[number];
