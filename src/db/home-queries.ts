import "server-only";

import { and, asc, desc, eq, gte, isNotNull, isNull, lt, sql as raw } from "drizzle-orm";
import { db } from "./index";
import { activity, audienceDaily, clients, contents, shoots, socialPosts, users } from "./schema";
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

/* --------------------------------------------------- audience (Metricool) -- */

export type DayMetrics = { gained: number; followers: number; views: number; reach: number; interactions: number };
export type AudiencePoint = {
  day: string;
  /** Nouveaux abonnés du jour, tous réseaux. */
  total: number;
  byNetwork: Record<string, number>;
  /** Toutes les mesures du jour, au total et par réseau (vues, portée, interactions : par date de publication). */
  m: DayMetrics;
  mByNetwork: Record<string, DayMetrics>;
};
export type AudienceData = {
  points: AudiencePoint[];
  networks: { network: string; current: number; gained30: number }[];
  current: number;
  /** Audience totale 30 jours plus tôt, pour le pourcentage de croissance. */
  current30ago: number;
};

/**
 * Nouveaux abonnés par jour sur `days` jours, tous clients actifs confondus
 * (ou un seul client). Un jour sans relevé pour une série n'invente rien :
 * l'écart ne se calcule qu'entre deux relevés consécutifs.
 */
export async function audience(days = 90, clientId?: string): Promise<AudienceData | null> {
  const since = new Date(Date.now() - (days + 2) * 86_400_000).toISOString().slice(0, 10);
  const rows = await db
    .select({ clientId: audienceDaily.clientId, network: audienceDaily.network, day: audienceDaily.day, followers: audienceDaily.followers })
    .from(audienceDaily)
    .innerJoin(clients, eq(clients.id, audienceDaily.clientId))
    .where(and(gte(audienceDaily.day, since), eq(clients.active, true), clientId ? eq(clients.id, clientId) : undefined))
    .orderBy(asc(audienceDaily.day));
  if (!rows.length) return null;

  const series = new Map<string, { network: string; points: { day: string; followers: number }[] }>();
  for (const r of rows) {
    const k = `${r.clientId}|${r.network}`;
    const s = series.get(k) ?? { network: r.network, points: [] };
    s.points.push({ day: r.day, followers: r.followers });
    series.set(k, s);
  }

  const byDay = new Map<string, { day: string; total: number; byNetwork: Record<string, number> }>();
  const cutoff30 = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const nets = new Map<string, { current: number; gained30: number }>();
  let current = 0;
  let current30ago = 0;
  for (const s of series.values()) {
    const pts = s.points;
    const last = pts[pts.length - 1].followers;
    const at30 = [...pts].reverse().find((p) => p.day <= cutoff30)?.followers ?? pts[0].followers;
    current += last;
    current30ago += at30;
    const n = nets.get(s.network) ?? { current: 0, gained30: 0 };
    n.current += last;
    n.gained30 += last - at30;
    nets.set(s.network, n);
    for (let i = 1; i < pts.length; i++) {
      const delta = pts[i].followers - pts[i - 1].followers;
      const p = byDay.get(pts[i].day) ?? { day: pts[i].day, total: 0, byNetwork: {} };
      p.total += delta;
      p.byNetwork[s.network] = (p.byNetwork[s.network] ?? 0) + delta;
      byDay.set(pts[i].day, p);
    }
  }

  const start = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const zero = (): DayMetrics => ({ gained: 0, followers: 0, views: 0, reach: 0, interactions: 0 });
  const axis: string[] = [];
  for (let t = new Date(start + "T12:00:00Z").getTime(); ; t += 86_400_000) {
    const d = new Date(t).toISOString().slice(0, 10);
    if (d > today) break;
    axis.push(d);
  }
  const full = new Map<string, AudiencePoint>(
    axis.map((d) => [d, { day: d, total: 0, byNetwork: {}, m: zero(), mByNetwork: {} }]),
  );
  const at = (p: AudiencePoint, net: string) => (p.mByNetwork[net] ??= zero());

  // Nouveaux abonnés (écarts entre relevés consécutifs).
  for (const p of byDay.values()) {
    const f = full.get(p.day);
    if (!f) continue;
    f.total = p.total;
    f.byNetwork = p.byNetwork;
    f.m.gained = p.total;
    for (const [n, v] of Object.entries(p.byNetwork)) at(f, n).gained = v;
  }
  // Abonnés au total : dernier relevé connu à cette date, série par série.
  for (const s of series.values()) {
    let i = 0;
    let last: number | null = null;
    for (const d of axis) {
      while (i < s.points.length && s.points[i].day <= d) last = s.points[i++].followers;
      if (last == null) continue;
      const f = full.get(d)!;
      f.m.followers += last;
      at(f, s.network).followers += last;
    }
  }
  // Vues, portée, interactions des publications, par jour de mise en ligne (heure de La Réunion).
  const dayExpr = raw<string>`to_char(${socialPosts.publishedAt} at time zone 'Indian/Reunion', 'YYYY-MM-DD')`;
  const posts = await db
    .select({
      day: dayExpr,
      network: socialPosts.network,
      views: raw<number>`sum(${socialPosts.views})::float`,
      reach: raw<number>`sum(greatest(${socialPosts.reach}, ${socialPosts.views}))::float`,
      interactions: raw<number>`sum(${socialPosts.interactions})::float`,
    })
    .from(socialPosts)
    .innerJoin(clients, eq(clients.id, socialPosts.clientId))
    .where(and(gte(socialPosts.publishedAt, new Date(start + "T00:00:00Z")), eq(clients.active, true), clientId ? eq(clients.id, clientId) : undefined))
    .groupBy(dayExpr, socialPosts.network);
  for (const r of posts) {
    const f = full.get(r.day);
    if (!f) continue;
    f.m.views += r.views;
    f.m.reach += r.reach;
    f.m.interactions += r.interactions;
    const n = at(f, r.network);
    n.views += r.views;
    n.reach += r.reach;
    n.interactions += r.interactions;
  }
  const points = [...full.values()];
  return {
    points,
    networks: [...nets.entries()].map(([network, v]) => ({ network, ...v })).sort((a, b) => b.current - a.current),
    current,
    current30ago,
  };
}

/**
 * La publication du mois qui a touché le plus de monde, et combien de fois la
 * portée habituelle du même client (moyenne de ses 90 derniers jours).
 */
export type TopMetric = "reach" | "views" | "interactions";

export async function topPostThisMonth(now: Date, clientId?: string, metric: TopMetric = "reach") {
  const { start, end } = monthRange(now);
  const reachExpr =
    metric === "views"
      ? raw<number>`${socialPosts.views}`
      : metric === "interactions"
        ? raw<number>`${socialPosts.interactions}`
        : raw<number>`greatest(${socialPosts.reach}, ${socialPosts.views})`;
  const [top] = await db
    .select({
      id: socialPosts.id,
      clientId: socialPosts.clientId,
      clientName: clients.shortName,
      network: socialPosts.network,
      kind: socialPosts.kind,
      text: socialPosts.text,
      imageUrl: socialPosts.imageUrl,
      url: socialPosts.url,
      reach: socialPosts.reach,
      views: socialPosts.views,
      interactions: socialPosts.interactions,
      saves: socialPosts.saves,
      engagement: socialPosts.engagement,
      publishedAt: socialPosts.publishedAt,
      score: reachExpr,
    })
    .from(socialPosts)
    .innerJoin(clients, eq(clients.id, socialPosts.clientId))
    .where(
      and(
        gte(socialPosts.publishedAt, start),
        lt(socialPosts.publishedAt, end),
        eq(clients.active, true),
        clientId ? eq(clients.id, clientId) : undefined,
      ),
    )
    .orderBy(desc(reachExpr))
    .limit(1);
  if (!top || !top.score) return null;
  const since = new Date(now.getTime() - 90 * 86_400_000);
  const [avg] = await db
    .select({ avg: raw<number>`avg(${reachExpr})::float` })
    .from(socialPosts)
    .where(and(eq(socialPosts.clientId, top.clientId), eq(socialPosts.network, top.network), gte(socialPosts.publishedAt, since)));
  const usual = avg?.avg ?? 0;
  return { ...top, multiple: usual > 0 ? top.score / usual : null };
}
