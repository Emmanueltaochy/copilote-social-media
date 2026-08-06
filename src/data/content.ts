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
