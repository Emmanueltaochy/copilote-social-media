import "server-only";

import { cleEmail } from "@/lib/annuaire";
import { etatPaiement, parNom } from "@/lib/etape3-regles";
import { jourReunion, type DonneesRevenu } from "@/lib/revenu-regles";
import {
  DUREE_MAX_MS,
  adressesConnues,
  baseApi,
  candidats,
  effacerLignes,
  etatReleve,
  ficheDe,
  liensManuels,
  lireJson,
  majReleve,
  oublierReleve,
  prendreBail,
  remplacerLignes,
  rendreBail,
  type LigneSource,
} from "@/lib/releves";
import { forgetSecret, getSecretChiffre, noterErreur, setSecretChiffre } from "@/lib/secrets";

/*
 * GoCardless (prélèvements), en lecture seule : clients, mandats, abonnements
 * et paiements.
 *
 * Raccordement : un jeton d'accès « Read-only » (GoCardless → Développeurs →
 * Créer → Jeton d'accès), chiffré dans `integrations`. Environnement live
 * par défaut ; sandbox possible pour essayer.
 *
 * CE QUE CE MODULE NE FAIT JAMAIS : écrire chez GoCardless. Seules des
 * requêtes GET partent (lireJson) : aucun paiement, remboursement, mandat
 * ni abonnement créé, modifié ou annulé. Le jeton lui-même est en lecture
 * seule : même une erreur de code ne pourrait rien écrire.
 *
 * Rapprochement client GoCardless ↔ fiche : par e-mail (adresse exacte d'une
 * fiche, d'un contact ou d'un compte portail), sinon par nom d'entreprise
 * (même normalisation que Trello), ou un lien manuel posé depuis la fiche
 * (links.gocardlessCustomerId), qui l'emporte. Un client délié à la main
 * (links.gocardlessExclus) n'est plus repris automatiquement.
 *
 * Gardé, pour un client rattaché : une ligne par mandat, par abonnement et
 * par paiement des 13 derniers mois (directory_events, source « gocardless »).
 * Pour un client sans fiche : son nom, son e-mail et le nombre de paiements
 * en échec, pour pouvoir le relier.
 *
 * Pour la page « Revenu mensuel » (src/lib/revenu.ts), le même relevé garde
 * aussi, pour TOUS les clients (avec ou sans fiche), un résumé des
 * abonnements, mandats et paiements dans releves.donnees.revenu, et lit les
 * événements d'arrêt des abonnements et des mandats (annulé, terminé, mis en
 * pause) des 13 derniers mois : c'est la seule façon de savoir QUAND un
 * abonnement s'est arrêté. Toujours en GET ; si ces événements ne peuvent
 * pas être lus, la page le dit et estime la date.
 */

const ID = "gocardless";
export type Environnement = "live" | "sandbox";

const API = (env: Environnement) => baseApi("GOCARDLESS_API_BASE", env === "sandbox" ? "https://api-sandbox.gocardless.com" : "https://api.gocardless.com");
const entetes = (jeton: string) => ({ Authorization: `Bearer ${jeton}`, "GoCardless-Version": "2015-07-06" });

type Page<K extends string, T> = { [k in K]: T[] } & { meta?: { cursors?: { after?: string | null } } };

/** Toutes les pages d'une liste (curseur `after`), dans la limite de `maxPages` × 500. */
async function liste<T>(jeton: string, env: Environnement, ressource: string, params: Record<string, string> = {}, maxPages = 20): Promise<T[]> {
  const out: T[] = [];
  let apres: string | null | undefined;
  for (let i = 0; i < maxPages; i++) {
    const u = new URL(`${API(env)}/${ressource}`);
    u.searchParams.set("limit", "500");
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    if (apres) u.searchParams.set("after", apres);
    const r = await lireJson<Page<string, T>>("GoCardless", u.toString(), entetes(jeton));
    out.push(...((r as Record<string, T[]>)[ressource] ?? []));
    apres = r.meta?.cursors?.after;
    if (!apres) break;
  }
  return out;
}

export type ClientGc = { id: string; email: string | null; company_name: string | null; given_name: string | null; family_name: string | null };
type MandatGc = { id: string; status: string; reference?: string | null; scheme?: string | null; created_at: string; next_possible_charge_date?: string | null; links: { customer: string } };
type AbonnementGc = {
  id: string;
  status: string;
  amount: number;
  currency: string;
  name?: string | null;
  interval?: number;
  interval_unit: string;
  start_date?: string | null;
  end_date?: string | null;
  created_at: string;
  upcoming_payments?: { charge_date: string; amount: number }[];
  metadata?: Record<string, string> | null;
  links: { mandate: string };
};
type EvenementGc = { id: string; created_at: string; action: string; resource_type: string; links: { subscription?: string; mandate?: string } };
type PaiementGc = {
  id: string;
  status: string;
  amount: number;
  currency: string;
  charge_date: string | null;
  reference?: string | null;
  description?: string | null;
  created_at: string;
  links: { mandate: string; subscription?: string };
};

const nomClient = (c: ClientGc) => c.company_name?.trim() || [c.given_name, c.family_name].filter(Boolean).join(" ").trim() || c.email || c.id;

/** « Tester et enregistrer » : une lecture de la liste des clients (un seul). Rien n'est modifié. */
export async function testerGoCardless(jeton: string, env: Environnement): Promise<{ ok: true; clients: number } | { ok: false; erreur: string }> {
  try {
    const u = new URL(`${API(env)}/customers`);
    u.searchParams.set("limit", "1");
    await lireJson<Page<"customers", ClientGc>>("GoCardless", u.toString(), entetes(jeton));
    return { ok: true, clients: 0 };
  } catch (e) {
    const err = e as Error & { statut?: number };
    return {
      ok: false,
      erreur:
        err.statut === 401
          ? `GoCardless refuse ce jeton (401) en ${env === "live" ? "live" : "sandbox"}. Vérifiez qu'il vient du bon environnement (live ou sandbox) et qu'il n'a pas été révoqué.`
          : err.statut === 403
            ? "GoCardless refuse l'accès (403) : ce jeton n'a pas le droit de lire les clients."
            : err.message,
    };
  }
}

export async function enregistrerGoCardless(jeton: string, env: Environnement) {
  await setSecretChiffre(ID, jeton, env);
  await majReleve(ID, { config: { environnement: env }, lastError: null });
}

export async function deconnecterGoCardless(effacer: boolean) {
  await forgetSecret(ID);
  await oublierReleve(ID);
  if (effacer) await effacerLignes(ID);
}

export const goCardlessRelie = async () => (await getSecretChiffre(ID)) !== null;

/* --------------------------------------------------------------- relevé -- */

export type ClientSansFiche = { id: string; nom: string; email: string | null; echecs: number };
export type BilanGc = { le: string; dureeMs: number; clients: number; rattaches: number; sansFiche: number; mandats: number; abonnements: number; paiements: number };

export async function releverGoCardless(): Promise<{ etat: "fait"; bilan: BilanGc } | { etat: "non_relie" | "deja_en_cours" } | { etat: "erreur"; erreur: string }> {
  const secret = await getSecretChiffre(ID);
  if (!secret) return { etat: "non_relie" };
  if (secret === "illisible") {
    const erreur = "Le jeton GoCardless enregistré ne peut plus être lu (clé de chiffrement changée) : recollez-le dans Réglages → GoCardless.";
    await noterErreur(ID, erreur);
    return { etat: "erreur", erreur };
  }
  const env: Environnement = secret.account === "sandbox" ? "sandbox" : "live";
  if (!(await prendreBail(ID))) return { etat: "deja_en_cours" };
  const debut = Date.now();
  try {
    const depuis = new Date(Date.now() - 395 * 86_400_000).toISOString();
    const jeton = secret.token;
    const clientsGc = await liste<ClientGc>(jeton, env, "customers");
    const mandats = await liste<MandatGc>(jeton, env, "mandates");
    const abonnements = await liste<AbonnementGc>(jeton, env, "subscriptions");
    if (Date.now() - debut > DUREE_MAX_MS) throw new Error("Relevé GoCardless trop long : il reprendra au prochain passage.");
    const paiements = await liste<PaiementGc>(jeton, env, "payments", { "created_at[gte]": depuis });
    // Les arrêts d'abonnements et de mandats (pour dater le revenu perdu).
    // Une erreur ici ne fait pas échouer le relevé : la page « Revenu
    // mensuel » estimera ces dates, et le dira.
    let evenements: EvenementGc[] = [];
    let evenementsLus = false;
    if (Date.now() - debut < DUREE_MAX_MS) {
      try {
        evenements = [
          ...(await liste<EvenementGc>(jeton, env, "events", { resource_type: "subscriptions", "created_at[gte]": depuis }, 10)),
          ...(await liste<EvenementGc>(jeton, env, "events", { resource_type: "mandates", "created_at[gte]": depuis }, 10)),
        ];
        evenementsLus = true;
      } catch (e) {
        console.warn("[pilot] relevé GoCardless, événements non lus :", (e as Error).message);
      }
    }

    // Le rapprochement : lien manuel, puis e-mail, puis nom d'entreprise.
    const [adresses, noms, liens] = await Promise.all([adressesConnues(), candidats(), liensManuels()]);
    const manuels = new Map<string, (typeof liens)[number]>();
    const exclus = new Map<string, Set<string>>();
    for (const l of liens) {
      if (l.links?.gocardlessCustomerId) manuels.set(l.links.gocardlessCustomerId, l);
      for (const c of l.links?.gocardlessExclus ?? []) exclus.set(c, new Set([...(exclus.get(c) ?? []), l.id, ...(l.clientId ? [l.clientId] : [])]));
    }
    const fiches = new Map<string, string>();
    const ficheDuClientGc = new Map<string, { entryId: string; par: "manuel" | "email" | "nom" }>();
    for (const c of clientsGc) {
      const m = manuels.get(c.id);
      let cible = m ? { entryId: m.clientId ? null : m.id, clientId: m.clientId, nom: m.name } : null;
      let par: "manuel" | "email" | "nom" = "manuel";
      if (!cible) {
        const parEmail = adresses.get(cleEmail(c.email) ?? "");
        const parEntreprise = parNom(c.company_name, noms);
        const trouve = parEmail ?? parEntreprise;
        par = parEmail ? "email" : "nom";
        const exclu = trouve && exclus.get(c.id);
        cible = trouve && !(exclu && (exclu.has(trouve.clientId ?? "") || exclu.has(trouve.entryId ?? ""))) ? trouve : null;
      }
      if (!cible) continue;
      const entryId = await ficheDe(cible, fiches);
      if (entryId) ficheDuClientGc.set(c.id, { entryId, par });
    }

    const clientDuMandat = new Map(mandats.map((m) => [m.id, m.links.customer]));
    const lignes: LigneSource[] = [];
    const ficheDeMandat = (mandat: string) => ficheDuClientGc.get(clientDuMandat.get(mandat) ?? "");
    for (const m of mandats) {
      const f = ficheDuClientGc.get(m.links.customer);
      if (!f) continue;
      lignes.push({
        entryId: f.entryId,
        source: ID,
        kind: "mandat",
        externalId: m.id,
        occurredAt: new Date(m.created_at),
        title: `Mandat de prélèvement ${m.reference ?? m.id}`,
        meta: { statut: m.status, reference: m.reference ?? null, schema: m.scheme ?? null, client: m.links.customer, par: f.par, environnement: env },
      });
    }
    for (const a of abonnements) {
      const f = ficheDeMandat(a.links.mandate);
      if (!f) continue;
      const prochaine = (a.upcoming_payments ?? []).map((p) => p.charge_date).sort()[0] ?? null;
      lignes.push({
        entryId: f.entryId,
        source: ID,
        kind: "abonnement",
        externalId: a.id,
        occurredAt: new Date(a.created_at),
        title: a.name?.trim() || "Abonnement GoCardless",
        meta: { statut: a.status, montantCents: a.amount, devise: a.currency, intervalle: a.interval ?? 1, unite: a.interval_unit, prochaine, aVenir: (a.upcoming_payments ?? []).slice(0, 3), mandat: a.links.mandate, environnement: env },
      });
    }
    const echecsSansFiche = new Map<string, number>();
    for (const p of paiements) {
      const f = ficheDeMandat(p.links.mandate);
      if (!f) {
        if (etatPaiement(p.status) === "echec") {
          const c = clientDuMandat.get(p.links.mandate) ?? "";
          echecsSansFiche.set(c, (echecsSansFiche.get(c) ?? 0) + 1);
        }
        continue;
      }
      lignes.push({
        entryId: f.entryId,
        source: ID,
        kind: "paiement",
        externalId: p.id,
        occurredAt: new Date(p.charge_date ? `${p.charge_date}T08:00:00Z` : p.created_at),
        title: p.description?.trim() || p.reference?.trim() || "Prélèvement GoCardless",
        meta: {
          statut: p.status,
          etat: etatPaiement(p.status),
          montantCents: p.amount,
          devise: p.currency,
          dateDePrelevement: p.charge_date,
          reference: p.reference ?? null,
          description: p.description ?? null,
          mandat: p.links.mandate,
          abonnement: p.links.subscription ?? null,
          environnement: env,
        },
      });
    }
    await remplacerLignes(ID, lignes);

    const sansFiche: ClientSansFiche[] = clientsGc
      .filter((c) => !ficheDuClientGc.has(c.id))
      .map((c) => ({ id: c.id, nom: nomClient(c).slice(0, 160), email: c.email, echecs: echecsSansFiche.get(c.id) ?? 0 }));
    const bilan: BilanGc = {
      le: new Date().toISOString(),
      dureeMs: Date.now() - debut,
      clients: clientsGc.length,
      rattaches: ficheDuClientGc.size,
      sansFiche: sansFiche.length,
      mandats: mandats.length,
      abonnements: abonnements.length,
      paiements: paiements.length,
    };
    const revenu = resumeRevenu({ env, depuis, clientsGc, mandats, abonnements, paiements, evenements, evenementsLus, ficheDuClientGc });
    const maintenant = new Date();
    await majReleve(ID, { lastRunAt: maintenant, lastSuccessAt: maintenant, lastError: null, lastResult: bilan as unknown as Record<string, unknown>, donnees: { sansFiche, revenu } as unknown as Record<string, unknown> });
    await noterErreur(ID, null, maintenant);
    return { etat: "fait", bilan };
  } catch (e) {
    const erreur = (e as Error).message;
    console.warn("[pilot] relevé GoCardless :", erreur);
    await noterErreur(ID, erreur, new Date()).catch(() => undefined);
    await majReleve(ID, { lastRunAt: new Date(), lastError: erreur }).catch(() => undefined);
    return { etat: "erreur", erreur };
  } finally {
    await rendreBail(ID).catch(() => undefined);
  }
}

/**
 * Le résumé gardé pour la page « Revenu mensuel » : tous les abonnements,
 * mandats et paiements relevés (avec ou sans fiche), réduits à ce qui sert au
 * calcul. Aucune coordonnée bancaire.
 */
function resumeRevenu(x: {
  env: Environnement;
  depuis: string;
  clientsGc: ClientGc[];
  mandats: MandatGc[];
  abonnements: AbonnementGc[];
  paiements: PaiementGc[];
  evenements: EvenementGc[];
  evenementsLus: boolean;
  ficheDuClientGc: Map<string, { entryId: string }>;
}): DonneesRevenu {
  const clientDuMandat = new Map(x.mandats.map((m) => [m.id, m.links.customer]));
  // Le dernier arrêt connu de chaque abonnement et de chaque mandat.
  const ARRETS = new Set(["cancelled", "finished", "paused", "expired", "failed", "blocked"]);
  const arrets = new Map<string, string>();
  for (const e of x.evenements) {
    const id = e.resource_type === "subscriptions" ? e.links.subscription : e.links.mandate;
    if (!id || !ARRETS.has(e.action)) continue;
    const jour = jourReunion(e.created_at);
    if ((arrets.get(id) ?? "") < jour) arrets.set(id, jour);
  }
  const tva = (m: AbonnementGc["metadata"]): number | null => {
    for (const [k, v] of Object.entries(m ?? {})) {
      if (!/^(tva|taux_?tva|vat|vat_?rate|tax_?rate)$/i.test(k)) continue;
      const n = Number(String(v).replace("%", "").replace(",", ".").trim());
      if (Number.isFinite(n) && n >= 0 && n <= 30) return n;
    }
    return null;
  };
  const utiles = new Set([...x.abonnements.map((a) => clientDuMandat.get(a.links.mandate) ?? ""), ...x.mandats.map((m) => m.links.customer)]);
  return {
    version: 1,
    le: new Date().toISOString(),
    environnement: x.env,
    depuis: x.depuis,
    evenementsLus: x.evenementsLus,
    abonnements: x.abonnements.map((a) => ({
      id: a.id,
      nom: (a.name?.trim() || "Abonnement GoCardless").slice(0, 120),
      statut: a.status,
      montantCents: a.amount,
      devise: a.currency,
      intervalle: a.interval ?? 1,
      unite: a.interval_unit,
      debut: jourReunion(a.created_at),
      premierPrelevement: a.start_date ?? null,
      finPrevue: a.end_date ?? null,
      arret: arrets.get(a.id) ?? null,
      client: clientDuMandat.get(a.links.mandate) ?? "",
      mandat: a.links.mandate,
      tauxTva: tva(a.metadata),
      aVenir: (a.upcoming_payments ?? []).slice(0, 10).map((p) => ({ date: p.charge_date, montantCents: p.amount })),
    })),
    paiements: x.paiements.map((p) => ({
      id: p.id,
      statut: p.status,
      montantCents: p.amount,
      devise: p.currency,
      date: p.charge_date,
      abonnement: p.links.subscription ?? null,
      mandat: p.links.mandate,
      client: clientDuMandat.get(p.links.mandate) ?? "",
      libelle: (p.description?.trim() || p.reference?.trim() || "Prélèvement GoCardless").slice(0, 120),
    })),
    mandats: x.mandats.map((m) => ({
      id: m.id,
      statut: m.status,
      client: m.links.customer,
      creeLe: jourReunion(m.created_at),
      annuleLe: arrets.get(m.id) ?? null,
      reference: m.reference ?? null,
    })),
    clients: x.clientsGc.filter((c) => utiles.has(c.id)).map((c) => ({ id: c.id, nom: nomClient(c).slice(0, 160), entryId: x.ficheDuClientGc.get(c.id)?.entryId ?? null })),
  };
}

/* ------------------------------------------------------------ lectures -- */

export async function etatGoCardless() {
  const [secret, etat] = await Promise.all([getSecretChiffre(ID), etatReleve(ID)]);
  return {
    relie: secret !== null,
    illisible: secret === "illisible",
    environnement: (secret && secret !== "illisible" && secret.account === "sandbox" ? "sandbox" : "live") as Environnement,
    erreur: etat?.lastError ?? null,
    dernierReleve: etat?.lastRunAt ?? null,
    enCours: Boolean(etat?.leaseUntil && etat.leaseUntil.getTime() > Date.now()),
    bilan: (etat && Object.keys(etat.lastResult ?? {}).length ? etat.lastResult : null) as BilanGc | null,
    sansFiche: ((etat?.donnees as { sansFiche?: ClientSansFiche[] } | undefined)?.sansFiche ?? []) as ClientSansFiche[],
  };
}
