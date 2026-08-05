import type { Tone } from "./tone";

/**
 * The pacing engine.
 *
 * One idea runs through the whole product: on day 25 of a 31-day month, a
 * client owed 16 contents should have 12.9 of them. Everything — the cockpit
 * table, the progress screen, ad budget pacing, the client report — measures
 * "done" against that expected rhythm and shows the gap.
 *
 * The demo is frozen at 25 August 2026.
 */
export const TODAY = 25;
export const MONTH_DAYS = 31;
/** Share of the month elapsed. Drives the gold marker on every pacing bar. */
export const RATIO = TODAY / MONTH_DAYS;

export type PaceKey = "ahead" | "ontime" | "risk" | "late";

export const PACE_LABEL: Record<PaceKey, string> = {
  ahead: "En avance",
  ontime: "Dans les temps",
  risk: "À risque",
  late: "En retard",
};

export const PACE_TONE: Record<PaceKey, Tone> = {
  ahead: "ok",
  ontime: "neutral",
  risk: "warn",
  late: "alert",
};

/**
 * Thresholds are deliberately asymmetric: being 10% ahead is unremarkable,
 * being 10% behind is worth flagging, 25% behind is a problem.
 */
export function paceKey(gap: number): PaceKey {
  if (gap > 0.1) return "ahead";
  if (gap >= -0.1) return "ontime";
  if (gap >= -0.25) return "risk";
  return "late";
}

/** Same thresholds, for a single line rather than a whole account. */
export function gapTone(gapPct: number): Tone {
  if (gapPct >= -10) return "neutral";
  if (gapPct >= -25) return "warn";
  return "alert";
}

export type Pace = {
  /** Expected volume at today's date. */
  expected: number;
  /** Signed relative gap, e.g. -0.30 = 30% behind. */
  gap: number;
  key: PaceKey;
  tone: Tone;
  label: string;
  /** End-of-month volume if the current rhythm holds. */
  projected: number;
  /** CSS widths / offsets for <PacingBar>. */
  fillPct: string;
  projPct: string;
  markerLeft: string;
  /** "9 / 12,9" */
  doneLabel: string;
  /** "−30 %" */
  deltaLabel: string;
  /** "−4 vs. objectif" or "au rythme" */
  diffLabel: string;
};

export function pace(done: number, target: number): Pace {
  const expected = target * RATIO;
  const gap = (done - expected) / expected;
  const key = paceKey(gap);
  const diff = Math.round(done - expected);
  const projected = Math.min(target, Math.round((done / TODAY) * MONTH_DAYS));

  return {
    expected,
    gap,
    key,
    tone: PACE_TONE[key],
    label: PACE_LABEL[key],
    projected,
    fillPct: pct(done / target),
    projPct: pct(projected / target),
    markerLeft: `calc(${(RATIO * 100).toFixed(1)}% - 1.5px)`,
    doneLabel: `${done} / ${fr(expected, 1)}`,
    deltaLabel: signedPct(gap * 100),
    diffLabel: diff === 0 ? "au rythme" : `${signed(diff)} vs. objectif`,
  };
}

/** Clamped percentage string for bar widths. */
export function pct(ratio: number): string {
  return `${Math.min(100, Math.max(0, ratio * 100)).toFixed(1)}%`;
}

/** French number formatting — the product is French-first. */
export function fr(n: number, decimals = 0): string {
  return n.toLocaleString("fr-FR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function euro(n: number): string {
  return `${n.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} €`;
}

/** Uses a true minus sign (−), not a hyphen. */
export function signed(n: number): string {
  return `${n >= 0 ? "+" : "−"}${Math.abs(n)}`;
}

export function signedPct(n: number): string {
  return `${signed(Math.round(n))} %`;
}
