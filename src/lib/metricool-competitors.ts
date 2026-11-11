import "server-only";

import { metricoolConfig } from "@/lib/metricool";

/*
 * Veille concurrentielle via Metricool : chaque marque Metricool (= un
 * client) suit ses concurrents ; Metricool relève leurs publications
 * (première collecte sous 24 h environ après l'ajout).
 */

const BASE = "https://app.metricool.com/api";
export const COMPETITOR_NETWORKS = ["instagram", "facebook", "youtube"] as const;
export type CompetitorNetwork = (typeof COMPETITOR_NETWORKS)[number];

/** Délai dépassé côté Metricool (et non une vraie erreur) : l'opération a pu aboutir quand même. */
export class MetricoolLent extends Error {}

async function call<T>(path: string, params: Record<string, string>, method = "GET", timeoutMs = 30_000): Promise<T> {
  const cfg = await metricoolConfig();
  if (!cfg) throw new Error("Metricool n'est pas raccordé (Réglages → Metricool).");
  const url = new URL(BASE + path);
  url.searchParams.set("userId", cfg.userId);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  let res: Response;
  try {
    res = await fetch(url, { method, headers: { "X-Mc-Auth": cfg.token, Accept: "application/json" }, signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
  } catch (e) {
    if ((e as Error).name === "TimeoutError" || (e as Error).name === "AbortError") {
      throw new MetricoolLent(`Metricool n'a pas répondu en ${Math.round(timeoutMs / 1000)} secondes.`);
    }
    throw new Error(`Metricool injoignable : ${(e as Error).message}`);
  }
  const text = await res.text();
  if (!res.ok) {
    let detail = text.slice(0, 160);
    try {
      const j = JSON.parse(text) as { detail?: string; title?: string };
      detail = j.detail || j.title || detail;
    } catch {}
    throw new Error(`Metricool ${res.status} : ${detail}`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as T;
  }
}

const iso = (d: Date) => d.toISOString().slice(0, 19);
function range(days: number) {
  const to = new Date();
  return { from: iso(new Date(to.getTime() - days * 86_400_000)), to: iso(to), timezone: "Indian/Reunion" };
}

export type Competitor = {
  id: string;
  network: CompetitorNetwork;
  handle: string;
  name: string;
  picture: string | null;
  followers: number | null;
  engagement: number | null;
};

type Raw = Record<string, unknown>;
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown) => (typeof v === "string" && v ? v : null);

export async function listCompetitors(brandId: string, network: CompetitorNetwork): Promise<Competitor[]> {
  const r = await call<{ data?: Raw[] }>(`/v2/analytics/competitors/${network}`, { blogId: brandId, ...range(30), limit: "50" });
  return (r.data ?? []).map((c) => ({
    id: String(c.id),
    network,
    handle: str(c.screenName) ?? str(c.providerId) ?? String(c.id),
    name: str(c.displayName) ?? str(c.screenName) ?? "",
    picture: str(c.picture),
    followers: num(c.followers),
    engagement: num(c.engagement),
  }));
}

/** « https://www.instagram.com/nom/ », « @nom » ou « nom » → l'identifiant attendu par Metricool. */
export function normalizeHandle(network: CompetitorNetwork, input: string) {
  let v = input.trim();
  if (network === "youtube") {
    const ch = v.match(/youtube\.com\/channel\/([A-Za-z0-9_-]+)/)?.[1];
    if (ch) return ch;
    const at = v.match(/youtube\.com\/(@[A-Za-z0-9._-]+)/)?.[1];
    return at ?? v;
  }
  v = v.replace(/^https?:\/\/(www\.|m\.)?(instagram|facebook)\.com\//i, "").replace(/[/?#].*$/, "");
  return v.replace(/^@/, "");
}

/**
 * Ajoute un compte suivi. Metricool va chercher le profil sur le réseau avant de répondre, ce qui peut
 * prendre plus d'une minute : on attend 90 s, puis, s'il n'a toujours pas répondu, on regarde si le
 * compte figure déjà dans sa liste (l'ajout aboutit souvent malgré le délai).
 * Retourne "ajoute" ou "en_cours" (Metricool travaille encore : le compte apparaîtra sous peu).
 */
export async function addCompetitor(brandId: string, network: CompetitorNetwork, handle: string): Promise<"ajoute" | "en_cours"> {
  const id = normalizeHandle(network, handle);
  try {
    await call<{ data?: boolean }>(`/v2/analytics/competitors/${network}`, { blogId: brandId, id }, "POST", 90_000);
    return "ajoute";
  } catch (e) {
    if (!(e instanceof MetricoolLent)) throw e;
    try {
      const list = await listCompetitors(brandId, network);
      const k = id.replace(/^@/, "").toLowerCase();
      if (list.some((c) => c.handle.replace(/^@/, "").toLowerCase() === k)) return "ajoute";
    } catch {}
    return "en_cours";
  }
}

export async function removeCompetitor(brandId: string, network: CompetitorNetwork, competitorId: string) {
  return call<{ data?: boolean }>(`/v2/analytics/competitors/${network}`, { blogId: brandId, competitorId }, "DELETE");
}

export type CompetitorPost = {
  id: string;
  network: CompetitorNetwork;
  author: string;
  text: string;
  url: string | null;
  imageUrl: string | null;
  type: string;
  publishedAt: string | null;
  likes: number;
  comments: number;
  shares: number;
  views: number;
  interactions: number;
  engagement: number | null;
};

const POSTS_PATH: Record<CompetitorNetwork, string> = {
  instagram: "/v2/analytics/competitors/instagram/publications",
  facebook: "/v2/analytics/competitors/facebook/posts",
  youtube: "/v2/analytics/competitors/youtube/posts",
};

function mapPost(network: CompetitorNetwork, r: Raw): CompetitorPost {
  const likes = num(r.likes) ?? num(r.likeCount) ?? num(r.reactions) ?? 0;
  const comments = num(r.comments) ?? num(r.commentCount) ?? 0;
  const shares = num(r.shares) ?? num(r.shareCount) ?? 0;
  const views = num(r.views) ?? num(r.videoViewsTotal) ?? num(r.videoViews) ?? num(r.viewCount) ?? 0;
  const date = r.publishedAt ?? r.published ?? r.created ?? r.publishedDate ?? r.createdAt;
  const publishedAt =
    typeof date === "string" ? date : typeof date === "number" ? new Date(date).toISOString() : date && typeof date === "object" && "dateTime" in date ? String((date as { dateTime: string }).dateTime) : null;
  return {
    id: String(r.postId ?? r.reelId ?? r.videoId ?? r.id ?? r.url ?? Math.random()),
    network,
    author: String(r.ownerScreenName ?? r.screenName ?? r.userId ?? r.handle ?? r.pageName ?? ""),
    text: String(r.content ?? r.text ?? r.message ?? r.title ?? r.description ?? ""),
    url: str(r.url) ?? str(r.link) ?? str(r.permalink) ?? str(r.watchUrl),
    imageUrl: str(r.imageUrl) ?? str(r.picture) ?? str(r.thumbnailUrl) ?? str(r.fullPicture) ?? str(r.mediaUrl),
    type: String(r.type ?? (r.reelId ? "REEL" : "POST")),
    publishedAt,
    likes,
    comments,
    shares,
    views,
    interactions: num(r.interactions) ?? likes + comments + shares,
    engagement: num(r.engagement),
  };
}

/** Les publications des concurrents d'une marque sur `days` jours, les plus engageantes d'abord. */
export async function competitorPosts(brandId: string, days = 30, networks: CompetitorNetwork[] = [...COMPETITOR_NETWORKS]) {
  const errors: string[] = [];
  const all: CompetitorPost[] = [];
  await Promise.all(
    networks.map(async (n) => {
      try {
        const r = await call<{ data?: Raw[] } | string>(POSTS_PATH[n], { blogId: brandId, ...range(days), limit: "300" });
        if (typeof r === "object" && r?.data) all.push(...r.data.map((p) => mapPost(n, p)));
      } catch (e) {
        errors.push(`${n} : ${(e as Error).message}`);
      }
    }),
  );
  all.sort((a, b) => b.interactions + b.views / 20 - (a.interactions + a.views / 20));
  return { posts: all, errors };
}
