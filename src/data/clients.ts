import type { Tone } from "@/lib/tone";
import { pace, type Pace } from "@/lib/pacing";

export type Blocker = { label: string; value: string; tone: Tone };

export type Client = {
  /** Full legal-ish name, shown in the client switcher. */
  name: string;
  /** Short name used in dense tables and chips. */
  short: string;
  /** Contents owed this month. */
  target: number;
  /** Contents published so far. */
  done: number;
  blockers: Blocker[];
  freshness: string;
};

export const CLIENTS: Client[] = [
  {
    name: "Swap'Îles",
    short: "Swap'Îles",
    target: 12,
    done: 5,
    blockers: [
      { label: "Validation client en attente", value: "5 jours", tone: "alert" },
      { label: "Tournage marketplace non planifié", value: "à caler", tone: "warn" },
    ],
    freshness: "Chiffres Google Ads mis à jour il y a 6 jours par Samir.",
  },
  {
    name: "Cap Marine",
    short: "Cap Marine",
    target: 16,
    done: 9,
    blockers: [
      { label: "Reel « Sortie coucher de soleil » en validation", value: "6 jours", tone: "alert" },
      { label: "Contenu du 25 août non publié", value: "11h00 dépassé", tone: "alert" },
    ],
    freshness: "Statistiques Instagram saisies il y a 9 jours par Léa.",
  },
  {
    name: "Optique de Bourbon",
    short: "Optique de Bourbon",
    target: 12,
    done: 8,
    blockers: [{ label: "Dérush shooting collection solaire", value: "Noa · 2 jours", tone: "warn" }],
    freshness: "Statistiques à jour depuis hier, par Léa.",
  },
  {
    name: "Centrakor",
    short: "Centrakor",
    target: 20,
    done: 14,
    blockers: [
      { label: "3 stories en révision interne", value: "Kevin", tone: "neutral" },
      { label: "Budget Meta consommé à 94 %", value: "reste 6 jours", tone: "warn" },
    ],
    freshness: "Chiffres Meta mis à jour ce matin par Samir.",
  },
  {
    name: "Pokya",
    short: "Pokya",
    target: 12,
    done: 9,
    blockers: [{ label: "Brief légendes septembre à écrire", value: "Léa", tone: "neutral" }],
    freshness: "Statistiques à jour depuis 2 jours, par Léa.",
  },
  {
    name: "Hair by M",
    short: "Hair by M",
    target: 12,
    done: 9,
    blockers: [{ label: "2 contenus sans visuel définitif", value: "Kevin", tone: "neutral" }],
    freshness: "Statistiques à jour depuis 2 jours, par Léa.",
  },
  {
    name: "Pitaya",
    short: "Pitaya",
    target: 14,
    done: 11,
    blockers: [{ label: "Statistiques TikTok non saisies", value: "5 jours", tone: "warn" }],
    freshness: "Statistiques TikTok saisies il y a 5 jours par Samir.",
  },
  {
    name: "Stéphane Plaza Immobilier",
    short: "Stéphane Plaza",
    target: 14,
    done: 11,
    blockers: [{ label: "Photos de biens à retoucher", value: "Kevin · 4 visuels", tone: "neutral" }],
    freshness: "Statistiques à jour depuis 3 jours, par Léa.",
  },
  {
    name: "Centre Commercial Casabona",
    short: "Casabona",
    target: 18,
    done: 15,
    blockers: [{ label: "Planning braderie à valider", value: "client", tone: "neutral" }],
    freshness: "Statistiques à jour depuis hier, par Léa.",
  },
  {
    name: "Vite Frais Bien Frais",
    short: "Vite Frais Bien Frais",
    target: 12,
    done: 10,
    blockers: [{ label: "Autorisations droit à l'image manquantes", value: "2 sur 5", tone: "warn" }],
    freshness: "Statistiques à jour depuis 2 jours, par Léa.",
  },
  {
    name: "Roulé Mon Z'Avirons",
    short: "Roulé Mon Z'Avirons",
    target: 12,
    done: 10,
    blockers: [{ label: "Rien ne bloque", value: "à jour", tone: "ok" }],
    freshness: "Statistiques à jour depuis hier, par Léa.",
  },
  {
    name: "Taochy VIP",
    short: "Taochy VIP",
    target: 8,
    done: 7,
    blockers: [{ label: "Rien ne bloque", value: "à jour", tone: "ok" }],
    freshness: "Statistiques à jour depuis 2 jours, par Léa.",
  },
  {
    name: "AC Gym",
    short: "AC Gym",
    target: 16,
    done: 17,
    blockers: [{ label: "Avance de 3 contenus", value: "capitaliser sur septembre", tone: "ok" }],
    freshness: "Statistiques à jour depuis hier, par Léa.",
  },
];

export type PacedClient = Client & { pace: Pace };

/** Every screen that shows an engagement reads from here. */
export const PACED_CLIENTS: PacedClient[] = CLIENTS.map((c) => ({
  ...c,
  pace: pace(c.done, c.target),
}));

const URGENCY: Record<string, number> = { late: 0, risk: 1, ontime: 2, ahead: 3 };

/** Most urgent first — the cockpit's default order. */
export function byUrgency(list: PacedClient[]): PacedClient[] {
  return [...list].sort(
    (a, b) => URGENCY[a.pace.key] - URGENCY[b.pace.key] || a.pace.gap - b.pace.gap,
  );
}

export function byName(list: PacedClient[]): PacedClient[] {
  return [...list].sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

export function findClient(shortName: string): PacedClient {
  return PACED_CLIENTS.find((c) => c.short === shortName) ?? PACED_CLIENTS[1];
}

/** Accounts assigned to the logged-in user, for the "Mes comptes" filter. */
export const MY_ACCOUNTS = ["Cap Marine", "AC Gym", "Pitaya", "Centrakor", "Swap'Îles"];
