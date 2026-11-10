import "server-only";

import { and, asc, desc, eq, gte, lt, sql as raw } from "drizzle-orm";
import { db } from "./index";
import { audienceDaily, clients, socialPosts } from "./schema";

/*
 * Les statistiques : tout vient des relevés Metricool (audience_daily,
 * social_posts). Rien n'est estimé : une série sans relevé reste vide.
 */

export type StatsFilter = { days: number; clientId?: string; network?: string };

const DAY = 86_400_000;
const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10);

function clientCond(clientId?: string) {
  return clientId ? eq(clients.id, clientId) : undefined;
}

/* ------------------------------------------------------------- audience -- */

export type NetworkRow = {
  network: string;
  accounts: number;
  followers: number;
  growthPct: number | null;
  trend: number[];
};

export async function audienceStats(f: StatsFilter) {
  const now = Date.now();
  const start = isoDay(now - f.days * DAY);
  const prevStart = isoDay(now - 2 * f.days * DAY);
  const rows = await db
    .select({
      clientId: audienceDaily.clientId,
      clientName: clients.shortName,
      network: audienceDaily.network,
      day: audienceDaily.day,
      followers: audienceDaily.followers,
    })
    .from(audienceDaily)
    .innerJoin(clients, eq(clients.id, audienceDaily.clientId))
    .where(
      and(
        gte(audienceDaily.day, prevStart),
        eq(clients.active, true),
        clientCond(f.clientId),
        f.network ? eq(audienceDaily.network, f.network) : undefined,
      ),
    )
    .orderBy(asc(audienceDaily.day));
  if (!rows.length) return null;

  type S = {
    clientId: string;
    clientName: string;
    network: string;
    pts: Map<string, number>;
    days: string[];
  };
  const series = new Map<string, S>();
  for (const r of rows) {
    const k = `${r.clientId}|${r.network}`;
    const s: S = series.get(k) ?? {
      clientId: r.clientId,
      clientName: r.clientName,
      network: r.network,
      pts: new Map<string, number>(),
      days: [],
    };
    s.pts.set(r.day, r.followers);
    s.days.push(r.day);
    series.set(k, s);
  }

  /** Dernière valeur connue d'une série à une date (report du dernier relevé). */
  const valueAt = (s: S, day: string) => {
    let v: number | null = null;
    for (const d of s.days) {
      if (d > day) break;
      v = s.pts.get(d)!;
    }
    return v ?? s.pts.get(s.days[0])!;
  };

  const today = isoDay(now);
  const axis = Array.from({ length: f.days + 1 }, (_, i) =>
    isoDay(now - (f.days - i) * DAY),
  );
  const prevAxis = axis.map((d) =>
    isoDay(new Date(d + "T12:00:00Z").getTime() - f.days * DAY),
  );
  const all = [...series.values()];
  const sumAt = (day: string, list = all) =>
    list.reduce((t, s) => t + valueAt(s, day), 0);

  // Abonnés gagnés depuis le début de la période (courbe pleine) et sur la
  // période précédente au même rang (pointillés).
  const base = sumAt(start);
  const prevBase = sumAt(prevStart);
  const curve = axis.map((d) => sumAt(d) - base);
  const prevCurve = prevAxis.map((d) => sumAt(d) - prevBase);

  const current = sumAt(today);
  const gained = current - base;
  const prevGained = base - prevBase;

  const byNet = new Map<string, S[]>();
  for (const s of all)
    byNet.set(s.network, [...(byNet.get(s.network) ?? []), s]);
  const step = Math.max(1, Math.round(f.days / 15));
  const networks: NetworkRow[] = [...byNet.entries()]
    .map(([network, list]) => {
      const now_ = sumAt(today, list);
      const then = sumAt(start, list);
      return {
        network,
        accounts: list.length,
        followers: now_,
        growthPct: then > 0 ? ((now_ - then) / then) * 100 : null,
        trend: axis
          .filter((_, i) => i % step === 0 || i === axis.length - 1)
          .map((d) => sumAt(d, list)),
      };
    })
    .sort((a, b) => b.followers - a.followers);

  const byClient = new Map<
    string,
    {
      clientId: string;
      clientName: string;
      followers: number;
      networks: number;
    }
  >();
  for (const s of all) {
    const c = byClient.get(s.clientId) ?? {
      clientId: s.clientId,
      clientName: s.clientName,
      followers: 0,
      networks: 0,
    };
    c.followers += valueAt(s, today);
    c.networks += 1;
    byClient.set(s.clientId, c);
  }

  return {
    axis,
    curve,
    prevCurve,
    current,
    gained,
    prevGained,
    accounts: all.length,
    networks,
    brands: [...byClient.values()].sort((a, b) => b.followers - a.followers),
  };
}

/* --------------------------------------------------------- publications -- */

const reachOf = raw<number>`greatest(${socialPosts.reach}, ${socialPosts.views})`;

function postWhere(f: StatsFilter, from: Date, to: Date) {
  return and(
    gte(socialPosts.publishedAt, from),
    lt(socialPosts.publishedAt, to),
    eq(clients.active, true),
    clientCond(f.clientId),
    f.network ? eq(socialPosts.network, f.network) : undefined,
  );
}

export async function postStats(f: StatsFilter) {
  const now = new Date();
  const from = new Date(now.getTime() - f.days * DAY);
  const prevFrom = new Date(now.getTime() - 2 * f.days * DAY);

  const totals = async (a: Date, b: Date) => {
    const [r] = await db
      .select({
        posts: raw<number>`count(*)::int`,
        views: raw<number>`coalesce(sum(${socialPosts.views}), 0)::float`,
        reach: raw<number>`coalesce(sum(${reachOf}), 0)::float`,
        interactions: raw<number>`coalesce(sum(${socialPosts.interactions}), 0)::float`,
      })
      .from(socialPosts)
      .innerJoin(clients, eq(clients.id, socialPosts.clientId))
      .where(postWhere(f, a, b));
    return r ?? { posts: 0, views: 0, reach: 0, interactions: 0 };
  };

  const [cur, prev, mix, perNet, top, heat] = await Promise.all([
    totals(from, now),
    totals(prevFrom, from),
    db
      .select({ network: socialPosts.network, n: raw<number>`count(*)::int` })
      .from(socialPosts)
      .innerJoin(clients, eq(clients.id, socialPosts.clientId))
      .where(postWhere(f, from, now))
      .groupBy(socialPosts.network)
      .orderBy(desc(raw`count(*)`)),
    db
      .select({
        network: socialPosts.network,
        posts: raw<number>`count(*)::int`,
        views: raw<number>`coalesce(sum(${socialPosts.views}), 0)::float`,
        reach: raw<number>`coalesce(sum(${reachOf}), 0)::float`,
        interactions: raw<number>`coalesce(sum(${socialPosts.interactions}), 0)::float`,
      })
      .from(socialPosts)
      .innerJoin(clients, eq(clients.id, socialPosts.clientId))
      .where(postWhere(f, from, now))
      .groupBy(socialPosts.network),
    db
      .select({
        id: socialPosts.id,
        clientName: clients.shortName,
        network: socialPosts.network,
        kind: socialPosts.kind,
        text: socialPosts.text,
        imageUrl: socialPosts.imageUrl,
        url: socialPosts.url,
        reach: reachOf,
        interactions: socialPosts.interactions,
        publishedAt: socialPosts.publishedAt,
      })
      .from(socialPosts)
      .innerJoin(clients, eq(clients.id, socialPosts.clientId))
      .where(postWhere(f, from, now))
      .orderBy(desc(reachOf))
      .limit(6),
    // Meilleurs moments : 90 jours de publications, à l'heure de La Réunion.
    db
      .select({
        dow: raw<number>`extract(isodow from ${socialPosts.publishedAt} at time zone 'Indian/Reunion')::int`,
        hour: raw<number>`extract(hour from ${socialPosts.publishedAt} at time zone 'Indian/Reunion')::int`,
        posts: raw<number>`count(*)::int`,
        reach: raw<number>`coalesce(avg(${reachOf}), 0)::float`,
      })
      .from(socialPosts)
      .innerJoin(clients, eq(clients.id, socialPosts.clientId))
      .where(postWhere(f, new Date(now.getTime() - 90 * DAY), now))
      .groupBy(raw`1`, raw`2`),
  ]);

  const rate = (i: number, r: number) => (r > 0 ? (i / r) * 100 : null);
  return {
    posts: cur.posts,
    views: cur.views,
    viewsChange:
      prev.views > 0 ? ((cur.views - prev.views) / prev.views) * 100 : null,
    engagement: rate(cur.interactions, cur.reach),
    mix,
    perNetwork: new Map(
      perNet.map((p) => [
        p.network,
        { ...p, engagement: rate(p.interactions, p.reach) },
      ]),
    ),
    top,
    heat,
  };
}
