import type { Tone } from "@/lib/tone";

/**
 * One content, seen from every angle. The demo content is Cap Marine's
 * "Sortie coucher de soleil" reel — the one stuck in client validation.
 */
export type PreviewKey = "Feed" | "Story" | "Reel" | "LinkedIn" | "TikTok";

export const PREVIEWS: Record<
  PreviewKey,
  { width: string; ratio: string; slot: string; excerpt: string; note: string; hint: string }
> = {
  Feed: {
    width: "300px",
    ratio: "4 / 5",
    slot: "Visuel 1080 × 1350",
    excerpt: "Le soleil descend sur le lagon, le catamaran sort du port…",
    note: "capmarine.re · il y a 2 min",
    hint: "Instagram feed · 1080 × 1350 · la légende est coupée après 125 caractères",
  },
  Story: {
    width: "232px",
    ratio: "9 / 16",
    slot: "Visuel 1080 × 1920",
    excerpt: "Sortie coucher de soleil · mercredi 16h30",
    note: "Sticker « Réserver » en bas de story",
    hint: "Instagram story · zone sûre 250px en haut et en bas",
  },
  Reel: {
    width: "232px",
    ratio: "9 / 16",
    slot: "Vidéo 0:38 · 1080 × 1920",
    excerpt: "Le soleil descend sur le lagon…",
    note: "Son original · sous-titres intégrés",
    hint: "Reel · les 3 premières secondes décident du scroll",
  },
  LinkedIn: {
    width: "336px",
    ratio: "1.91 / 1",
    slot: "Visuel 1200 × 628",
    excerpt: "Deux heures de navigation au départ de Saint-Gilles, 12 places par sortie.",
    note: "Cap Marine · 1 240 abonnés",
    hint: "LinkedIn · ton plus factuel, hashtags réduits à trois",
  },
  TikTok: {
    width: "232px",
    ratio: "9 / 16",
    slot: "Vidéo 0:38 · 1080 × 1920",
    excerpt: "POV : tu quittes le port à 16h30",
    note: "@capmarine · son tendance",
    hint: "TikTok · texte à l'écran obligatoire, pas de logo en surimpression",
  },
};

export const HASHTAGS = [
  "#capmarine",
  "#lareunion",
  "#974",
  "#catamaran",
  "#coucherdesoleil",
  "#saintgilles",
];

export const ATTACHED_ASSETS: { kind: string; name: string; rights: string; tone: Tone }[] = [
  {
    kind: "Photo",
    name: "catamaran-lagon-01.jpg",
    rights: "Droits illimités",
    tone: "ok",
  },
  { kind: "Photo", name: "equipage-apero.jpg", rights: "Droits illimités", tone: "ok" },
  {
    kind: "Vidéo",
    name: "sortie-coucher-soleil.mp4",
    rights: "Autorisation à renouveler",
    tone: "warn",
  },
];

/** Pre-flight checks. The last one is the client's, and it is still open. */
export const CHECKLIST: { label: string; by: string }[] = [
  { label: "Droits à l'image vérifiés", by: "Léa" },
  { label: "Orthographe et ton de marque relus", by: "Léa" },
  { label: "Lien de réservation testé", by: "Kevin" },
  { label: "Sous-titres intégrés à la vidéo", by: "Noa" },
  { label: "Validation client obtenue", by: "en attente" },
];

export const THREAD: {
  initial: string;
  who: string;
  when: string;
  text: string;
  isClient?: boolean;
  pin?: string;
}[] = [
  {
    initial: "L",
    who: "Léa · cheffe de projet",
    when: "20 août",
    text: "V1 envoyée au client avec la légende validée en interne.",
  },
  {
    initial: "CM",
    who: "Cap Marine · client",
    when: "21 août",
    text: "Le bateau est trop petit dans le cadre, on ne voit pas la voile. Sinon la lumière est parfaite.",
    isClient: true,
    pin: "1",
  },
  {
    initial: "K",
    who: "Kevin · graphiste",
    when: "22 août",
    text: "V2 recadrée, la voile est entière. J'ai aussi relevé les ombres.",
  },
  {
    initial: "CM",
    who: "Cap Marine · client",
    when: "23 août",
    text: "Il faut ajouter l'horaire de départ sur le visuel, pas seulement en légende.",
    isClient: true,
    pin: "2",
  },
  {
    initial: "K",
    who: "Kevin · graphiste",
    when: "24 août",
    text: "V3 avec « Départs 16h30 » en bas à droite. En attente de validation.",
  },
];

export const VERSIONS = [
  {
    tag: "V3",
    label: "Horaire ajouté sur le visuel",
    meta: "24 août · Kevin · en attente client",
    current: true,
  },
  {
    tag: "V2",
    label: "Recadrage sur la voile",
    meta: "22 août · Kevin · refusée le 23 août",
    current: false,
  },
  {
    tag: "V1",
    label: "Première proposition",
    meta: "20 août · Kevin · refusée le 21 août",
    current: false,
  },
];
