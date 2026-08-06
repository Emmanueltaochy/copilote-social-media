import type { Tone } from "./tone";

/**
 * Le moteur de rythme.
 *
 * Une seule idée traverse le produit : le 25 d'un mois de 31 jours, un client
 * qui a acheté 16 contenus devrait en avoir 12,9. Chaque écran compare le
 * réalisé à ce rythme attendu et montre l'écart.
 *
 * Tout part de la date du jour. Les fonctions acceptent une date en paramètre
 * pour rester vérifiables : un calcul de rythme qui ne peut être testé qu'un
 * seul jour par mois n'est pas un calcul fiable.
 */

export type MonthPosition = {
  /** Quantième du jour dans le mois (1–31). */
  day: number;
  daysInMonth: number;
  /** Part du mois écoulée : c'est la position du repère or. */
  ratio: number;
};

export function monthPosition(now: Date = new Date()): MonthPosition {
  const day = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return { day, daysInMonth, ratio: day / daysInMonth };
}

const MONTHS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

export const monthLabel = (now: Date = new Date()) =>
  `${MONTHS[now.getMonth()]} ${now.getFullYear()}`;

/** Bornes du mois courant, pour filtrer ce qui compte dans l'engagement. */
export function monthRange(now: Date = new Date()): { start: Date; end: Date } {
  return {
    start: new Date(now.getFullYear(), now.getMonth(), 1),
    end: new Date(now.getFullYear(), now.getMonth() + 1, 1),
  };
}

export type PaceKey = "ahead" | "ontime" | "risk" | "late" | "none";

export const PACE_LABEL: Record<PaceKey, string> = {
  ahead: "En avance",
  ontime: "Dans les temps",
  risk: "À risque",
  late: "En retard",
  none: "Sans engagement",
};

export const PACE_TONE: Record<PaceKey, Tone> = {
  ahead: "ok",
  ontime: "neutral",
  risk: "warn",
  late: "alert",
  none: "muted",
};

/**
 * Seuils volontairement asymétriques : être 10 % en avance n'appelle aucune
 * action, être 10 % en retard mérite un signal, 25 % est un problème.
 */
export function paceKey(gap: number): PaceKey {
  if (gap > 0.1) return "ahead";
  if (gap >= -0.1) return "ontime";
  if (gap >= -0.25) return "risk";
  return "late";
}

export function gapTone(gapPct: number): Tone {
  if (gapPct >= -10) return "neutral";
  if (gapPct >= -25) return "warn";
  return "alert";
}

export type Pace = {
  target: number;
  done: number;
  expected: number;
  gap: number;
  key: PaceKey;
  tone: Tone;
  label: string;
  projected: number;
  fillPct: string;
  projPct: string;
  markerLeft: string;
  doneLabel: string;
  deltaLabel: string;
  diffLabel: string;
};

/**
 * Un client sans engagement chiffré (forfait à la carte, compte interne) n'a
 * pas de rythme à tenir : on ne lui invente pas un retard.
 */
export function pace(done: number, target: number, now: Date = new Date()): Pace {
  const { day, daysInMonth, ratio } = monthPosition(now);

  if (target <= 0) {
    return {
      target, done, expected: 0, gap: 0,
      key: "none", tone: PACE_TONE.none, label: PACE_LABEL.none,
      projected: done,
      fillPct: "0%", projPct: "0%",
      markerLeft: `calc(${(ratio * 100).toFixed(1)}% - 1.5px)`,
      doneLabel: `${done}`,
      deltaLabel: "—",
      diffLabel: "sans engagement chiffré",
    };
  }

  const expected = target * ratio;
  const gap = (done - expected) / expected;
  const key = paceKey(gap);
  const diff = Math.round(done - expected);
  const projected = Math.min(target, Math.round((done / day) * daysInMonth));

  return {
    target, done, expected, gap,
    key, tone: PACE_TONE[key], label: PACE_LABEL[key],
    projected,
    fillPct: pct(done / target),
    projPct: pct(projected / target),
    markerLeft: `calc(${(ratio * 100).toFixed(1)}% - 1.5px)`,
    doneLabel: `${done} / ${fr(expected, 1)}`,
    deltaLabel: signedPct(gap * 100),
    diffLabel: diff === 0 ? "au rythme" : `${signed(diff)} vs. objectif`,
  };
}

export function pct(ratio: number): string {
  if (!Number.isFinite(ratio)) return "0%";
  return `${Math.min(100, Math.max(0, ratio * 100)).toFixed(1)}%`;
}

/** Le produit est francophone : séparateurs et décimales à la française. */
export function fr(n: number, decimals = 0): string {
  return n.toLocaleString("fr-FR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Les montants sont stockés en centimes ; l'affichage se fait en euros. */
export function euroFromCents(cents: number): string {
  return `${Math.round(cents / 100).toLocaleString("fr-FR")} €`;
}

export function euro(n: number): string {
  return `${n.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} €`;
}

/** Utilise un vrai signe moins (−), pas un trait d'union. */
export function signed(n: number): string {
  return `${n >= 0 ? "+" : "−"}${Math.abs(n)}`;
}

export function signedPct(n: number): string {
  return `${signed(Math.round(n))} %`;
}

/** « jour 25 sur 31 · 81 % du mois écoulé » */
export function monthProgressLabel(now: Date = new Date()): string {
  const { day, daysInMonth, ratio } = monthPosition(now);
  return `jour ${day} sur ${daysInMonth} · ${Math.round(ratio * 100)} % du mois écoulé`;
}
