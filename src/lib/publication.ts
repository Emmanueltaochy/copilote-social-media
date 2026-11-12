import { networksOf } from "@/data/content";

/*
 * Ce qui doit être réuni pour qu'un contenu parte tout seul chez Metricool.
 * Fonction pure : la fiche, la page « À publier » et le serveur (au moment de
 * programmer) lisent la même liste, donc l'écran ne promet jamais ce que le
 * serveur refuserait.
 */

/** Les réseaux de Pilot que Metricool sait publier. */
export const SCHEDULABLE = ["instagram", "facebook", "linkedin", "tiktok"] as const;

/**
 * Pilot garde l'heure de La Réunion telle quelle (« 18:00 » est enregistré
 * 18:00 UTC) : l'instant réel est 4 h plus tôt.
 */
export const WALL_OFFSET_MS = 4 * 3_600_000;
export const realInstant = (scheduledAt: Date) => new Date(scheduledAt.getTime() - WALL_OFFSET_MS);
/** Maintenant, exprimé comme Pilot enregistre les dates (heure de La Réunion en « UTC »). */
export const wallNow = () => new Date(Date.now() + WALL_OFFSET_MS);

export type PubCheck = { key: string; label: string; ok: boolean; hint?: string };

export type PubInput = {
  status: string;
  kind: string;
  network: string;
  networks?: string[] | null;
  scheduledAt: Date | null;
  caption: string | null;
  publishMode: string | null;
  brandId: string | null;
  mediaCount: number;
  metricoolConnected: boolean;
};

export function publicationChecks(c: PubInput, opts: { now?: boolean } = {}): PubCheck[] {
  const nets = networksOf(c).filter((n) => (SCHEDULABLE as readonly string[]).includes(n));
  const future = c.scheduledAt ? realInstant(c.scheduledAt).getTime() > Date.now() + 5 * 60_000 : false;
  const checks: PubCheck[] = [
    {
      key: "metricool",
      label: "Metricool raccordé",
      ok: c.metricoolConnected,
      hint: "Réglages → Intégrations : saisir la clé Metricool.",
    },
    {
      key: "marque",
      label: "Client relié à sa marque Metricool",
      ok: Boolean(c.brandId),
      hint: "Fiche du client → Réglages → marque Metricool.",
    },
  ];
  if (c.publishMode !== "confiance") {
    checks.push({
      key: "validation",
      label: "Validé par le client",
      ok: c.status === "pret" || c.status === "publie",
      hint: c.status === "validation" ? "En attente de sa réponse dans le portail." : "Envoyez-le en validation au client.",
    });
  }
  if (!opts.now) {
    checks.push({
      key: "date",
      label: "Date de publication à venir",
      ok: future,
      hint: c.scheduledAt ? "La date est passée : choisissez-en une nouvelle, ou publiez maintenant." : "Ajoutez une date et une heure.",
    });
  }
  checks.push(
    { key: "legende", label: "Légende rédigée", ok: Boolean(c.caption?.trim()), hint: "Metricool publie ce texte : il ne peut pas être vide." },
    {
      key: "media",
      label: "Visuel ou vidéo joint",
      ok: c.mediaCount > 0 || c.kind === "autre",
      hint: "Ajoutez le fichier final dans la fiche.",
    },
    {
      key: "reseau",
      label: "Réseau publiable par Metricool",
      ok: nets.length > 0,
      hint: "Instagram, Facebook, LinkedIn ou TikTok (Google se publie à la main).",
    },
  );
  return checks;
}

export const firstBlocker = (checks: PubCheck[]) => checks.find((c) => !c.ok) ?? null;

export type NetworkState = { network: string; status: string; url?: string | null; detail?: string | null };

/** L'état affiché d'une publication envoyée à Metricool. */
export const STATE_LABEL: Record<string, string> = {
  programme: "Programmé",
  brouillon: "Brouillon Metricool",
  publie: "Publié",
  partiel: "Publié en partie",
  erreur: "Échec de publication",
  introuvable: "Retiré de Metricool",
};
