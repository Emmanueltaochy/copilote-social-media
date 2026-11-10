import "server-only";

import { and, asc, desc, eq, gte, isNotNull, isNull, lt, sql as raw } from "drizzle-orm";
import { db } from "./index";
import { activity, clients, contents, shoots, users } from "./schema";
import { monthRange } from "@/lib/pacing";

/*
 * Les données de l'accueil « Aujourd'hui ».
 *
 * Toutes en lecture seule et limitées au pôle social : l'accueil répond à
 * « qu'est-ce qui part, qu'est-ce qui attend quelqu'un, qu'est-ce qui a bougé ».
 */

const contentRow = {
  id: contents.id,
  title: contents.title,
  kind: contents.kind,
  network: contents.network,
  networks: contents.networks,
  status: contents.status,
  caption: contents.caption,
  scheduledAt: contents.scheduledAt,
  publishedAt: contents.publishedAt,
  submittedAt: contents.submittedAt,
  clientId: clients.id,
  clientName: clients.shortName,
};

/** Ce qui part ensuite : programmé, pas encore publié, à partir de maintenant. */
export async function upNext(now: Date, limit = 9) {
  return db
    .select(contentRow)
    .from(contents)
    .innerJoin(clients, eq(clients.id, contents.clientId))
    .where(
      and(
        isNotNull(contents.scheduledAt),
        gte(contents.scheduledAt, now),
        isNull(contents.publishedAt),
        raw`${contents.status} <> 'publie'`,
        eq(clients.active, true),
      ),
    )
    .orderBy(asc(contents.scheduledAt))
    .limit(limit);
}

/** Programmé dans le passé (14 derniers jours) et jamais publié. */
export async function missedRecently(now: Date) {
  const since = new Date(now.getTime() - 14 * 86_400_000);
  return db
    .select(contentRow)
    .from(contents)
    .innerJoin(clients, eq(clients.id, contents.clientId))
    .where(
      and(
        isNotNull(contents.scheduledAt),
        lt(contents.scheduledAt, now),
        gte(contents.scheduledAt, since),
        isNull(contents.publishedAt),
        eq(clients.active, true),
      ),
    )
    .orderBy(desc(contents.scheduledAt));
}

/** Les 7 jours à partir d'aujourd'hui, publiés compris. */
export async function weekAhead(now: Date) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start.getTime() + 7 * 86_400_000);
  return db
    .select(contentRow)
    .from(contents)
    .innerJoin(clients, eq(clients.id, contents.clientId))
    .where(and(gte(contents.scheduledAt, start), lt(contents.scheduledAt, end), eq(clients.active, true)))
    .orderBy(asc(contents.scheduledAt));
}

/** Contenus du mois par réseau : publiés et prévus. */
export async function networksThisMonth(now: Date) {
  const { start, end } = monthRange(now);
  const rows = await db
    .select({ network: contents.network, networks: contents.networks, publishedAt: contents.publishedAt })
    .from(contents)
    .innerJoin(clients, eq(clients.id, contents.clientId))
    .where(
      and(
        eq(clients.active, true),
        raw`coalesce(${contents.publishedAt}, ${contents.scheduledAt}) >= ${start.toISOString()}::timestamptz`,
        raw`coalesce(${contents.publishedAt}, ${contents.scheduledAt}) < ${end.toISOString()}::timestamptz`,
      ),
    );
  const out = new Map<string, { published: number; planned: number }>();
  for (const r of rows) {
    const list = r.networks && r.networks.length ? r.networks : [r.network];
    for (const n of list) {
      const cur = out.get(n) ?? { published: 0, planned: 0 };
      if (r.publishedAt) cur.published += 1;
      else cur.planned += 1;
      out.set(n, cur);
    }
  }
  return [...out.entries()]
    .map(([network, v]) => ({ network, ...v, total: v.published + v.planned }))
    .sort((a, b) => b.total - a.total);
}

/** Publiés dans le mois en cours, tous clients confondus. */
export async function publishedThisMonth(now: Date) {
  const { start, end } = monthRange(now);
  const [row] = await db
    .select({ n: raw<number>`count(*)::int` })
    .from(contents)
    .where(and(gte(contents.publishedAt, start), lt(contents.publishedAt, end)));
  return row?.n ?? 0;
}

/** Le fil d'activité de l'équipe : qui a fait quoi, sur quel client. */
export async function teamActivity(limit = 8) {
  return db
    .select({
      id: activity.id,
      text: activity.text,
      createdAt: activity.createdAt,
      actorName: users.name,
      actorInitials: users.initials,
      actorAvatar: users.avatarPath,
      actorId: users.id,
      actorLabel: activity.actorLabel,
      clientName: clients.shortName,
      contentId: activity.contentId,
    })
    .from(activity)
    .leftJoin(users, eq(users.id, activity.actorId))
    .leftJoin(clients, eq(clients.id, activity.clientId))
    .orderBy(desc(activity.createdAt))
    .limit(limit);
}

/** Tournages des 14 prochains jours. */
export async function shootsSoon(now: Date) {
  const end = new Date(now.getTime() + 14 * 86_400_000);
  return db
    .select({
      id: shoots.id,
      title: shoots.title,
      place: shoots.place,
      startsAt: shoots.startsAt,
      status: shoots.status,
      clientName: clients.shortName,
    })
    .from(shoots)
    .innerJoin(clients, eq(clients.id, shoots.clientId))
    .where(and(gte(shoots.startsAt, now), lt(shoots.startsAt, end), raw`${shoots.status} <> 'annule'`))
    .orderBy(asc(shoots.startsAt));
}
