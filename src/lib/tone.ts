/**
 * Semantic tone system.
 *
 * The prototype carried raw hex on every row. Here the data layer only ever
 * names a *meaning* — "this is late", "this is fine" — and the presentation
 * layer decides what that looks like. One place to change the palette.
 */
export type Tone =
  | "ink" // default text, no signal
  | "neutral" // secondary text / "in the expected range"
  | "muted" // tertiary text / not applicable
  | "ok" // ahead, healthy, signed, confirmed
  | "warn" // at risk, needs attention before it becomes a problem
  | "alert" // late, blocked, over budget
  | "info" // scheduled / informational
  | "gold"; // the agency accent — pacing marker, active selection

/** Foreground colour for a value carrying a tone. */
export const toneText: Record<Tone, string> = {
  ink: "text-ink",
  neutral: "text-ink-2",
  muted: "text-ink-3",
  ok: "text-ok",
  warn: "text-warn",
  alert: "text-alert",
  info: "text-info",
  gold: "text-gold",
};

/** Pill / badge: tinted background + matching foreground. */
export const tonePill: Record<Tone, string> = {
  ink: "bg-mute text-ink",
  neutral: "bg-mute text-ink-2",
  muted: "bg-mute text-ink-3",
  ok: "bg-ok-bg text-ok",
  warn: "bg-warn-bg text-warn",
  alert: "bg-alert-bg text-alert",
  info: "bg-info-bg text-info",
  gold: "bg-gold-wash text-gold",
};

/**
 * Status dot. `neutral` is deliberately hollow — the design uses fill to mean
 * "something happened here", so "on time" reads as an outline only.
 */
export const toneDot: Record<Tone, string> = {
  ink: "bg-ink border-ink",
  neutral: "bg-transparent border-ink-2",
  muted: "bg-transparent border-ink-3",
  ok: "bg-ok border-ok",
  warn: "bg-warn border-warn",
  alert: "bg-alert border-alert",
  info: "bg-info border-info",
  gold: "bg-gold border-gold",
};

/** Forces a filled dot even where the tone would normally read as hollow. */
export const toneDotSolid: Record<Tone, string> = {
  ink: "bg-ink border-ink",
  neutral: "bg-ink-2 border-ink-2",
  muted: "bg-ink-3 border-ink-3",
  ok: "bg-ok border-ok",
  warn: "bg-warn border-warn",
  alert: "bg-alert border-alert",
  info: "bg-info border-info",
  gold: "bg-gold border-gold",
};

/** Row wash for a line that needs to read as a problem at a glance. */
export const toneRowBg: Record<Tone, string> = {
  ink: "bg-paper",
  neutral: "bg-paper",
  muted: "bg-paper",
  ok: "bg-paper",
  warn: "bg-paper",
  alert: "bg-alert-wash",
  info: "bg-paper",
  gold: "bg-gold-wash",
};

/** Border for a card that carries a tone. */
export const toneBorder: Record<Tone, string> = {
  ink: "border-line",
  neutral: "border-line",
  muted: "border-line",
  ok: "border-ok",
  warn: "border-line",
  alert: "border-alert-line",
  info: "border-line",
  gold: "border-gold",
};
