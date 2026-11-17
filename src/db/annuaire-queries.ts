import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";
import {
  activity,
  clients,
  db,
  directoryEntries,
  directoryEvents,
  quoteRequests,
  users,
  type Client,
  type DirectoryEntry,
  type User,
} from "@/db";
import { departmentsOf } from "@/lib/auth";
import { cleTexte, type Activite, type Kind, type Source } from "@/lib/annuaire";

/*
 * Les lectures de l'annuaire.
 *
 * L'annuaire réunit deux tables : les clients de l'agence (`clients`, avec ou
 * sans fiche d'annuaire) et les fiches sans client (prospects, Swap'Îles…).
 * Une ligne d'annuaire porte donc l'un ou l'autre identifiant, et son adresse
 * est celle du client quand il y en a un : un client n'a qu'une fiche.
 */

export type LigneAnnuaire = {
  /** Identifiant de l'adresse : le client s'il y en a un, sinon la fiche. */
  id: string;
  clientId: string | null;
  entryId: string | null;
  name: string;
  contactName: string | null;
  kind: Kind;
  source: Source;
  activity: Activite;
  status: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  country: string | null;
  sector: string | null;
  nextAction: string | null;
  nextActionOn: string | null;
  lastActivityAt: Date | null;
  tags: string[];
};

const asKind = (v: string): Kind =>
  (["client", "prospect", "ancien_client", "partenaire", "autre"] as const).includes(v as Kind) ? (v as Kind) : "autre";
const asActivite = (v: string): Activite => (v === "swapiles" ? "swapiles" : "agence");

/** Un client que ce membre de l'équipe ne voit pas ailleurs n'apparaît pas ici non plus. */
function clientVisible(c: Pick<Client, "departments">, user: Pick<User, "role" | "departments">) {
  const poles = c.departments?.length ? c.departments : ["social"];
  return departmentsOf(user).some((d) => poles.includes(d));
}

function ligneClient(c: Client, e: DirectoryEntry | null, derniere: Date | null): LigneAnnuaire {
  // Le type d'un client se lit sur son compte : actif = client, archivé =
  // ancien client. Seul « partenaire » peut être posé à la main par-dessus.
  const kind: Kind = e?.kind === "partenaire" ? "partenaire" : c.active && !c.archivedAt ? "client" : "ancien_client";
  const dates = [derniere, e?.lastActivityAt ?? null].filter((d): d is Date => d instanceof Date);
  return {
    id: c.id,
    clientId: c.id,
    entryId: e?.id ?? null,
    name: c.shortName || c.name,
    contactName: e?.contactName ?? null,
    kind,
    source: (e?.source as Source) ?? "agence",
    activity: asActivite(e?.activity ?? "agence"),
    status: e?.status ?? null,
    email: e?.email ?? null,
    phone: e?.phone ?? null,
    city: e?.city ?? null,
    country: e?.country ?? null,
    sector: c.sector ?? e?.sector ?? null,
    nextAction: e?.nextAction ?? null,
    nextActionOn: e?.nextActionOn ?? null,
    lastActivityAt: dates.sort((a, b) => b.getTime() - a.getTime())[0] ?? c.createdAt,
    tags: e?.tags ?? [],
  };
}

function ligneFiche(e: DirectoryEntry): LigneAnnuaire {
  return {
    id: e.id,
    clientId: null,
    entryId: e.id,
    name: e.name,
    contactName: e.contactName,
    kind: asKind(e.kind),
    source: e.source as Source,
    activity: asActivite(e.activity),
    status: e.status,
    email: e.email,
    phone: e.phone,
    city: e.city,
    country: e.country,
    sector: e.sector,
    nextAction: e.nextAction,
    nextActionOn: e.nextActionOn,
    lastActivityAt: e.lastActivityAt ?? e.createdAt,
    tags: e.tags ?? [],
  };
}

/** Tout l'annuaire visible par cette personne, trié par dernière activité. */
export async function listerAnnuaire(user: Pick<User, "role" | "departments">): Promise<LigneAnnuaire[]> {
  const [cl, fiches, dernieres] = await Promise.all([
    db.select().from(clients),
    db.select().from(directoryEntries),
    db
      .select({ clientId: activity.clientId, at: sql<string>`max(${activity.createdAt})::text` })
      .from(activity)
      .groupBy(activity.clientId),
  ]);
  const ficheDuClient = new Map(fiches.filter((f) => f.clientId).map((f) => [f.clientId!, f]));
  const derniere = new Map(dernieres.filter((d) => d.clientId).map((d) => [d.clientId!, new Date(d.at)]));

  const lignes: LigneAnnuaire[] = [
    ...cl.filter((c) => clientVisible(c, user)).map((c) => ligneClient(c, ficheDuClient.get(c.id) ?? null, derniere.get(c.id) ?? null)),
    ...fiches.filter((f) => !f.clientId).map(ligneFiche),
  ];
  return lignes.sort((a, b) => (b.lastActivityAt?.getTime() ?? 0) - (a.lastActivityAt?.getTime() ?? 0));
}

/** Filtre de recherche : nom, contact, ville, e-mail, téléphone, métier. */
export function correspond(l: LigneAnnuaire, q: string): boolean {
  const k = cleTexte(q);
  if (!k) return true;
  const tel = q.replace(/\D/g, "");
  if (tel.length >= 4 && (l.phone ?? "").replace(/\D/g, "").includes(tel)) return true;
  return cleTexte([l.name, l.contactName, l.city, l.email, l.sector, l.country].filter(Boolean).join(" ")).includes(k);
}

export type FicheResolue =
  | { mode: "client"; client: Client; entry: DirectoryEntry | null }
  | { mode: "fiche"; entry: DirectoryEntry }
  | { mode: "redirection"; vers: string };

/**
 * Ce que désigne l'identifiant d'une adresse /contacts/[id] : un client (avec
 * sa fiche éventuelle), une fiche seule, ou une fiche reliée à un client — qui
 * renvoie alors vers l'adresse du client, pour qu'il n'y ait qu'une fiche.
 */
export async function resoudreFiche(id: string, user: Pick<User, "role" | "departments">): Promise<FicheResolue | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [client] = await db.select().from(clients).where(eq(clients.id, id)).limit(1);
  if (client) {
    if (!clientVisible(client, user)) return null;
    const [entry] = await db.select().from(directoryEntries).where(eq(directoryEntries.clientId, id)).limit(1);
    return { mode: "client", client, entry: entry ?? null };
  }
  const [entry] = await db.select().from(directoryEntries).where(eq(directoryEntries.id, id)).limit(1);
  if (!entry) return null;
  if (entry.clientId) return { mode: "redirection", vers: `/contacts/${entry.clientId}` };
  return { mode: "fiche", entry };
}

export type MomentFrise = {
  key: string;
  at: Date;
  /** « pilot », « agent_ventes », « portail »… */
  origine: string;
  genre: string;
  titre: string;
  detail?: string | null;
  qui?: string | null;
};

/**
 * La frise d'une fiche : l'activité de Pilot pour un client, les lignes
 * d'historique importées ou relevées (agent ventes aujourd'hui, Gmail et
 * Trello demain) et les demandes de devis du portail. Une seule liste, par
 * date décroissante.
 */
export async function frise(clientId: string | null, entryId: string | null, limite = 60): Promise<MomentFrise[]> {
  const [act, evts, devis] = await Promise.all([
    clientId
      ? db
          .select({ id: activity.id, at: activity.createdAt, text: activity.text, label: activity.actorLabel, nom: users.name })
          .from(activity)
          .leftJoin(users, eq(users.id, activity.actorId))
          .where(eq(activity.clientId, clientId))
          .orderBy(desc(activity.createdAt))
          .limit(limite)
      : Promise.resolve([]),
    entryId
      ? db
          .select()
          .from(directoryEvents)
          .where(eq(directoryEvents.entryId, entryId))
          .orderBy(desc(directoryEvents.occurredAt))
          .limit(limite)
      : Promise.resolve([]),
    clientId
      ? db
          .select({ id: quoteRequests.id, at: quoteRequests.createdAt, subject: quoteRequests.subject, status: quoteRequests.status })
          .from(quoteRequests)
          .where(eq(quoteRequests.clientId, clientId))
          .orderBy(desc(quoteRequests.createdAt))
          .limit(20)
      : Promise.resolve([]),
  ]);

  const moments: MomentFrise[] = [
    ...act.map((a) => ({
      key: "a" + a.id,
      at: a.at,
      origine: "pilot",
      genre: "action",
      titre: a.text,
      qui: a.nom ?? a.label ?? "Pilot",
    })),
    ...evts.map((e) => ({
      key: "e" + e.id,
      at: e.occurredAt,
      origine: e.source,
      genre: e.kind,
      titre: e.title,
      detail: e.body,
    })),
    ...devis.map((d) => ({
      key: "d" + d.id,
      at: d.at,
      origine: "portail",
      genre: "devis",
      titre: `Demande de devis : « ${d.subject} »`,
    })),
  ];
  return moments.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limite);
}

/** Les fiches (hors clients) à prochaine action datée, pour l'accueil. */
export async function fichesAvecProchaineAction() {
  return db
    .select()
    .from(directoryEntries)
    .where(and(sql`${directoryEntries.nextActionOn} is not null`, sql`coalesce(${directoryEntries.status}, '') <> 'perdu'`));
}

/** Les prospects qui ont répondu à l'agent ventes. */
export async function prospectsQuiOntRepondu() {
  return db.select().from(directoryEntries).where(eq(directoryEntries.status, "repondu"));
}

/** Les noms des fiches et clients, pour relier une ligne Abby ou un client à sa fiche. */
export async function correspondances() {
  const [cl, fiches, comptes] = await Promise.all([
    db.select({ id: clients.id, name: clients.name, shortName: clients.shortName, abby: clients.abbyCustomerId }).from(clients),
    db
      .select({ id: directoryEntries.id, clientId: directoryEntries.clientId, name: directoryEntries.name, emailKey: directoryEntries.emailKey, abby: directoryEntries.abbyCustomerId })
      .from(directoryEntries),
    db.select({ email: users.email, clientId: users.clientId }).from(users).where(and(eq(users.role, "client"), sql`${users.clientId} is not null`)),
  ]);
  return { clients: cl, fiches, comptes };
}

