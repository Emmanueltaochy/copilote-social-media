import { euroFromCents, fr, monthPosition, pct, signedPct } from "./pacing";
import type { Tone } from "./tone";

/**
 * Le rythme de dépense publicitaire.
 *
 * Même repère que le pilotage des contenus — la part du mois écoulée — mais
 * lecture inverse sur un point décisif : dépenser en avance n'est pas une
 * bonne nouvelle. Un budget consommé à 70 % au milieu du mois s'éteindra
 * avant la fin, et la campagne s'arrêtera au moment où elle commençait à
 * apprendre. Sous-dépenser est un problème plus tranquille : le budget est
 * payé et n'a pas travaillé.
 *
 * L'écart compte donc dans les deux sens, avec des seuils plus larges que
 * pour les contenus : une régie ne dépense jamais exactement au douzième.
 */
export type BudgetPace = {
  spentCents: number;
  budgetCents: number;
  expectedCents: number;
  gap: number;
  tone: Tone;
  label: string;
  detail: string;
  fillPct: string;
  markerLeft: string;
  /** Projection de fin de mois au rythme constaté. */
  projectedCents: number;
};

export function budgetPace(
  spentCents: number,
  budgetCents: number,
  now: Date = new Date(),
): BudgetPace {
  const { day, daysInMonth, ratio } = monthPosition(now);
  const markerLeft = `calc(${(ratio * 100).toFixed(1)}% - 1.5px)`;

  if (budgetCents <= 0) {
    return {
      spentCents,
      budgetCents,
      expectedCents: 0,
      gap: 0,
      tone: "muted",
      label: "Sans budget défini",
      detail: `${euroFromCents(spentCents)} dépensés`,
      fillPct: "0%",
      markerLeft,
      projectedCents: spentCents,
    };
  }

  const expectedCents = budgetCents * ratio;
  const gap = (spentCents - expectedCents) / expectedCents;
  const projectedCents = Math.round((spentCents / day) * daysInMonth);

  let tone: Tone = "neutral";
  let label = "Au rythme";
  if (gap > 0.25) {
    tone = "alert";
    label = "Dépense trop rapide";
  } else if (gap > 0.1) {
    tone = "warn";
    label = "En avance de dépense";
  } else if (gap < -0.25) {
    tone = "warn";
    label = "Budget sous-consommé";
  } else if (gap < -0.1) {
    tone = "neutral";
    label = "Légèrement en retrait";
  }

  return {
    spentCents,
    budgetCents,
    expectedCents,
    gap,
    tone,
    label,
    detail: `${euroFromCents(spentCents)} sur ${euroFromCents(budgetCents)} · attendu ${euroFromCents(
      Math.round(expectedCents),
    )} · ${signedPct(gap * 100)}`,
    fillPct: pct(spentCents / budgetCents),
    markerLeft,
    projectedCents,
  };
}

/**
 * Indicateurs dérivés d'une saisie.
 *
 * Tous se calculent à partir des mêmes six nombres saisis à la main. Aucun
 * n'est stocké : un indicateur enregistré se désynchronise de ses composantes
 * dès la première correction de saisie.
 */
export type AdTotals = {
  spendCents: number;
  impressions: number;
  clicks: number;
  leads: number;
  conversions: number;
  revenueCents: number;
};

export const EMPTY_TOTALS: AdTotals = {
  spendCents: 0,
  impressions: 0,
  clicks: 0,
  leads: 0,
  conversions: 0,
  revenueCents: 0,
};

export function sumTotals(rows: AdTotals[]): AdTotals {
  return rows.reduce(
    (a, r) => ({
      spendCents: a.spendCents + r.spendCents,
      impressions: a.impressions + r.impressions,
      clicks: a.clicks + r.clicks,
      leads: a.leads + r.leads,
      conversions: a.conversions + r.conversions,
      revenueCents: a.revenueCents + r.revenueCents,
    }),
    { ...EMPTY_TOTALS },
  );
}

/** Une division dont le dénominateur est nul n'a pas de valeur : elle n'en invente pas. */
const ratio = (num: number, den: number): number | null => (den > 0 ? num / den : null);

export type Derived = {
  ctr: number | null;
  cpcCents: number | null;
  cpmCents: number | null;
  cplCents: number | null;
  cpaCents: number | null;
  roas: number | null;
};

export function derive(t: AdTotals): Derived {
  return {
    ctr: ratio(t.clicks, t.impressions),
    cpcCents: ratio(t.spendCents, t.clicks),
    cpmCents: ratio(t.spendCents * 1000, t.impressions),
    cplCents: ratio(t.spendCents, t.leads),
    cpaCents: ratio(t.spendCents, t.conversions),
    roas: ratio(t.revenueCents, t.spendCents),
  };
}

/**
 * Un coût unitaire : coût par clic, par lead, par vente, pour mille.
 *
 * Toujours deux décimales. Ce sont des montants qu'on compare entre eux et
 * dans le temps — un CPL passé de 11,80 à 12,40 € est l'information utile, et
 * l'arrondi à l'euro l'effacerait. Les montants globaux, eux, s'affichent avec
 * `euroFromCents` et restent arrondis.
 *
 * « — » plutôt qu'un zéro : l'absence de donnée n'est pas une performance nulle.
 */
export const money = (cents: number | null): string =>
  cents === null ? "—" : `${fr(cents / 100, 2)} €`;

export const percent = (r: number | null): string => (r === null ? "—" : `${fr(r * 100, 2)} %`);

export const times = (r: number | null): string => (r === null ? "—" : `${fr(r, 2)}×`);

/**
 * Le lundi de la semaine d'une date, en ISO.
 *
 * Les régies découpent leurs rapports à la semaine ; caler la saisie sur le
 * lundi évite que deux personnes saisissent la même semaine sous deux dates
 * différentes et créent deux lignes pour une seule réalité.
 */
export function mondayOf(d: Date = new Date()): string {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const shift = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - shift);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

/** « semaine du 3 août » — la façon dont on en parle à l'oral. */
export function weekLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return `semaine du ${d.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}`;
}

export const CAMPAIGN_STATUS = {
  brouillon: { label: "Brouillon", tone: "muted" as Tone },
  active: { label: "Active", tone: "ok" as Tone },
  pause: { label: "En pause", tone: "warn" as Tone },
  arretee: { label: "Arrêtée", tone: "neutral" as Tone },
} satisfies Record<string, { label: string; tone: Tone }>;

export type CampaignStatus = keyof typeof CAMPAIGN_STATUS;
export const CAMPAIGN_STATUSES = Object.keys(CAMPAIGN_STATUS) as CampaignStatus[];
