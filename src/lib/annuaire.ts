import type { Tone } from "@/lib/tone";

/*
 * Le vocabulaire de l'annuaire : types, sources, activités et étapes de
 * prospection, avec leur libellé et leur ton. Un seul endroit pour les mots,
 * importé par l'écran, l'import et l'accueil — sans dépendance serveur, pour
 * pouvoir servir aussi aux formulaires.
 */

export const KINDS = {
  client: { label: "Client", tone: "ok" },
  prospect: { label: "Prospect", tone: "info" },
  ancien_client: { label: "Ancien client", tone: "neutral" },
  partenaire: { label: "Partenaire", tone: "gold" },
  autre: { label: "Autre", tone: "muted" },
} as const satisfies Record<string, { label: string; tone: Tone }>;
export type Kind = keyof typeof KINDS;
export const isKind = (v: unknown): v is Kind => typeof v === "string" && v in KINDS;

export const SOURCES = {
  agence: "Agence",
  agent_ventes_france: "Agent ventes · France",
  agent_ventes_reunion: "Agent ventes · Réunion",
  agent_ventes_international: "Agent ventes · international",
  google_maps: "Google Maps",
  bouche_a_oreille: "Bouche-à-oreille",
  swapiles: "Swap'Îles",
  autre: "Autre",
} as const;
export type Source = keyof typeof SOURCES;
export const isSource = (v: unknown): v is Source => typeof v === "string" && v in SOURCES;

/** Les deux activités d'Emmanuel : l'agence et la marketplace. */
export const ACTIVITES = {
  agence: "Agence",
  swapiles: "Swap'Îles",
} as const;
export type Activite = keyof typeof ACTIVITES;
export const isActivite = (v: unknown): v is Activite => typeof v === "string" && v in ACTIVITES;

/** Les étapes de prospection, avec les mots de l'agent ventes (docs/crm/config.json). */
export const STATUTS = {
  a_contacter: { label: "À contacter", tone: "muted" },
  contacte: { label: "Contacté", tone: "neutral" },
  relance: { label: "Relancé", tone: "neutral" },
  repondu: { label: "A répondu", tone: "warn" },
  rdv: { label: "Rendez-vous", tone: "info" },
  devis: { label: "Devis envoyé", tone: "info" },
  gagne: { label: "Gagné", tone: "ok" },
  perdu: { label: "Perdu", tone: "muted" },
} as const satisfies Record<string, { label: string; tone: Tone }>;
export type Statut = keyof typeof STATUTS;
export const isStatut = (v: unknown): v is Statut => typeof v === "string" && v in STATUTS;

/** « Garage Sud-Auto » et « garage sud auto » : même clé. */
export function cleTexte(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** La clé de rapprochement par nom et ville. Vide si le nom n'en dit pas assez. */
export function cleNomVille(nom: string | null | undefined, ville: string | null | undefined): string | null {
  const n = cleTexte(nom);
  if (n.length < 2) return null;
  return `${n}|${cleTexte(ville)}`;
}

/** L'e-mail en minuscules, ou null s'il ne ressemble pas à une adresse. */
export function cleEmail(email: string | null | undefined): string | null {
  const e = (email ?? "").trim().toLowerCase();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) ? e : null;
}

/**
 * « aujourd'hui », « hier », « il y a 5 jours », « 12 sept. » — au jour près,
 * à l'heure de La Réunion. Les fichiers de l'agent ventes ne datent qu'au
 * jour : afficher « il y a 4 h » prétendrait une précision qu'on n'a pas.
 */
export function jourRelatif(d: Date, now: Date = new Date()): string {
  const jourReunion = (x: Date) => Math.floor((x.getTime() + 4 * 3_600_000) / 86_400_000);
  const ecart = jourReunion(now) - jourReunion(d);
  if (ecart <= 0) return "aujourd'hui";
  if (ecart === 1) return "hier";
  if (ecart < 30) return `il y a ${ecart} jours`;
  return d.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: d.getFullYear() === now.getFullYear() ? undefined : "numeric",
    timeZone: "Indian/Reunion",
  });
}
