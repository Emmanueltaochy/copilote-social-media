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
