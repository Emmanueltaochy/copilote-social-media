/*
 * Le revenu mensuel (prélèvements GoCardless), ses règles de calcul, sans
 * dépendance au serveur.
 *
 * Volontairement isolé (aucun import) : scripts/test-revenu.mjs charge ce
 * fichier tel quel pour éprouver chaque règle au centime près.
 *
 * Les données viennent du relevé GoCardless (src/lib/gocardless.ts), en
 * lecture seule : abonnements, mandats, paiements des 13 derniers mois et
 * événements d'arrêt des abonnements. Rien n'est inventé : ce qui ne peut
 * pas être su est marqué « estimé » ou signalé comme manquant.
 */

/* ------------------------------------------------------------- données -- */

export type AbonnementRev = {
  id: string;
  nom: string;
  /** active, cancelled, finished, paused, pending_customer_approval, customer_approval_denied */
  statut: string;
  montantCents: number;
  devise: string;
  intervalle: number;
  /** weekly, monthly, yearly */
  unite: string;
  /** Date de création de l'abonnement (AAAA-MM-JJ, heure de La Réunion) : le jour où il compte. */
  debut: string;
  /** Premier prélèvement prévu (start_date). */
  premierPrelevement: string | null;
  /** Date de fin prévue à la création (end_date), s'il y en a une. */
  finPrevue: string | null;
  /** Le jour de l'arrêt d'après les événements GoCardless (annulé, terminé, mis en pause). */
  arret: string | null;
  /** Le client GoCardless. */
  client: string;
  mandat: string;
  /** Un taux de TVA noté dans les métadonnées de l'abonnement (« tva », « vat »…), sinon null. */
  tauxTva: number | null;
  /** Les prochaines échéances annoncées par GoCardless. */
  aVenir: { date: string; montantCents: number }[];
};

export type PaiementRev = {
  id: string;
  statut: string;
  montantCents: number;
  devise: string;
  /** Date de prélèvement (AAAA-MM-JJ). */
  date: string | null;
  abonnement: string | null;
  mandat: string;
  client: string;
  libelle: string;
};

export type MandatRev = { id: string; statut: string; client: string; creeLe: string; annuleLe: string | null; reference: string | null };

export type ClientRev = { id: string; nom: string; entryId: string | null };

/** Ce que le relevé GoCardless garde pour cette page (releves.donnees.revenu). */
export type DonneesRevenu = {
  version: 1;
  /** Fin du relevé (ISO). */
  le: string;
  environnement: "live" | "sandbox";
  /** Début de la fenêtre des paiements et des événements (ISO). */
  depuis: string;
  /** Les événements d'arrêt (annulé, terminé) ont-ils pu être lus ? */
  evenementsLus: boolean;
  abonnements: AbonnementRev[];
  paiements: PaiementRev[];
  mandats: MandatRev[];
  clients: ClientRev[];
};

/* ------------------------------------------------------------- réglages -- */

export type Palier = { montantCents: number; libelle: string };
export type ReglagesRevenu = {
  objectifCents: number;
  paliers: Palier[];
  /** Taux de TVA en %, pour l'estimation hors taxes (8,5 % à La Réunion). */
  tauxTva: number;
  /** Ce que la barre compare à l'objectif : le montant prélevé, ou l'estimation hors taxes. */
  base: "preleve" | "ht";
};

export const REGLAGES_REVENU_DEFAUT: ReglagesRevenu = {
  objectifCents: 1_000_000,
  paliers: [
    { montantCents: 570_000, libelle: "Embauche n° 1" },
    { montantCents: 880_000, libelle: "Bureau + embauche n° 2" },
  ],
  tauxTva: 8.5,
  base: "preleve",
};

export const PLAFOND_OBJECTIF_CENTS = 100_000_000; // 1 million d'euros par mois : au-delà, une faute de frappe

/** Les réglages enregistrés, complétés par les valeurs par défaut ; une valeur illisible est ignorée. */
export function lireReglages(brut: unknown): ReglagesRevenu {
  const r = (brut && typeof brut === "object" ? brut : {}) as Record<string, unknown>;
  const montant = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v > 0 && v <= PLAFOND_OBJECTIF_CENTS ? v : null);
  const objectifCents = montant(r.objectifCents) ?? REGLAGES_REVENU_DEFAUT.objectifCents;
  const paliers = Array.isArray(r.paliers)
    ? (r.paliers as unknown[])
        .map((p) => {
          const x = (p && typeof p === "object" ? p : {}) as Record<string, unknown>;
          const m = montant(x.montantCents);
          const libelle = typeof x.libelle === "string" ? x.libelle.trim().slice(0, 60) : "";
          return m && libelle ? { montantCents: m, libelle } : null;
        })
        .filter((p): p is Palier => p !== null)
        .slice(0, 4)
        .sort((a, b) => a.montantCents - b.montantCents)
    : REGLAGES_REVENU_DEFAUT.paliers;
  const tauxTva = typeof r.tauxTva === "number" && r.tauxTva >= 0 && r.tauxTva <= 30 ? r.tauxTva : REGLAGES_REVENU_DEFAUT.tauxTva;
  const base = r.base === "ht" ? "ht" : "preleve";
  return { objectifCents, paliers, tauxTva, base };
}

/** « 10 000 », « 10000,50 », « 10 000 € » → centimes ; null si illisible. */
export function centimesDepuisSaisie(saisie: string): number | null {
  const net = saisie.replace(/[\s  €]/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(net)) return null;
  return Math.round(Number(net) * 100);
}

/* --------------------------------------------------------- les dates -- */

const JOUR_MS = 86_400_000;
/** La Réunion : UTC+4, sans heure d'été. */
const DECALAGE_REUNION_MS = 4 * 3_600_000;

/** Le jour (AAAA-MM-JJ) à La Réunion. */
export const jourReunion = (d: Date | string | number) => new Date(new Date(d).getTime() + DECALAGE_REUNION_MS).toISOString().slice(0, 10);

/** Les n derniers mois (AAAA-MM), du plus ancien au mois en cours. */
export function derniersMois(maintenant: Date, n = 12): string[] {
  const [a, m] = jourReunion(maintenant).split("-").map(Number);
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const t = a * 12 + (m - 1) - i;
    out.push(`${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`);
  }
  return out;
}

/** Le dernier jour d'un mois (AAAA-MM-JJ). */
export function finDuMois(mois: string): string {
  const [a, m] = mois.split("-").map(Number);
  return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
}

const NOMS_MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const NOMS_COURTS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
/** « novembre 2026 », ou « nov. » en court. */
export function nomDuMois(mois: string, court = false): string {
  const [a, m] = mois.split("-").map(Number);
  if (court) return NOMS_COURTS[m - 1] ?? mois;
  return `${NOMS_MOIS[m - 1] ?? mois} ${a}`;
}

const ajouterJours = (jour: string, n: number) => new Date(Date.parse(`${jour}T12:00:00Z`) + n * JOUR_MS).toISOString().slice(0, 10);

/* ------------------------------------------------ ramené au mois -- */

/**
 * Le montant d'un abonnement ramené au mois, en centimes (arrondi au centime) :
 *   - mensuel : le montant ; tous les N mois : ÷ N ;
 *   - hebdomadaire : × 52 / 12 ; toutes les N semaines : × 52 / 12 / N ;
 *   - annuel : ÷ 12 ; tous les N ans : ÷ 12 / N.
 * null pour un rythme inconnu (jamais compté plutôt que mal compté).
 */
export function mensuelCents(montantCents: number, intervalle: number, unite: string): number | null {
  const n = Math.max(1, Math.round(Number(intervalle) || 1));
  const m = Number(montantCents) || 0;
  if (unite === "monthly") return Math.round(m / n);
  if (unite === "weekly") return Math.round((m * 52) / 12 / n);
  if (unite === "yearly") return Math.round(m / 12 / n);
  return null;
}

/** Hors taxes estimé à partir du montant prélevé (TTC) et d'un taux en %. */
export const horsTaxesCents = (ttcCents: number, tauxPct: number) => Math.round(ttcCents / (1 + tauxPct / 100));

/** Un abonnement qui compte dans le revenu mensuel : en euros, d'un rythme connu. */
export const comptable = (a: AbonnementRev) => a.devise === "EUR" && mensuelCents(a.montantCents, a.intervalle, a.unite) !== null;

/** Jamais devenus des abonnements : le client n'a pas donné son accord. */
const JAMAIS_ACTIFS = new Set(["pending_customer_approval", "customer_approval_denied"]);

/* ---------------------------------------------------- le revenu actuel -- */

export type Actuel = {
  /** Somme des abonnements actifs ramenés au mois : ce que GoCardless prélève. */
  preleveCents: number;
  /** Estimation hors taxes (taux de l'abonnement s'il est noté, sinon le taux réglé). */
  horsTaxesCents: number;
  abonnements: number;
  /** Abonnements dont le taux de TVA vient des métadonnées GoCardless. */
  tauxNotes: number;
  /** Abonnements actifs dans une autre devise ou un rythme inconnu : non comptés. */
  ignores: AbonnementRev[];
};

export function revenuActuel(abonnements: AbonnementRev[], tauxTva: number): Actuel {
  let preleveCents = 0;
  let ht = 0;
  let n = 0;
  let tauxNotes = 0;
  const ignores: AbonnementRev[] = [];
  for (const a of abonnements) {
    if (a.statut !== "active") continue;
    if (!comptable(a)) {
      ignores.push(a);
      continue;
    }
    const m = mensuelCents(a.montantCents, a.intervalle, a.unite)!;
    preleveCents += m;
    ht += horsTaxesCents(m, a.tauxTva ?? tauxTva);
    if (a.tauxTva !== null) tauxNotes += 1;
    n += 1;
  }
  return { preleveCents, horsTaxesCents: ht, abonnements: n, tauxNotes, ignores };
}

/* --------------------------------------------------- début et fin -- */

export type Periode = { debut: string; fin: string | null; finEstimee: boolean };

/**
 * Quand un abonnement a compté :
 *   - début : sa date de création (le jour où le client a signé ; le premier
 *     prélèvement suit de quelques jours) ;
 *   - fin : aucune s'il est actif ; sinon le jour de l'événement d'arrêt
 *     (annulé, terminé, mis en pause) ; à défaut sa date de fin prévue ; à
 *     défaut, ESTIMÉE : le jour de son dernier prélèvement connu, ou son début.
 * La fin ne dépasse jamais aujourd'hui pour un abonnement qui n'est plus actif.
 */
export function periode(a: AbonnementRev, paiements: PaiementRev[], aujourdhui: string): Periode | null {
  if (JAMAIS_ACTIFS.has(a.statut)) return null;
  if (a.statut === "active") return { debut: a.debut, fin: null, finEstimee: false };
  let fin = a.arret ?? (a.finPrevue && a.finPrevue <= aujourdhui ? a.finPrevue : null);
  let finEstimee = false;
  if (!fin) {
    const dates = paiements.filter((p) => p.abonnement === a.id && p.date && p.date <= aujourdhui).map((p) => p.date!);
    fin = dates.sort().at(-1) ?? a.debut;
    finEstimee = true;
  }
  if (fin > aujourdhui) fin = aujourdhui;
  if (fin < a.debut) fin = a.debut;
  return { debut: a.debut, fin, finEstimee };
}

/** Un abonnement compte le jour J s'il a commencé et ne s'est pas encore arrêté. */
const actifLe = (p: Periode, jour: string) => p.debut <= jour && (p.fin === null || p.fin > jour);

/* ------------------------------------------------- l'évolution -- */

export type MoisRevenu = {
  mois: string;
  /** Revenu mensuel à la fin du mois (aujourd'hui pour le mois en cours). */
  finCents: number;
  nouveauCents: number;
  perduCents: number;
  netCents: number;
  /** Prélèvements d'abonnements réellement encaissés ce mois (contrôle). */
  encaisseCents: number;
  /** Une fin d'abonnement estimée touche ce mois. */
  estime: boolean;
  /** Avant le premier abonnement connu. */
  avant: boolean;
  /** La fenêtre des paiements relevés ne couvre pas tout le mois. */
  encaissePartiel: boolean;
};

export type Evolution = {
  mois: MoisRevenu[];
  /** Abonnements arrêtés dont la date de fin est estimée (pas d'événement GoCardless). */
  finsEstimees: number;
};

export function evolution(donnees: Pick<DonneesRevenu, "abonnements" | "paiements" | "depuis">, maintenant: Date, n = 12): Evolution {
  const aujourdhui = jourReunion(maintenant);
  const mois = derniersMois(maintenant, n);
  const periodes = donnees.abonnements
    .filter(comptable)
    .map((a) => ({ a, p: periode(a, donnees.paiements, aujourdhui), m: mensuelCents(a.montantCents, a.intervalle, a.unite)! }))
    .filter((x): x is { a: AbonnementRev; p: Periode; m: number } => x.p !== null);
  const premier = periodes.map((x) => x.p.debut).sort()[0] ?? null;
  const depuis = jourReunion(donnees.depuis);
  // Seules comptent les fins estimées qui tombent dans la période montrée.
  const estimees = periodes.filter((x) => x.p.finEstimee && (x.p.fin ?? "") >= `${mois[0]}-01`);
  const sortie: MoisRevenu[] = mois.map((mo) => {
    const fin = mo === mois.at(-1) ? aujourdhui : finDuMois(mo);
    let finCents = 0;
    let nouveauCents = 0;
    let perduCents = 0;
    let estime = false;
    for (const { p, m } of periodes) {
      if (actifLe(p, fin)) finCents += m;
      if (p.debut.startsWith(mo)) nouveauCents += m;
      if (p.fin?.startsWith(mo)) {
        perduCents += m;
        if (p.finEstimee) estime = true;
      }
    }
    const encaisseCents = donnees.paiements
      .filter((x) => x.abonnement && x.devise === "EUR" && x.date?.startsWith(mo) && (x.statut === "confirmed" || x.statut === "paid_out"))
      .reduce((t, x) => t + x.montantCents, 0);
    return {
      mois: mo,
      finCents,
      nouveauCents,
      perduCents,
      netCents: nouveauCents - perduCents,
      encaisseCents,
      estime,
      avant: premier === null || finDuMois(mo) < premier,
      encaissePartiel: depuis > `${mo}-01`,
    };
  });
  return { mois: sortie, finsEstimees: estimees.length };
}

/* ----------------------------------------------- l'écart à combler -- */

/** Ce qui manque pour l'objectif, et combien de clients de plus à ce prix. */
export function ecart(objectifCents: number, actuelCents: number, prixClientCents: number): { resteCents: number; clients: number | null; atteint: boolean } {
  const resteCents = Math.max(0, objectifCents - actuelCents);
  return { resteCents, clients: prixClientCents > 0 ? Math.ceil(resteCents / prixClientCents) : null, atteint: resteCents === 0 };
}

/** Le prochain palier pas encore franchi (paliers puis objectif). */
export function prochainPalier(actuelCents: number, reglages: ReglagesRevenu): Palier | null {
  const etapes = [...reglages.paliers, { montantCents: reglages.objectifCents, libelle: "Objectif" }].sort((a, b) => a.montantCents - b.montantCents);
  return etapes.find((p) => p.montantCents > actuelCents) ?? null;
}

/* ------------------------------------------------- la répartition -- */

export const SEUIL_DEPENDANCE = 0.2;

export type PartClient = {
  cle: string;
  entryId: string | null;
  clientsGc: string[];
  nom: string;
  mensuelCents: number;
  part: number;
  abonnements: number;
  dependance: boolean;
};

/**
 * Par client : les abonnements actifs regroupés par fiche (deux clients
 * GoCardless reliés à la même fiche n'en font qu'un), sinon par client
 * GoCardless. Une part au-dessus de 20 % du total est une dépendance.
 */
export function parClient(abonnements: AbonnementRev[], clients: ClientRev[]): PartClient[] {
  const infos = new Map(clients.map((c) => [c.id, c]));
  const groupes = new Map<string, PartClient>();
  for (const a of abonnements) {
    if (a.statut !== "active" || !comptable(a)) continue;
    const c = infos.get(a.client);
    const cle = c?.entryId ? `fiche:${c.entryId}` : `gc:${a.client}`;
    const g = groupes.get(cle) ?? { cle, entryId: c?.entryId ?? null, clientsGc: [], nom: c?.nom ?? a.client, mensuelCents: 0, part: 0, abonnements: 0, dependance: false };
    g.mensuelCents += mensuelCents(a.montantCents, a.intervalle, a.unite)!;
    g.abonnements += 1;
    if (!g.clientsGc.includes(a.client)) g.clientsGc.push(a.client);
    groupes.set(cle, g);
  }
  const lignes = [...groupes.values()];
  const total = lignes.reduce((t, g) => t + g.mensuelCents, 0);
  for (const g of lignes) {
    g.part = total > 0 ? g.mensuelCents / total : 0;
    g.dependance = g.part > SEUIL_DEPENDANCE;
  }
  return lignes.sort((a, b) => b.mensuelCents - a.mensuelCents || a.nom.localeCompare(b.nom, "fr"));
}

/** Revenu moyen par client (centimes), ou 0 sans client. */
export const moyenneParClient = (totalCents: number, nbClients: number) => (nbClients > 0 ? Math.round(totalCents / nbClients) : 0);

const OFFRES: [string, RegExp][] = [
  ["Publicité", /\b(pub|publicit\w*|ads|sponsoris\w*|campagnes?|meta ads|google ads)\b/],
  ["Community management", /\b(community|cm|reseaux sociaux|reseaux|social|sociaux|instagram|facebook|tiktok|linkedin|publications?|contenus?)\b/],
  ["Vidéo", /\b(videos?|tournages?|reels?|montages?)\b/],
  ["Site et maintenance", /\b(site|sites|web|maintenance|hebergement|tma|wordpress|domaine|seo)\b/],
];

/** Le type d'offre d'après le nom de l'abonnement, ou null si le nom ne le dit pas. */
export function typeOffre(nom: string): string | null {
  const k = ` ${nom
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()} `;
  for (const [libelle, motif] of OFFRES) if (motif.test(k)) return libelle;
  return null;
}

/**
 * Par type d'offre, d'après les noms des abonnements actifs. Montrée
 * seulement si les noms classent au moins la moitié du revenu : sinon, on
 * ne la montre pas plutôt que d'afficher une répartition en trompe-l'œil.
 */
export function parOffre(abonnements: AbonnementRev[]): { lignes: { offre: string; mensuelCents: number; part: number; abonnements: number }[]; classe: number; montrer: boolean } {
  const actifs = abonnements.filter((a) => a.statut === "active" && comptable(a));
  const total = actifs.reduce((t, a) => t + mensuelCents(a.montantCents, a.intervalle, a.unite)!, 0);
  const g = new Map<string, { offre: string; mensuelCents: number; part: number; abonnements: number }>();
  for (const a of actifs) {
    const offre = typeOffre(a.nom) ?? "Non classé";
    const x = g.get(offre) ?? { offre, mensuelCents: 0, part: 0, abonnements: 0 };
    x.mensuelCents += mensuelCents(a.montantCents, a.intervalle, a.unite)!;
    x.abonnements += 1;
    g.set(offre, x);
  }
  const lignes = [...g.values()].map((x) => ({ ...x, part: total > 0 ? x.mensuelCents / total : 0 }));
  lignes.sort((a, b) => (a.offre === "Non classé" ? 1 : b.offre === "Non classé" ? -1 : b.mensuelCents - a.mensuelCents));
  const classe = total > 0 ? lignes.filter((x) => x.offre !== "Non classé").reduce((t, x) => t + x.mensuelCents, 0) / total : 0;
  return { lignes, classe, montrer: total > 0 && classe >= 0.5 };
}

/* --------------------------------------------- fuites et risques -- */

export const LIBELLE_STATUT_PAIEMENT: Record<string, string> = {
  failed: "En échec",
  charged_back: "Contesté (remboursé)",
  customer_approval_denied: "Refusé par le client",
};
const ECHEC = new Set(Object.keys(LIBELLE_STATUT_PAIEMENT));
const A_VENIR = new Set(["pending_customer_approval", "pending_submission", "submitted"]);

/** Les paiements en échec dont la date de prélèvement est dans les `jours` derniers jours. */
export function echecsRecents(paiements: PaiementRev[], maintenant: Date, jours = 30): PaiementRev[] {
  const auj = jourReunion(maintenant);
  const depuis = ajouterJours(auj, -jours);
  return paiements.filter((p) => ECHEC.has(p.statut) && p.date && p.date >= depuis && p.date <= auj).sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
}

const MANDAT_VIVANT = new Set(["active", "pending_customer_approval", "pending_submission", "submitted"]);
const MANDAT_PERDU = new Set(["cancelled", "expired", "failed", "blocked", "suspended_by_payer"]);

/**
 * Les mandats annulés (ou expirés, bloqués…) d'un client encore actif, qui
 * n'a plus aucun mandat vivant : plus rien ne peut lui être prélevé.
 * `encoreActif` dit si un client GoCardless est encore client (fiche d'un
 * client sous contrat).
 */
export function mandatsPerdus(mandats: MandatRev[], encoreActif: (clientGc: string) => boolean): MandatRev[] {
  const vivants = new Set(mandats.filter((m) => MANDAT_VIVANT.has(m.statut)).map((m) => m.client));
  return mandats
    .filter((m) => MANDAT_PERDU.has(m.statut) && !vivants.has(m.client) && encoreActif(m.client))
    .sort((a, b) => (b.annuleLe ?? b.creeLe).localeCompare(a.annuleLe ?? a.creeLe));
}

export type Prelevement = { date: string; montantCents: number; client: string; libelle: string; abonnement: string | null; source: "paiement" | "echeance" };

/**
 * Les prélèvements des `jours` prochains jours : les paiements déjà créés et
 * pas encore passés, puis les échéances annoncées des abonnements actifs
 * (sans recompter une échéance qui est déjà un paiement : même abonnement,
 * même date).
 */
export function prochainsPrelevements(abonnements: AbonnementRev[], paiements: PaiementRev[], maintenant: Date, jours = 30): Prelevement[] {
  const auj = jourReunion(maintenant);
  const jusque = ajouterJours(auj, jours);
  const dans = (d: string | null) => Boolean(d && d >= auj && d <= jusque);
  const out: Prelevement[] = [];
  const deja = new Set<string>();
  for (const p of paiements) {
    if (!A_VENIR.has(p.statut) || !dans(p.date) || p.devise !== "EUR") continue;
    out.push({ date: p.date!, montantCents: p.montantCents, client: p.client, libelle: p.libelle, abonnement: p.abonnement, source: "paiement" });
    if (p.abonnement) deja.add(`${p.abonnement}|${p.date}`);
  }
  for (const a of abonnements) {
    if (a.statut !== "active" || a.devise !== "EUR") continue;
    for (const e of a.aVenir) {
      if (!dans(e.date) || deja.has(`${a.id}|${e.date}`)) continue;
      deja.add(`${a.id}|${e.date}`);
      out.push({ date: e.date, montantCents: e.montantCents, client: a.client, libelle: a.nom, abonnement: a.id, source: "echeance" });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || b.montantCents - a.montantCents);
}

/**
 * Les clients facturés tous les mois chez Abby : au moins 3 des 4 derniers
 * mois complets ont une facture (finalisée ou payée). Le montant estimé est
 * la moyenne des mois facturés (TTC).
 */
export function facturationMensuelle(
  factures: { client: string; emiseLe: Date | null; montantCents: number }[],
  maintenant: Date,
): Map<string, { moisFactures: number; moyenneCents: number }> {
  const mois = derniersMois(maintenant, 5).slice(0, 4);
  const parClient = new Map<string, Map<string, number>>();
  for (const f of factures) {
    if (!f.emiseLe || f.montantCents <= 0) continue;
    const mo = jourReunion(f.emiseLe).slice(0, 7);
    if (!mois.includes(mo)) continue;
    const m = parClient.get(f.client) ?? new Map<string, number>();
    m.set(mo, (m.get(mo) ?? 0) + f.montantCents);
    parClient.set(f.client, m);
  }
  const out = new Map<string, { moisFactures: number; moyenneCents: number }>();
  for (const [client, m] of parClient) {
    if (m.size < 3) continue;
    const total = [...m.values()].reduce((t, v) => t + v, 0);
    out.set(client, { moisFactures: m.size, moyenneCents: Math.round(total / m.size) });
  }
  return out;
}

/* ------------------------------------------------- l'encart d'accueil -- */

/** « Revenu mensuel : 4 212 € · 42 % de l'objectif 10 000 € · +300 € ce mois-ci » */
export function texteEncart(actuelCents: number, objectifCents: number, netDuMoisCents: number): { montant: string; detail: string; pourcentage: number } {
  const euros = (c: number) => `${Math.round(c / 100).toLocaleString("fr-FR")} €`;
  const pourcentage = objectifCents > 0 ? Math.floor((actuelCents / objectifCents) * 100) : 0;
  const signe = netDuMoisCents > 0 ? "+" : netDuMoisCents < 0 ? "−" : "±";
  return {
    montant: euros(actuelCents),
    pourcentage,
    detail: `${pourcentage} % de l'objectif ${euros(objectifCents)} · ${signe}${euros(Math.abs(netDuMoisCents))} ce mois-ci`,
  };
}
