import type { Tone } from "@/lib/tone";

export type RightsKey = "illimites" | "renouveler" | "expire";

export const RIGHTS: Record<RightsKey, { label: string; short: string; tone: Tone }> = {
  illimites: { label: "Droits illimités", short: "Illimités", tone: "ok" },
  renouveler: { label: "À renouveler", short: "À renouveler", tone: "warn" },
  expire: { label: "Droits expirés", short: "Expirés", tone: "alert" },
};

export type Asset = {
  name: string;
  client: string;
  kind: "Photo" | "Vidéo";
  shoot: string;
  ratio: string;
  dimensions: string;
  rights: RightsKey;
  /** Already used in a published content. */
  used: boolean;
  author: string;
};

const a = (
  name: string,
  client: string,
  kind: "Photo" | "Vidéo",
  shoot: string,
  ratio: string,
  dimensions: string,
  rights: RightsKey,
  used: boolean,
  author: string,
): Asset => ({ name, client, kind, shoot, ratio, dimensions, rights, used, author });

export const ASSETS: Asset[] = [
  a("catamaran-lagon-01.jpg", "Cap Marine", "Photo", "Sortie du 12 août", "4/5", "1080 × 1350", "illimites", true, "Kevin"),
  a("catamaran-voile-contrejour.jpg", "Cap Marine", "Photo", "Sortie du 12 août", "4/5", "1080 × 1350", "illimites", false, "Kevin"),
  a("sortie-coucher-soleil.mp4", "Cap Marine", "Vidéo", "Sortie du 12 août", "9/16", "1080 × 1920", "renouveler", false, "Noa"),
  a("equipage-apero.jpg", "Cap Marine", "Photo", "Sortie du 12 août", "1/1", "1080 × 1080", "illimites", true, "Kevin"),
  a("coach-yohan-portrait.jpg", "AC Gym", "Photo", "Salle du 5 août", "4/5", "1080 × 1350", "illimites", true, "Kevin"),
  a("circuit-training-reel.mp4", "AC Gym", "Vidéo", "Salle du 5 août", "9/16", "1080 × 1920", "illimites", true, "Noa"),
  a("salle-musculation-large.jpg", "AC Gym", "Photo", "Salle du 5 août", "1.91/1", "1200 × 628", "illimites", false, "Kevin"),
  a("bowl-signature-01.jpg", "Pitaya", "Photo", "Cuisine du 8 août", "1/1", "1080 × 1080", "illimites", true, "Kevin"),
  a("bowl-du-jour-tiktok.mp4", "Pitaya", "Vidéo", "Cuisine du 8 août", "9/16", "1080 × 1920", "expire", false, "Noa"),
  a("vitrine-braderie.jpg", "Casabona", "Photo", "Galerie du 18 août", "4/5", "1080 × 1350", "illimites", true, "Kevin"),
  a("rayon-rentree-deco.jpg", "Centrakor", "Photo", "Magasin du 14 août", "4/5", "1080 × 1350", "illimites", false, "Kevin"),
  a("meubles-jardin-carrousel.jpg", "Centrakor", "Photo", "Magasin du 14 août", "1/1", "1080 × 1080", "illimites", false, "Kevin"),
  a("collection-solaire-packshot.jpg", "Optique de Bourbon", "Photo", "Boutique du 10 août", "1/1", "1080 × 1080", "renouveler", false, "Kevin"),
  a("balayage-avant-apres.jpg", "Hair by M", "Photo", "Salon du 6 août", "4/5", "1080 × 1350", "illimites", true, "Kevin"),
  a("villa-saint-leu-drone.mp4", "Stéphane Plaza", "Vidéo", "Bien du 11 août", "16/9", "1920 × 1080", "illimites", true, "Noa"),
  a("panier-express-produit.jpg", "Vite Frais Bien Frais", "Photo", "Aéroport du 19 août", "1/1", "1080 × 1080", "illimites", false, "Kevin"),
  a("vendeur-du-mois.jpg", "Swap'Îles", "Photo", "Studio du 7 août", "4/5", "1080 × 1350", "expire", true, "Kevin"),
  a("tournee-samedi.jpg", "Roulé Mon Z'Avirons", "Photo", "Marché du 15 août", "1/1", "1080 × 1080", "illimites", true, "Kevin"),
];
