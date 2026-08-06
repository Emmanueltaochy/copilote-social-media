import type { Tone } from "@/lib/tone";

/**
 * États d'un tournage.
 *
 * L'ordre n'est pas décoratif : il va de « rien n'est calé » à « c'est fait ».
 * « À sécuriser » existe séparément de « en préparation » parce que ce n'est
 * pas la même chose d'avoir encore du travail devant soi et d'avoir un point
 * bloquant à traiter avant le départ.
 */
export const SHOOT_STATUS = {
  preparation: { label: "En préparation", tone: "neutral" as Tone },
  a_securiser: { label: "À sécuriser", tone: "warn" as Tone },
  confirme: { label: "Confirmé", tone: "ok" as Tone },
  realise: { label: "Réalisé", tone: "muted" as Tone },
  annule: { label: "Annulé", tone: "alert" as Tone },
} satisfies Record<string, { label: string; tone: Tone }>;

export type ShootStatus = keyof typeof SHOOT_STATUS;

export const SHOOT_STATUSES = Object.keys(SHOOT_STATUS) as ShootStatus[];

/** Ce qui doit être vrai avant de partir. Le reste peut attendre. */
export type Readiness = {
  blocking: string[];
  ready: boolean;
};

export function readiness(counts: {
  shots: number;
  gearTotal: number;
  gearReserved: number;
  rightsTotal: number;
  rightsSigned: number;
  crew: number;
}): Readiness {
  const blocking: string[] = [];
  if (counts.crew === 0) blocking.push("aucune personne assignée");
  if (counts.shots === 0) blocking.push("shotlist vide");
  if (counts.gearTotal > counts.gearReserved) {
    blocking.push(`${counts.gearTotal - counts.gearReserved} matériel non réservé`);
  }
  // Une autorisation manquante ne se rattrape pas après coup : c'est elle qui
  // fait retirer une publication, parfois des semaines plus tard.
  if (counts.rightsTotal > counts.rightsSigned) {
    blocking.push(`${counts.rightsTotal - counts.rightsSigned} autorisation non signée`);
  }
  return { blocking, ready: blocking.length === 0 };
}

/** « Jeu. 27 août · 08:00–12:00 » — le créneau tel qu'on le dit à l'oral. */
export function slotLabel(startsAt: Date, endsAt: Date | null): string {
  const day = startsAt.toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "long",
  });
  const from = startsAt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  if (!endsAt) return `${day} · ${from}`;
  const to = endsAt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  return `${day} · ${from}–${to}`;
}

/** Durée en heures, arrondie à la demi-heure. Null si la fin n'est pas connue. */
export function durationHours(startsAt: Date, endsAt: Date | null): number | null {
  if (!endsAt) return null;
  const h = (endsAt.getTime() - startsAt.getTime()) / 3_600_000;
  return h > 0 ? Math.round(h * 2) / 2 : null;
}
