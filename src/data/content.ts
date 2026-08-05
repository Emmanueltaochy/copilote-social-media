import type { Tone } from "@/lib/tone";

/** The nine states a content moves through, from idea to published. */
export type ContentStatus =
  | "idea"
  | "prod"
  | "review"
  | "client"
  | "ready"
  | "done"
  | "missed";

export const CONTENT_STATUS: Record<
  ContentStatus,
  { label: string; tone: Tone; solidDot: boolean }
> = {
  idea: { label: "Idée", tone: "muted", solidDot: false },
  prod: { label: "En création", tone: "neutral", solidDot: true },
  review: { label: "Révision interne", tone: "warn", solidDot: true },
  client: { label: "Validation client", tone: "warn", solidDot: true },
  ready: { label: "Programmé", tone: "info", solidDot: true },
  done: { label: "Publié", tone: "ok", solidDot: true },
  missed: { label: "Non publié", tone: "alert", solidDot: true },
};

/** Networks, and the colour each one is recognised by. */
export type Network = "IG" | "FB" | "LI" | "TT" | "GO";

export const NETWORK_TONE: Record<Network, Tone> = {
  IG: "alert",
  FB: "info",
  LI: "info",
  TT: "ink",
  GO: "ok",
};

export const NETWORK_NAME: Record<Network, string> = {
  IG: "Instagram",
  FB: "Facebook",
  LI: "LinkedIn",
  TT: "TikTok",
  GO: "Google",
};
