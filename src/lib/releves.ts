import "server-only";

import { and, eq, inArray, ne, notInArray, sql } from "drizzle-orm";
import { clients, contacts, db, directoryEntries, directoryEvents, releves, users } from "@/db";
import { cleEmail } from "@/lib/annuaire";
import { domaineDe, estDomaineEmmanuel, estDomainePublic } from "@/lib/gmail-regles";
import type { Candidat } from "@/lib/etape3-regles";

/*
 * Ce que Trello, GoCardless et Google Agenda (étape 3) ont en commun :
 *
 *   - LECTURE SEULE : lireJson() n'envoie que des requêtes GET. Aucune
 *     méthode d'écriture n'existe ici ; scripts/test-etape3.mjs le vérifie
 *     dans le code et sur les faux serveurs.
 *   - Adresse de test : une adresse de base surchargée (TRELLO_API_BASE…)
 *     n'est prise en compte que si elle vise 127.0.0.1 ou localhost, pour
 *     qu'un réglage égaré n'envoie jamais un jeton ailleurs que chez le
 *     service.
 *   - Un seul relevé à la fois par service (bail en base, table `releves`),
 *     d'une durée bornée.
 *   - Le rapprochement avec l'annuaire (noms et adresses connues).
 */

/* --------------------------------------------------------------- réseau -- */

const BOUCLE = /^(127\.0\.0\.1|localhost|\[::1\])$/;

/** L'adresse de l'API : celle du service, ou une adresse locale de test (jamais une autre). */
export function baseApi(variable: string, defaut: string): string {
  const brut = process.env[variable]?.trim();
  if (!brut) return defaut;
  try {
    const u = new URL(brut);
    if (BOUCLE.test(u.hostname)) return brut.replace(/\/+$/, "");
  } catch {
    // adresse illisible : on garde celle du service
  }
  return defaut;
}

export const estAdresseLocale = (url: string) => {
  try {
    return BOUCLE.test(new URL(url).hostname);
  } catch {
    return false;
  }
};

export class ErreurService extends Error {
  constructor(
    message: string,
    public statut?: number,
  ) {
    super(message);
  }
}

/** Une lecture (GET, et seulement GET) qui rend du JSON, ou une erreur en français sans secret. */
export async function lireJson<T>(service: string, url: string, entetes: Record<string, string>, delaiMs = 20_000): Promise<T> {
  let r: Response;
  try {
    r = await fetch(url, { method: "GET", headers: { Accept: "application/json", ...entetes }, signal: AbortSignal.timeout(delaiMs), cache: "no-store", redirect: "error" });
  } catch (e) {
    const nom = (e as Error).name;
    throw new ErreurService(nom === "TimeoutError" || nom === "AbortError" ? `${service} n'a pas répondu à temps.` : `Impossible de joindre ${service}.`);
  }
  if (r.status === 401 || r.status === 403) throw new ErreurService(`${service} refuse l'accès (${r.status}) : vérifiez la clé ou le jeton.`, r.status);
  if (r.status === 429) throw new ErreurService(`${service} limite les requêtes pour l'instant : réessayez dans quelques minutes.`, 429);
  if (!r.ok) throw new ErreurService(`${service} répond ${r.status}.`, r.status);
  try {
    return (await r.json()) as T;
  } catch {
    throw new ErreurService(`Réponse illisible de ${service}.`);
  }
}

/* ------------------------------------------------------------------ bail -- */

export type ServiceEtape3 = "trello" | "gocardless" | "agenda";

/** Durée maximale d'un relevé ; le bail dure un peu plus pour qu'aucun second ne démarre avant. */
export const DUREE_MAX_MS = 2 * 60_000;
const BAIL_MS = 3 * 60_000;

export async function prendreBail(id: ServiceEtape3): Promise<boolean> {
  const fin = new Date(Date.now() + BAIL_MS);
  const rows = await db
    .insert(releves)
    .values({ id, leaseUntil: fin })
    .onConflictDoUpdate({ target: releves.id, set: { leaseUntil: fin }, setWhere: sql`${releves.leaseUntil} is null or ${releves.leaseUntil} < now()` })
    .returning({ id: releves.id });
  return rows.length > 0;
}

export async function rendreBail(id: ServiceEtape3) {
  await db.update(releves).set({ leaseUntil: null }).where(eq(releves.id, id));
}

export async function etatReleve(id: ServiceEtape3) {
  const [r] = await db.select().from(releves).where(eq(releves.id, id)).limit(1);
  return r ?? null;
}

export async function majReleve(id: ServiceEtape3, champs: Partial<typeof releves.$inferInsert>) {
  await db
    .insert(releves)
    .values({ id, ...champs, updatedAt: new Date() })
    .onConflictDoUpdate({ target: releves.id, set: { ...champs, updatedAt: new Date() } });
}

/** Au déconnecter : on oublie l'état, les réglages et ce qui n'avait pas de fiche. */
export async function oublierReleve(id: ServiceEtape3) {
  await db.delete(releves).where(eq(releves.id, id));
}

/* -------------------------------------------------------- l'annuaire -- */

/** Tous les noms de l'annuaire : clients (nom et nom court) et fiches. */
export async function candidats(): Promise<Candidat[]> {
  const [cl, fiches] = await Promise.all([
    db.select({ id: clients.id, name: clients.name, short: clients.shortName }).from(clients),
    db.select({ id: directoryEntries.id, clientId: directoryEntries.clientId, name: directoryEntries.name }).from(directoryEntries),
  ]);
  const out: Candidat[] = [];
  for (const c of cl) {
    out.push({ entryId: null, clientId: c.id, nom: c.name });
    if (c.short && c.short !== c.name) out.push({ entryId: null, clientId: c.id, nom: c.short });
  }
  for (const f of fiches) out.push({ entryId: f.clientId ? null : f.id, clientId: f.clientId, nom: f.name });
  return out;
}

/**
 * Les adresses e-mail exactes de l'annuaire (fiche, adresses Gmail notées sur
 * la fiche, contacts et comptes portail d'un client), sans celles d'Emmanuel
 * (domaines DOMAINES_EMMANUEL) ni de l'équipe.
 */
export async function adressesConnues(): Promise<Map<string, Candidat>> {
  const [fiches, contactsClients, comptes, equipe] = await Promise.all([
    db.select({ id: directoryEntries.id, clientId: directoryEntries.clientId, name: directoryEntries.name, email: directoryEntries.emailKey, links: directoryEntries.links }).from(directoryEntries),
    db.select({ clientId: contacts.clientId, reach: contacts.reach, name: clients.name }).from(contacts).innerJoin(clients, eq(clients.id, contacts.clientId)),
    db.select({ clientId: users.clientId, email: users.email, name: clients.name }).from(users).innerJoin(clients, eq(clients.id, users.clientId)).where(eq(users.role, "client")),
    db.select({ email: users.email }).from(users).where(ne(users.role, "client")),
  ]);
  const internes = new Set(equipe.map((u) => cleEmail(u.email)).filter(Boolean));
  const domainesEquipe = new Set(equipe.map((u) => domaineDe(u.email)).filter((d): d is string => Boolean(d) && !estDomainePublic(d)));
  const map = new Map<string, Candidat>();
  const noter = (adresse: string | null | undefined, c: Candidat) => {
    const a = cleEmail(adresse);
    const d = domaineDe(a);
    if (!a || internes.has(a) || estDomaineEmmanuel(d) || (d && domainesEquipe.has(d))) return;
    if (!map.has(a)) map.set(a, c);
  };
  for (const f of fiches) {
    const c = { entryId: f.clientId ? null : f.id, clientId: f.clientId, nom: f.name };
    noter(f.email, c);
    for (const g of f.links?.gmail ?? []) noter(g, c);
  }
  for (const c of contactsClients) {
    for (const m of (c.reach ?? "").match(/[^\s<>,;()]+@[^\s<>,;()]+\.[a-z]{2,}/gi) ?? []) noter(m, { entryId: null, clientId: c.clientId, nom: c.name });
  }
  for (const u of comptes) noter(u.email, { entryId: null, clientId: u.clientId, nom: u.name });
  return map;
}

/** La fiche d'un candidat ; un client sans fiche en reçoit une (vide) : la frise a besoin d'une fiche. */
export async function ficheDe(c: Pick<Candidat, "entryId" | "clientId">, cache = new Map<string, string>()): Promise<string | null> {
  if (c.entryId) return c.entryId;
  if (!c.clientId) return null;
  const deja = cache.get(c.clientId);
  if (deja) return deja;
  let [e] = await db.select({ id: directoryEntries.id }).from(directoryEntries).where(eq(directoryEntries.clientId, c.clientId)).limit(1);
  if (!e) {
    const [cl] = await db.select({ name: clients.name }).from(clients).where(eq(clients.id, c.clientId)).limit(1);
    if (!cl) return null;
    await db.insert(directoryEntries).values({ clientId: c.clientId, name: cl.name, kind: "client", source: "agence" }).onConflictDoNothing();
    [e] = await db.select({ id: directoryEntries.id }).from(directoryEntries).where(eq(directoryEntries.clientId, c.clientId)).limit(1);
  }
  if (e) cache.set(c.clientId, e.id);
  return e?.id ?? null;
}

/** Les liens manuels de toutes les fiches (cartes Trello, client GoCardless, mots d'agenda). */
export async function liensManuels() {
  return db.select({ id: directoryEntries.id, clientId: directoryEntries.clientId, name: directoryEntries.name, links: directoryEntries.links }).from(directoryEntries);
}

/* ------------------------------------------------------ lignes de frise -- */

export type LigneSource = typeof directoryEvents.$inferInsert & { entryId: string; externalId: string };

/**
 * Remplace les lignes d'une source par celles du relevé : ajoute ou met à
 * jour (même fiche, même identifiant), et retire celles qui ne sont plus là.
 * `garder` limite le retrait (l'agenda ne retire que dans sa fenêtre de
 * lecture, pas les rendez-vous anciens déjà gardés).
 */
export async function remplacerLignes(source: ServiceEtape3, lignes: LigneSource[], garder?: ReturnType<typeof sql>) {
  await db.transaction(async (tx) => {
    for (const l of lignes) {
      await tx
        .insert(directoryEvents)
        .values({ ...l, source })
        .onConflictDoUpdate({
          target: [directoryEvents.entryId, directoryEvents.source, directoryEvents.externalId],
          set: { kind: l.kind, occurredAt: l.occurredAt, title: l.title, body: l.body ?? null, dueOn: l.dueOn ?? null, doneAt: l.doneAt ?? null, meta: l.meta ?? {}, awaitingReply: false },
        });
    }
    const cles = lignes.map((l) => `${l.entryId}|${l.externalId}`);
    await tx
      .delete(directoryEvents)
      .where(
        and(
          eq(directoryEvents.source, source),
          cles.length ? notInArray(sql`${directoryEvents.entryId}::text || '|' || ${directoryEvents.externalId}`, cles) : undefined,
          garder ? sql`not (${garder})` : undefined,
        ),
      );
  });
}

export async function effacerLignes(source: ServiceEtape3) {
  await db.delete(directoryEvents).where(eq(directoryEvents.source, source));
}

export const lignesDe = (source: ServiceEtape3, entryIds: string[]) =>
  entryIds.length
    ? db
        .select()
        .from(directoryEvents)
        .where(and(eq(directoryEvents.source, source), inArray(directoryEvents.entryId, entryIds)))
    : Promise.resolve([]);
