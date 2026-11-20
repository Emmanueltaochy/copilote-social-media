import "server-only";

import { eq, inArray, isNotNull, sql } from "drizzle-orm";
import { clients, contractLines, db, directoryEntries, settings } from "@/db";
import { abbyRaccorde, facturesRecentes } from "@/lib/abby";
import { etatGoCardless } from "@/lib/gocardless";
import { etatReleve } from "@/lib/releves";
import {
  echecsRecents,
  evolution,
  facturationMensuelle,
  horsTaxesCents,
  lireReglages,
  mandatsPerdus,
  moyenneParClient,
  parClient,
  parOffre,
  prochainsPrelevements,
  revenuActuel,
  texteEncart,
  type DonneesRevenu,
  type ReglagesRevenu,
} from "@/lib/revenu-regles";

/*
 * Le revenu mensuel récurrent de l'agence (page /revenu, direction seulement).
 *
 * Tout vient de ce que le relevé GoCardless a déjà gardé
 * (releves.donnees.revenu, voir src/lib/gocardless.ts) : cette page
 * n'interroge pas GoCardless. Seules les factures Abby sont lues (en GET,
 * mises en cache 10 minutes) pour repérer les clients facturés tous les mois
 * sans prélèvement. Les règles de calcul sont dans revenu-regles.ts.
 */

/* ------------------------------------------------------------- réglages -- */

export async function reglagesRevenu(): Promise<ReglagesRevenu> {
  const [r] = await db.select({ goal: settings.revenueGoal }).from(settings).where(eq(settings.id, "agence")).limit(1);
  return lireReglages(r?.goal);
}

export async function enregistrerReglagesRevenu(r: ReglagesRevenu) {
  const goal = r as unknown as Record<string, unknown>;
  await db
    .insert(settings)
    .values({ id: "agence", revenueGoal: goal })
    .onConflictDoUpdate({ target: settings.id, set: { revenueGoal: goal, updatedAt: new Date() } });
}

/* -------------------------------------------------------- les données -- */

async function donnees(): Promise<DonneesRevenu | null> {
  const r = await etatReleve("gocardless");
  const d = (r?.donnees as { revenu?: DonneesRevenu } | undefined)?.revenu;
  return d && d.version === 1 && Array.isArray(d.abonnements) ? d : null;
}

type Fiche = { entryId: string; nom: string; clientId: string | null; actif: boolean };

/** Les fiches (et leur client Pilot) des clients GoCardless reliés. */
async function fiches(entryIds: string[]): Promise<Map<string, Fiche>> {
  if (entryIds.length === 0) return new Map();
  const rows = await db
    .select({ id: directoryEntries.id, name: directoryEntries.name, clientId: directoryEntries.clientId, short: clients.shortName, actif: clients.active, archive: clients.archivedAt })
    .from(directoryEntries)
    .leftJoin(clients, eq(clients.id, directoryEntries.clientId))
    .where(inArray(directoryEntries.id, entryIds));
  return new Map(rows.map((r) => [r.id, { entryId: r.id, nom: r.short ?? r.name, clientId: r.clientId, actif: Boolean(r.clientId && r.actif && !r.archive) }]));
}

export const lienFiche = (f: { clientId: string | null; entryId: string | null }) => (f.clientId ?? f.entryId ? `/contacts/${f.clientId ?? f.entryId}` : null);

/* ------------------------------------------------------------- la page -- */

export type ContratSansPrelevement = {
  cle: string;
  nom: string;
  lien: string | null;
  /** Forfait social + maintenance web noté dans Pilot (centimes), si renseigné. */
  forfaitCents: number | null;
  /** Lignes de contrat (engagements de contenus) dans Pilot. */
  lignesContrat: number;
  /** Facturation mensuelle repérée chez Abby (moyenne TTC des mois facturés). */
  abby: { moyenneCents: number; moisFactures: number } | null;
};

export type VueRevenu =
  | { etat: "non_relie" }
  | { etat: "illisible" }
  | { etat: "pas_encore"; erreur: string | null; enCours: boolean; dernierReleve: Date | null }
  | ({ etat: "pret"; erreur: string | null; dernierReleve: Date | null } & Awaited<ReturnType<typeof calculer>>);

export async function vueRevenu(maintenant = new Date()): Promise<VueRevenu> {
  const gc = await etatGoCardless();
  if (!gc.relie) return { etat: "non_relie" };
  if (gc.illisible) return { etat: "illisible" };
  const d = await donnees();
  if (!d) return { etat: "pas_encore", erreur: gc.erreur, enCours: gc.enCours, dernierReleve: gc.dernierReleve };
  return { etat: "pret", erreur: gc.erreur, dernierReleve: gc.dernierReleve, ...(await calculer(d, maintenant)) };
}

async function calculer(d: DonneesRevenu, maintenant: Date) {
  const reglages = await reglagesRevenu();
  const actuel = revenuActuel(d.abonnements, reglages.tauxTva);
  const evo = evolution(d, maintenant);
  const mapFiches = await fiches([...new Set(d.clients.map((c) => c.entryId).filter((x): x is string => Boolean(x)))]);
  const ficheDuGc = new Map(d.clients.map((c) => [c.id, c.entryId ? (mapFiches.get(c.entryId) ?? null) : null]));
  const nomGc = new Map(d.clients.map((c) => [c.id, c.nom]));
  const qui = (clientGc: string) => {
    const f = ficheDuGc.get(clientGc);
    return { nom: f?.nom ?? nomGc.get(clientGc) ?? "Client GoCardless", lien: f ? lienFiche(f) : null, relie: Boolean(f) };
  };

  // Par client : la part de chacun, et le nom de sa fiche.
  const parts = parClient(d.abonnements, d.clients).map((p) => {
    const f = p.entryId ? mapFiches.get(p.entryId) : null;
    return { ...p, nom: f?.nom ?? p.nom, lien: f ? lienFiche(f) : null, relie: Boolean(f) };
  });
  const offres = parOffre(d.abonnements);
  const base = reglages.base === "ht" ? actuel.horsTaxesCents : actuel.preleveCents;
  const moyenneCents = moyenneParClient(base, parts.length);

  // Fuites et risques.
  const echecs = echecsRecents(d.paiements, maintenant).map((p) => ({ ...p, ...qui(p.client) }));
  const mandats = mandatsPerdus(d.mandats, (c) => Boolean(ficheDuGc.get(c)?.actif)).map((m) => ({ ...m, ...qui(m.client) }));
  const prochains = prochainsPrelevements(d.abonnements, d.paiements, maintenant).map((p) => ({ ...p, ...qui(p.client) }));
  const sansPrelevement = await contratsSansPrelevement(d, mapFiches, maintenant);

  return {
    reglages,
    environnement: d.environnement,
    releveLe: d.le,
    evenementsLus: d.evenementsLus,
    actuel,
    baseCents: base,
    evolution: evo,
    parts,
    offres,
    moyenneCents,
    echecs,
    mandats,
    prochains,
    sansPrelevement,
  };
}

/**
 * Les clients sous contrat sans abonnement GoCardless actif : un forfait ou
 * une maintenance notés dans Pilot, des lignes de contrat, ou des factures
 * Abby tous les mois. C'est la liste des clients à passer en prélèvement.
 */
async function contratsSansPrelevement(d: DonneesRevenu, mapFiches: Map<string, Fiche>, maintenant: Date) {
  // Les clients (Pilot) et les fiches qui ont un abonnement actif.
  const couverts = new Set<string>();
  const ficheDuGc = new Map(d.clients.map((c) => [c.id, c.entryId]));
  for (const a of d.abonnements) {
    if (a.statut !== "active") continue;
    const e = ficheDuGc.get(a.client);
    if (!e) continue;
    couverts.add(e);
    const c = mapFiches.get(e)?.clientId;
    if (c) couverts.add(c);
  }

  const [pilot, lignes, fichesAbby] = await Promise.all([
    db
      .select({ id: clients.id, short: clients.shortName, fee: clients.monthlyFeeCents, web: clients.webMaintenanceCents, abby: clients.abbyCustomerId })
      .from(clients)
      .where(sql`${clients.active} and ${clients.archivedAt} is null`),
    db.select({ clientId: contractLines.clientId, n: sql<number>`count(*)::int` }).from(contractLines).groupBy(contractLines.clientId),
    db.select({ id: directoryEntries.id, name: directoryEntries.name, clientId: directoryEntries.clientId, abby: directoryEntries.abbyCustomerId }).from(directoryEntries).where(isNotNull(directoryEntries.abbyCustomerId)),
  ]);
  const nbLignes = new Map(lignes.map((l) => [l.clientId, l.n]));

  // Abby : les clients facturés au moins 3 des 4 derniers mois.
  let abby: { etat: "raccorde" | "non_raccorde" | "erreur"; erreur: string | null } = { etat: "non_raccorde", erreur: null };
  let mensuels = new Map<string, { moisFactures: number; moyenneCents: number }>();
  const nomsAbby = new Map<string, string>();
  if (await abbyRaccorde()) {
    try {
      const factures = await facturesRecentes();
      for (const f of factures) if (f.customerId && !nomsAbby.has(f.customerId)) nomsAbby.set(f.customerId, f.customerName);
      mensuels = facturationMensuelle(
        factures.map((f) => ({ client: f.customerId, emiseLe: f.emittedAt, montantCents: f.amountCents })),
        maintenant,
      );
      abby = { etat: "raccorde", erreur: null };
    } catch (e) {
      abby = { etat: "erreur", erreur: (e as Error).message };
    }
  }

  const out = new Map<string, ContratSansPrelevement>();
  const abbyVers = new Map<string, string>(); // client Abby → clé de la ligne
  for (const c of pilot) {
    if (couverts.has(c.id)) continue;
    const forfait = c.fee + c.web;
    const n = nbLignes.get(c.id) ?? 0;
    const m = c.abby ? mensuels.get(c.abby) : undefined;
    if (forfait <= 0 && n === 0 && !m) continue;
    out.set(c.id, { cle: c.id, nom: c.short, lien: `/contacts/${c.id}`, forfaitCents: forfait > 0 ? forfait : null, lignesContrat: n, abby: m ?? null });
    if (c.abby) abbyVers.set(c.abby, c.id);
  }
  for (const f of fichesAbby) {
    if (!f.abby || abbyVers.has(f.abby) || !mensuels.has(f.abby)) continue;
    if (couverts.has(f.id) || (f.clientId && couverts.has(f.clientId))) continue;
    if (f.clientId && out.has(f.clientId)) {
      out.get(f.clientId)!.abby = mensuels.get(f.abby)!;
    } else {
      out.set(f.clientId ?? f.id, { cle: f.clientId ?? f.id, nom: f.name, lien: `/contacts/${f.clientId ?? f.id}`, forfaitCents: null, lignesContrat: 0, abby: mensuels.get(f.abby)! });
    }
    abbyVers.set(f.abby, f.clientId ?? f.id);
  }
  // Un client Abby facturé tous les mois, sans fiche reliée à Abby : nommé, sans lien.
  const couvertsAbby = new Set(
    [...pilot.filter((c) => c.abby && couverts.has(c.id)).map((c) => c.abby!), ...fichesAbby.filter((f) => f.abby && (couverts.has(f.id) || (f.clientId && couverts.has(f.clientId)))).map((f) => f.abby!)],
  );
  for (const [client, m] of mensuels) {
    if (abbyVers.has(client) || couvertsAbby.has(client)) continue;
    out.set(`abby:${client}`, { cle: `abby:${client}`, nom: nomsAbby.get(client) || "Client Abby", lien: null, forfaitCents: null, lignesContrat: 0, abby: m });
  }

  const lignesOut = [...out.values()].sort((a, b) => estimeCents(b) - estimeCents(a) || a.nom.localeCompare(b.nom, "fr"));
  return { lignes: lignesOut, abby, totalCents: lignesOut.reduce((t, l) => t + estimeCents(l), 0) };
}

/** Le montant estimé d'un contrat sans prélèvement : le forfait noté dans Pilot, sinon la moyenne Abby. */
export const estimeCents = (l: Pick<ContratSansPrelevement, "forfaitCents" | "abby">) => l.forfaitCents ?? l.abby?.moyenneCents ?? 0;

/* ------------------------------------------------------ l'encart d'accueil -- */

/**
 * L'encart de l'accueil (direction seulement, vérifié par l'appelant) : rien
 * tant que GoCardless n'est pas relié ou pas encore relevé. Ne lit que la
 * base : aucun appel à GoCardless ni à Abby.
 */
export async function encartRevenu(maintenant = new Date()) {
  const d = await donnees();
  if (!d) return null;
  const reglages = await reglagesRevenu();
  const actuel = revenuActuel(d.abonnements, reglages.tauxTva);
  const evo = evolution(d, maintenant, 1);
  const ht = reglages.base === "ht";
  const net = evo.mois.at(-1)?.netCents ?? 0;
  return {
    ...texteEncart(ht ? actuel.horsTaxesCents : actuel.preleveCents, reglages.objectifCents, ht ? horsTaxesCents(net, reglages.tauxTva) : net),
    ht,
  };
}
