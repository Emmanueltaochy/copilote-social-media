import "server-only";

import { colonneTrello, decouperCarte, parNom, type CarteTrello, type Categorie } from "@/lib/etape3-regles";
import {
  DUREE_MAX_MS,
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
 * Trello, en lecture seule : les cartes des tableaux qu'Emmanuel choisit de
 * suivre (le tableau principal : « CEO / EMMANUEL TAOCHY »).
 *
 * Raccordement : une clé d'API et un jeton (trello.com/power-ups/admin →
 * Power-Up → Clé API, puis « Jeton »), chiffrés dans `integrations`. Ils
 * partent dans l'en-tête Authorization, jamais dans l'adresse (qui finirait
 * dans des journaux).
 *
 * CE QUE CE MODULE NE FAIT JAMAIS : écrire chez Trello. Seules des requêtes
 * GET partent (lireJson) ; pas de carte créée, déplacée, commentée ni
 * archivée.
 *
 * Rapprochement carte ↔ fiche : le nom du client avant « — » (« 🌐 VTC
 * Services+ — Améliorer le programme tablette »), sans symbole, accents ni
 * casse, comparé aux noms des clients et des fiches ; ou un lien manuel posé
 * depuis la fiche (links.trelloCartes), qui l'emporte ; une carte déliée à la
 * main (links.trelloExclues) n'est plus reprise par le nom. Les cartes
 * « Agence — … » / « Tous les clients — … » valent pour toute l'agence.
 */

const ID = "trello";
const API = () => baseApi("TRELLO_API_BASE", "https://api.trello.com");

type Identifiants = { cle: string; jeton: string };

const entetes = (i: Identifiants) => ({ Authorization: `OAuth oauth_consumer_key="${i.cle}", oauth_token="${i.jeton}"` });

async function get<T>(i: Identifiants, chemin: string, params: Record<string, string> = {}): Promise<T> {
  const u = new URL(API() + chemin);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return lireJson<T>("Trello", u.toString(), entetes(i));
}

export type Tableau = { id: string; nom: string };

/** Le tableau principal d'Emmanuel, coché d'office au raccordement. */
const estTableauPrincipal = (nom: string) => /ceo/i.test(nom) && /emmanuel/i.test(nom) && /taochy/i.test(nom);

/** « Tester et enregistrer » : qui est connecté, et ses tableaux ouverts. Rien n'est modifié. */
export async function testerTrello(cle: string, jeton: string): Promise<{ ok: true; membre: string; tableaux: Tableau[] } | { ok: false; erreur: string }> {
  const i = { cle, jeton };
  try {
    const moi = await get<{ username?: string; fullName?: string }>(i, "/1/members/me", { fields: "username,fullName" });
    const tableaux = await get<{ id: string; name: string; closed?: boolean }[]>(i, "/1/members/me/boards", { filter: "open", fields: "name,closed" });
    return { ok: true, membre: moi.fullName || moi.username || "compte Trello", tableaux: tableaux.filter((b) => !b.closed).map((b) => ({ id: b.id, nom: b.name })) };
  } catch (e) {
    const err = e as Error & { statut?: number };
    return { ok: false, erreur: err.statut === 401 ? "Trello refuse la clé ou le jeton (401). Recopiez-les depuis trello.com/power-ups/admin : clé API du Power-Up, puis « Jeton »." : err.message };
  }
}

export async function enregistrerTrello(cle: string, jeton: string, membre: string, tableaux: Tableau[]) {
  await setSecretChiffre(ID, JSON.stringify({ cle, jeton }), membre);
  const avant = (await etatReleve(ID))?.config as { suivis?: string[] } | undefined;
  const principal = tableaux.filter((t) => estTableauPrincipal(t.nom)).map((t) => t.id);
  const suivis = (avant?.suivis ?? []).filter((id) => tableaux.some((t) => t.id === id));
  await majReleve(ID, { config: { disponibles: tableaux, suivis: suivis.length ? suivis : principal }, lastError: null });
}

export async function choisirTableaux(ids: string[]) {
  const etat = await etatReleve(ID);
  const config = (etat?.config ?? {}) as { disponibles?: Tableau[]; suivis?: string[] };
  const permis = new Set((config.disponibles ?? []).map((t) => t.id));
  await majReleve(ID, { config: { ...config, suivis: ids.filter((id) => permis.has(id)) } });
}

export async function deconnecterTrello(effacer: boolean) {
  await forgetSecret(ID);
  await oublierReleve(ID);
  if (effacer) await effacerLignes(ID);
}

async function identifiants(): Promise<Identifiants | "illisible" | null> {
  const s = await getSecretChiffre(ID);
  if (!s || s === "illisible") return s;
  try {
    const j = JSON.parse(s.token) as Identifiants;
    return j.cle && j.jeton ? j : null;
  } catch {
    return null;
  }
}

export const trelloRelie = async () => (await getSecretChiffre(ID)) !== null;

/* --------------------------------------------------------------- relevé -- */

/** Une carte telle que Pilot la garde, avec sa fiche s'il y en a une. */
export type CarteVue = CarteTrello & {
  action: string;
  client: string | null;
  categorie: Categorie | null;
  agence: boolean;
  entryId: string | null;
  clientId: string | null;
  /** Le nom à afficher : le client ou la fiche, ou ce qu'écrit la carte. */
  qui: string;
  par: "nom" | "manuel" | null;
};

export type BilanTrello = { le: string; dureeMs: number; tableaux: number; cartes: number; rattachees: number; agence: number; sansFiche: number; incomplet: boolean };

type CarteBrute = { id: string; name: string; idList: string; due: string | null; dueComplete?: boolean; dateLastActivity: string; shortUrl?: string; url?: string; closed?: boolean };
type ActionBrute = { type: string; date: string; data?: { card?: { id?: string }; listAfter?: { id?: string }; list?: { id?: string } } };

/** La date du jour à La Réunion (AAAA-MM-JJ) d'un instant : l'échéance d'une carte, au jour. */
const jourReunion = (iso: string) => new Date(Date.parse(iso) + 4 * 3_600_000).toISOString().slice(0, 10);

export async function releverTrello(): Promise<{ etat: "fait"; bilan: BilanTrello } | { etat: "non_relie" | "deja_en_cours" } | { etat: "erreur"; erreur: string }> {
  const ids = await identifiants();
  if (!ids) return { etat: "non_relie" };
  if (ids === "illisible") {
    const erreur = "La clé Trello enregistrée ne peut plus être lue (clé de chiffrement changée) : recollez-la dans Réglages → Trello.";
    await noterErreur(ID, erreur);
    return { etat: "erreur", erreur };
  }
  if (!(await prendreBail(ID))) return { etat: "deja_en_cours" };
  const debut = Date.now();
  try {
    const config = ((await etatReleve(ID))?.config ?? {}) as { disponibles?: Tableau[]; suivis?: string[] };
    const suivis = config.suivis ?? [];
    const [noms, liens] = await Promise.all([candidats(), liensManuels()]);
    const manuels = new Map<string, (typeof liens)[number]>();
    const exclues = new Map<string, Set<string>>();
    for (const l of liens) {
      for (const c of l.links?.trelloCartes ?? []) manuels.set(c, l);
      for (const c of l.links?.trelloExclues ?? []) exclues.set(c, new Set([...(exclues.get(c) ?? []), l.id, ...(l.clientId ? [l.clientId] : [])]));
    }
    const cartes: CarteVue[] = [];
    let incomplet = false;
    for (const tableauId of suivis) {
      if (Date.now() - debut > DUREE_MAX_MS) {
        incomplet = true;
        break;
      }
      const [tableau, listes, brutes, actions] = await Promise.all([
        get<{ id: string; name: string }>(ids, `/1/boards/${encodeURIComponent(tableauId)}`, { fields: "name" }),
        get<{ id: string; name: string }[]>(ids, `/1/boards/${encodeURIComponent(tableauId)}/lists`, { filter: "open", fields: "name" }),
        get<CarteBrute[]>(ids, `/1/boards/${encodeURIComponent(tableauId)}/cards`, { filter: "open", fields: "name,idList,due,dueComplete,dateLastActivity,shortUrl,url,closed" }),
        get<ActionBrute[]>(ids, `/1/boards/${encodeURIComponent(tableauId)}/actions`, { filter: "updateCard:idList,createCard,moveCardToBoard", limit: "1000", fields: "type,date,data" }),
      ]);
      const nomListe = new Map(listes.map((l) => [l.id, l.name]));
      // L'arrivée de chaque carte dans sa colonne actuelle : le dernier
      // déplacement vers elle (ou sa création dedans).
      const arrivee = new Map<string, string>();
      for (const a of actions) {
        const carte = a.data?.card?.id;
        const vers = a.data?.listAfter?.id ?? (a.type !== "updateCard" ? a.data?.list?.id : undefined);
        if (!carte || !vers) continue;
        const k = `${carte}|${vers}`;
        if (!arrivee.has(k) || arrivee.get(k)! < a.date) arrivee.set(k, a.date);
      }
      for (const c of brutes) {
        if (c.closed || !nomListe.has(c.idList)) continue;
        const colonne = nomListe.get(c.idList)!;
        const d = decouperCarte(c.name);
        const manuel = manuels.get(c.id);
        let cible = manuel ? { entryId: manuel.clientId ? null : manuel.id, clientId: manuel.clientId, nom: manuel.name } : null;
        if (!cible && d.client && !d.agence) {
          const trouve = parNom(d.client, noms);
          const exclu = trouve && exclues.get(c.id);
          cible = trouve && !(exclu && (exclu.has(trouve.clientId ?? "") || exclu.has(trouve.entryId ?? ""))) ? trouve : null;
        }
        cartes.push({
          id: c.id,
          nom: c.name.slice(0, 300),
          url: c.shortUrl || c.url || `https://trello.com/c/${c.id}`,
          tableau: tableau.name,
          colonne,
          colonneCle: colonneTrello(colonne),
          echeance: c.due,
          echeanceFaite: Boolean(c.dueComplete),
          derniereActivite: c.dateLastActivity,
          dansLaColonneDepuis: arrivee.get(`${c.id}|${c.idList}`) ?? c.dateLastActivity,
          action: d.action.slice(0, 300),
          client: d.client,
          categorie: d.categorie,
          agence: d.agence,
          entryId: cible?.entryId ?? null,
          clientId: cible?.clientId ?? null,
          qui: cible?.nom ?? (d.agence ? "Agence" : (d.client ?? "Sans client")),
          par: manuel ? "manuel" : cible ? "nom" : null,
        });
      }
    }

    // Les lignes de frise des cartes rattachées à une fiche.
    const fiches = new Map<string, string>();
    const lignes: LigneSource[] = [];
    for (const c of cartes) {
      const entryId = await ficheDe({ entryId: c.entryId, clientId: c.clientId }, fiches);
      if (!entryId) continue;
      lignes.push({
        entryId,
        source: ID,
        kind: "action",
        externalId: c.id,
        occurredAt: new Date(c.derniereActivite),
        title: c.action,
        body: null,
        dueOn: c.echeance ? jourReunion(c.echeance) : null,
        doneAt: c.colonneCle === "termine" ? new Date(c.derniereActivite) : null,
        meta: { carte: c.nom, url: c.url, colonne: c.colonne, colonneCle: c.colonneCle, tableau: c.tableau, echeance: c.echeance, echeanceFaite: c.echeanceFaite, categorie: c.categorie, par: c.par, depuis: c.dansLaColonneDepuis },
      });
    }
    if (!incomplet) await remplacerLignes(ID, lignes);

    const bilan: BilanTrello = {
      le: new Date().toISOString(),
      dureeMs: Date.now() - debut,
      tableaux: suivis.length,
      cartes: cartes.length,
      rattachees: cartes.filter((c) => c.entryId || c.clientId).length,
      agence: cartes.filter((c) => c.agence).length,
      sansFiche: cartes.filter((c) => !c.entryId && !c.clientId && !c.agence).length,
      incomplet,
    };
    const maintenant = new Date();
    await majReleve(ID, {
      lastRunAt: maintenant,
      lastSuccessAt: incomplet ? undefined : maintenant,
      lastError: null,
      lastResult: bilan as unknown as Record<string, unknown>,
      ...(incomplet ? {} : { donnees: { cartes } as unknown as Record<string, unknown> }),
    });
    await noterErreur(ID, null, maintenant);
    return { etat: "fait", bilan };
  } catch (e) {
    const erreur = (e as Error).message;
    console.warn("[pilot] relevé Trello :", erreur);
    await noterErreur(ID, erreur, new Date()).catch(() => undefined);
    await majReleve(ID, { lastRunAt: new Date(), lastError: erreur }).catch(() => undefined);
    return { etat: "erreur", erreur };
  } finally {
    await rendreBail(ID).catch(() => undefined);
  }
}

/* ------------------------------------------------------------ lectures -- */

export async function etatTrello() {
  const [secret, etat] = await Promise.all([getSecretChiffre(ID), etatReleve(ID)]);
  const config = (etat?.config ?? {}) as { disponibles?: Tableau[]; suivis?: string[] };
  const cartes = ((etat?.donnees as { cartes?: CarteVue[] } | undefined)?.cartes ?? []) as CarteVue[];
  return {
    relie: secret !== null,
    illisible: secret === "illisible",
    membre: secret && secret !== "illisible" ? secret.account : null,
    disponibles: config.disponibles ?? [],
    suivis: config.suivis ?? [],
    erreur: etat?.lastError ?? null,
    dernierReleve: etat?.lastRunAt ?? null,
    enCours: Boolean(etat?.leaseUntil && etat.leaseUntil.getTime() > Date.now()),
    bilan: (etat && Object.keys(etat.lastResult ?? {}).length ? etat.lastResult : null) as BilanTrello | null,
    cartes,
  };
}

/** Toutes les cartes des tableaux suivis, vues au dernier relevé (pour « Ce matin » et les cartes sans fiche). */
export async function cartesTrello(): Promise<CarteVue[]> {
  const etat = await etatReleve(ID);
  return ((etat?.donnees as { cartes?: CarteVue[] } | undefined)?.cartes ?? []) as CarteVue[];
}
