import "server-only";

import { and, desc, eq, gte, inArray, isNotNull, isNull, lt, sql as raw } from "drizzle-orm";
import { clients, contents, db, socialPosts } from "@/db";

/*
 * Les données de l'écran « Créer » : meilleurs créneaux (d'après les
 * publications relevées par Metricool), contenus déjà programmés (pour le
 * prochain créneau libre) et les idées en attente.
 */

export type BestSlot = { dow: number; hour: number; posts: number; reach: number };

/**
 * Les trois meilleurs créneaux jour × heure (heure de La Réunion) sur 90 jours,
 * par portée moyenne, en exigeant au moins deux publications pour qu'un coup
 * de chance isolé ne passe pas pour une habitude.
 */
export async function bestSlotsByClient(clientIds: string[]) {
  const since = new Date(Date.now() - 90 * 86_400_000);
  const reach = raw<number>`greatest(${socialPosts.reach}, ${socialPosts.views})`;
  const rows = clientIds.length
    ? await db
        .select({
          clientId: socialPosts.clientId,
          dow: raw<number>`extract(isodow from ${socialPosts.publishedAt} at time zone 'Indian/Reunion')::int`,
          hour: raw<number>`extract(hour from ${socialPosts.publishedAt} at time zone 'Indian/Reunion')::int`,
          posts: raw<number>`count(*)::int`,
          reach: raw<number>`coalesce(avg(${reach}), 0)::float`,
        })
        .from(socialPosts)
        .where(and(inArray(socialPosts.clientId, clientIds), gte(socialPosts.publishedAt, since)))
        .groupBy(socialPosts.clientId, raw`2`, raw`3`)
    : [];

  const out: Record<string, BestSlot[]> = {};
  const all = new Map<string, BestSlot>();
  for (const r of rows) {
    if (r.posts >= 2) (out[r.clientId] ??= []).push({ dow: r.dow, hour: r.hour, posts: r.posts, reach: r.reach });
    const k = `${r.dow}-${r.hour}`;
    const a = all.get(k) ?? { dow: r.dow, hour: r.hour, posts: 0, reach: 0 };
    // Moyenne pondérée par le nombre de publications.
    a.reach = (a.reach * a.posts + r.reach * r.posts) / (a.posts + r.posts);
    a.posts += r.posts;
    all.set(k, a);
  }
  for (const id of Object.keys(out)) out[id] = out[id].sort((a, b) => b.reach - a.reach).slice(0, 3);
  const agency = [...all.values()].filter((s) => s.posts >= 2).sort((a, b) => b.reach - a.reach).slice(0, 3);
  return { byClient: out, agency };
}

/** Ce qui est déjà daté dans les 30 prochains jours : pour éviter les doublons de créneau. */
export async function scheduledSoon() {
  const now = new Date();
  const end = new Date(now.getTime() + 30 * 86_400_000);
  return db
    .select({ clientId: contents.clientId, title: contents.title, scheduledAt: contents.scheduledAt })
    .from(contents)
    .where(and(isNotNull(contents.scheduledAt), gte(contents.scheduledAt, now), lt(contents.scheduledAt, end)))
    .orderBy(contents.scheduledAt);
}

/** Les chiffres d'en-tête : idées, en validation, programmés sur 7 jours. */
export async function composeCounts() {
  const now = new Date();
  const in7 = new Date(now.getTime() + 7 * 86_400_000);
  const [r] = await db
    .select({
      ideas: raw<number>`count(*) filter (where ${contents.status} = 'idee')::int`,
      validation: raw<number>`count(*) filter (where ${contents.status} in ('validation', 'revision'))::int`,
      week: raw<number>`count(*) filter (where ${contents.scheduledAt} >= ${now.toISOString()}::timestamptz and ${contents.scheduledAt} < ${in7.toISOString()}::timestamptz and ${contents.publishedAt} is null)::int`,
    })
    .from(contents)
    .innerJoin(clients, eq(clients.id, contents.clientId))
    .where(eq(clients.active, true));
  return r ?? { ideas: 0, validation: 0, week: 0 };
}

/** Les dernières idées sans date : elles attendent un créneau. */
export async function recentIdeas(limit = 5) {
  return db
    .select({ id: contents.id, title: contents.title, clientName: clients.shortName, createdAt: contents.createdAt })
    .from(contents)
    .innerJoin(clients, eq(clients.id, contents.clientId))
    .where(and(eq(contents.status, "idee"), isNull(contents.scheduledAt), eq(clients.active, true)))
    .orderBy(desc(contents.createdAt))
    .limit(limit);
}

/** L'heure murale de La Réunion, « 2026-11-10T21:04 », pour calculer les créneaux à venir. */
export function reunionNow() {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Indian/Reunion",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date())
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
