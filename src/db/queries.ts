import "server-only";

import { and, asc, count, desc, eq, gte, isNotNull, isNull, lt, sql as raw } from "drizzle-orm";
import { db } from "./index";
import {
  activity,
  campaigns,
  clients,
  comments,
  contents,
  contentVersions,
  contractLines,
  shoots,
  timeEntries,
  users,
  type Client,
} from "./schema";
import { monthRange, pace, type Pace } from "@/lib/pacing";

/* ---------------------------------------------------------------- clients -- */

export type ClientWithPace = Client & {
  /** Contenus publiés dans le mois courant. */
  done: number;
  pace: Pace;
};

/**
 * Le cœur du cockpit : chaque client avec son avancement du mois.
 *
 * « Publié » se mesure sur `publishedAt`, jamais sur le statut : un contenu
 * marqué publié sans date ne prouve rien, et c'est la date qui permet de
 * rattacher le contenu au bon mois.
 */
export async function listClientsWithPace(now: Date = new Date()): Promise<ClientWithPace[]> {
  const { start, end } = monthRange(now);

  const rows = await db
    .select({
      client: clients,
      done: count(contents.id),
    })
    .from(clients)
    .leftJoin(
      contents,
      and(
        eq(contents.clientId, clients.id),
        isNotNull(contents.publishedAt),
        gte(contents.publishedAt, start),
        lt(contents.publishedAt, end),
      ),
    )
    .where(eq(clients.active, true))
    .groupBy(clients.id)
    .orderBy(asc(clients.shortName));

  return rows.map(({ client, done }) => ({
    ...client,
    done,
    pace: pace(done, client.contentTarget, now),
  }));
}

/** Ordre du cockpit : le plus urgent en premier. */
const URGENCY: Record<string, number> = { late: 0, risk: 1, ontime: 2, ahead: 3, none: 4 };

export function byUrgency(list: ClientWithPace[]): ClientWithPace[] {
  return [...list].sort(
    (a, b) => URGENCY[a.pace.key] - URGENCY[b.pace.key] || a.pace.gap - b.pace.gap,
  );
}

export async function getClient(id: string): Promise<Client | null> {
  const rows = await db.select().from(clients).where(eq(clients.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function getClientWithPace(
  id: string,
  now: Date = new Date(),
): Promise<ClientWithPace | null> {
  const client = await getClient(id);
  if (!client) return null;
  const { start, end } = monthRange(now);
  const [{ n }] = await db
    .select({ n: count() })
    .from(contents)
    .where(
      and(
        eq(contents.clientId, id),
        isNotNull(contents.publishedAt),
        gte(contents.publishedAt, start),
        lt(contents.publishedAt, end),
      ),
    );
  return { ...client, done: n, pace: pace(n, client.contentTarget, now) };
}

export async function listContractLines(clientId: string) {
  return db
    .select()
    .from(contractLines)
    .where(eq(contractLines.clientId, clientId))
    .orderBy(asc(contractLines.position));
}

/* --------------------------------------------------------------- contenus -- */

/** Contenus programmés sur un mois : alimente le calendrier. */
export async function listContentsForMonth(now: Date = new Date(), clientId?: string) {
  const { start, end } = monthRange(now);
  return db
    .select({
      content: contents,
      clientName: clients.shortName,
    })
    .from(contents)
    .innerJoin(clients, eq(clients.id, contents.clientId))
    .where(
      and(
        gte(contents.scheduledAt, start),
        lt(contents.scheduledAt, end),
        clientId ? eq(contents.clientId, clientId) : undefined,
      ),
    )
    .orderBy(asc(contents.scheduledAt));
}

/** Le pipeline : tout ce qui n'est ni publié ni abandonné. */
export async function listPipeline(clientId?: string) {
  return db
    .select({ content: contents, clientName: clients.shortName, ownerName: users.name })
    .from(contents)
    .innerJoin(clients, eq(clients.id, contents.clientId))
    .leftJoin(users, eq(users.id, contents.ownerId))
    .where(and(clientId ? eq(contents.clientId, clientId) : undefined))
    .orderBy(asc(contents.dueAt));
}

/** La file du jour : ce qui est prêt et doit partir aujourd'hui. */
export async function listTodayQueue(now: Date = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start.getTime() + 86_400_000);
  return db
    .select({ content: contents, clientName: clients.shortName })
    .from(contents)
    .innerJoin(clients, eq(clients.id, contents.clientId))
    .where(and(gte(contents.scheduledAt, start), lt(contents.scheduledAt, end)))
    .orderBy(asc(contents.scheduledAt));
}

/**
 * En attente de validation, interne ou client.
 *
 * Le délai d'attente est calculé par la base : l'heure du serveur fait
 * autorité, et le rendu d'une page n'a pas à dépendre d'une horloge lue au
 * milieu de l'affichage.
 */
export async function listAwaitingApproval(clientId?: string) {
  return db
    .select({
      content: contents,
      clientName: clients.shortName,
      waitingDays: raw<number | null>`case when ${contents.submittedAt} is null then null
        else floor(extract(epoch from (now() - ${contents.submittedAt})) / 86400)::int end`,
    })
    .from(contents)
    .innerJoin(clients, eq(clients.id, contents.clientId))
    .where(
      and(
        raw`${contents.status} in ('revision','validation')`,
        clientId ? eq(contents.clientId, clientId) : undefined,
      ),
    )
    .orderBy(asc(contents.submittedAt));
}

/**
 * Publications manquées : l'heure prévue est passée et rien n'a été publié.
 * C'est l'alerte la plus importante du cockpit.
 */
export async function countMissedPublications(now: Date = new Date()) {
  const [{ n }] = await db
    .select({ n: count() })
    .from(contents)
    .where(
      and(
        isNull(contents.publishedAt),
        isNotNull(contents.scheduledAt),
        lt(contents.scheduledAt, now),
        raw`${contents.status} in ('pret','manque')`,
      ),
    );
  return n;
}

/* -------------------------------------------------------------- tournages -- */

export async function listUpcomingShoots(now: Date = new Date(), clientId?: string) {
  return db
    .select({ shoot: shoots, clientName: clients.shortName })
    .from(shoots)
    .innerJoin(clients, eq(clients.id, shoots.clientId))
    .where(and(gte(shoots.startsAt, now), clientId ? eq(shoots.clientId, clientId) : undefined))
    .orderBy(asc(shoots.startsAt));
}

/* -------------------------------------------------------------- campagnes -- */

export async function listCampaigns(clientId?: string) {
  return db
    .select({ campaign: campaigns, clientName: clients.shortName })
    .from(campaigns)
    .innerJoin(clients, eq(clients.id, campaigns.clientId))
    .where(clientId ? eq(campaigns.clientId, clientId) : undefined)
    .orderBy(desc(campaigns.createdAt));
}

/* ------------------------------------------------------------ rentabilité -- */

/**
 * Heures consommées par client sur le mois. Le coût n'est pas calculé ici :
 * il dépend du tarif horaire en vigueur à la date de la saisie, ce que seul
 * l'écran de rentabilité assemble.
 */
export async function hoursByClient(now: Date = new Date()) {
  const { start, end } = monthRange(now);
  return db
    .select({
      clientId: timeEntries.clientId,
      minutes: raw<number>`coalesce(sum(${timeEntries.minutes}), 0)::int`,
    })
    .from(timeEntries)
    .where(and(gte(timeEntries.weekStart, start.toISOString().slice(0, 10)),
               lt(timeEntries.weekStart, end.toISOString().slice(0, 10))))
    .groupBy(timeEntries.clientId);
}

/* ---------------------------------------------------------------- équipe -- */

export async function listStaff() {
  return db
    .select()
    .from(users)
    .where(raw`${users.role} in ('direction','equipe')`)
    .orderBy(asc(users.name));
}


/* ------------------------------------------------------ détail d'un contenu -- */

export async function getContent(id: string) {
  const rows = await db
    .select({ content: contents, client: clients, ownerName: users.name })
    .from(contents)
    .innerJoin(clients, eq(clients.id, contents.clientId))
    .leftJoin(users, eq(users.id, contents.ownerId))
    .where(eq(contents.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function listComments(contentId: string) {
  return db
    .select({ comment: comments, authorName: users.name, authorInitials: users.initials })
    .from(comments)
    .leftJoin(users, eq(users.id, comments.authorId))
    .where(eq(comments.contentId, contentId))
    .orderBy(asc(comments.createdAt));
}

export async function listVersions(contentId: string) {
  return db
    .select()
    .from(contentVersions)
    .where(eq(contentVersions.contentId, contentId))
    .orderBy(desc(contentVersions.number));
}

export async function listActivity(contentId: string) {
  return db
    .select({ entry: activity, actorName: users.name })
    .from(activity)
    .leftJoin(users, eq(users.id, activity.actorId))
    .where(eq(activity.contentId, contentId))
    .orderBy(desc(activity.createdAt))
    .limit(20);
}

/** Clients actifs, pour les listes déroulantes des formulaires. */
export async function listClientOptions() {
  return db
    .select({ id: clients.id, name: clients.shortName })
    .from(clients)
    .where(eq(clients.active, true))
    .orderBy(asc(clients.shortName));
}
