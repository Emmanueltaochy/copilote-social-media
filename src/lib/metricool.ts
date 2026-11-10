import "server-only";

import { and, eq, gte, isNotNull, sql as raw } from "drizzle-orm";
import { audienceDaily, clients, db, integrations, socialPosts } from "@/db";

/*
 * Metricool : statistiques réelles et programmation des publications.
 *
 * La clé d'API (le jeton du compte) se saisit dans Réglages → Intégrations et
 * reste en base, côté serveur. À défaut, les variables METRICOOL_TOKEN et
 * METRICOOL_USER_ID servent de secours (utile pour un déploiement scripté).
 *
 * Seuls les points d'accès vérifiés contre l'API réelle sont utilisés :
 *   - /admin/simpleProfiles : les marques du compte ;
 *   - /v2/analytics/timelines (subject=account) : abonnés par jour ;
 *   - /v2/analytics/posts|reels/{réseau} : chiffres de chaque publication ;
 *   - /v2/scheduler/posts : programmation.
 */

const BASE = "https://app.metricool.com/api";
const ID = "metricool";

export type MetricoolConfig = { token: string; userId: string };

export async function metricoolConfig(): Promise<MetricoolConfig | null> {
  const [row] = await db.select().from(integrations).where(eq(integrations.id, ID)).limit(1);
  const token = row?.token || process.env.METRICOOL_TOKEN || "";
  const userId = row?.accountId || process.env.METRICOOL_USER_ID || "";
  return token && userId ? { token, userId } : null;
}

/** L'état affichable : jamais la clé elle-même. */
export async function metricoolStatus() {
  const [row] = await db.select().from(integrations).where(eq(integrations.id, ID)).limit(1);
  const cfg = await metricoolConfig();
  return {
    connected: Boolean(cfg),
    userId: cfg?.userId ?? null,
    lastSyncAt: row?.lastSyncAt ?? null,
    lastError: row?.lastError ?? null,
    fromEnv: Boolean(cfg) && !row?.token,
  };
}

export async function saveMetricoolConfig(token: string | null, userId: string) {
  const values = { id: ID, accountId: userId, lastError: null, updatedAt: new Date(), ...(token ? { token } : {}) };
  await db
    .insert(integrations)
    .values(values)
    .onConflictDoUpdate({ target: integrations.id, set: values });
}

/**
 * Vérifie une clé auprès de Metricool et retrouve l'identifiant du compte :
 * la clé suffit, personne n'a à aller chercher un numéro dans une URL.
 */
export async function verifyToken(token: string): Promise<{ userId: string; brands: number }> {
  const rows = await call<RawProfile[]>({ token, userId: "" }, "/admin/simpleProfiles", {});
  if (!Array.isArray(rows)) throw new Error("Réponse inattendue de Metricool.");
  const first = rows[0] as { ownerUserId?: number; userId?: number } | undefined;
  const userId = String(first?.userId ?? first?.ownerUserId ?? "");
  if (!userId) throw new Error("Aucune marque sur ce compte Metricool.");
  return { userId, brands: rows.length };
}

export async function forgetMetricool() {
  await db.delete(integrations).where(eq(integrations.id, ID));
}

async function call<T>(cfg: MetricoolConfig, path: string, params: Record<string, string>, init?: RequestInit): Promise<T> {
  const url = new URL(BASE + path);
  if (cfg.userId) url.searchParams.set("userId", cfg.userId);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, {
    ...init,
    headers: { "X-Mc-Auth": cfg.token, Accept: "application/json", ...(init?.body ? { "Content-Type": "application/json" } : {}) },
    signal: AbortSignal.timeout(30_000),
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) {
    let detail = text.slice(0, 200);
    try {
      const j = JSON.parse(text) as { detail?: string; title?: string };
      detail = j.detail || j.title || detail;
    } catch {}
    throw new Error(`Metricool ${res.status} sur ${path} : ${detail}`);
  }
  // La normalisation d'un média répond par l'URL nue, pas par du JSON.
  try {
    return (text ? JSON.parse(text) : null) as T;
  } catch {
    return text as T;
  }
}

/* ------------------------------------------------------------- marques -- */

export type MetricoolBrand = {
  id: string;
  label: string;
  picture: string | null;
  timezone: string;
  networks: string[];
};

type RawProfile = Record<string, unknown> & { id: number; label?: string; title?: string; timezone?: string };

export async function listBrands(cfg?: MetricoolConfig | null): Promise<MetricoolBrand[]> {
  const c = cfg ?? (await metricoolConfig());
  if (!c) return [];
  const rows = await call<RawProfile[]>(c, "/admin/simpleProfiles", {});
  return rows
    .filter((r) => !r.deleted)
    .map((r) => ({
      id: String(r.id),
      label: String(r.label || r.title || r.id).trim(),
      picture: (r.picture as string) || null,
      timezone: (r.timezone as string) || "Indian/Reunion",
      networks: [
        r.instagram && "instagram",
        r.facebook && "facebook",
        r.tiktok && "tiktok",
        r.linkedinCompany && "linkedin",
        r.youtube && "youtube",
      ].filter(Boolean) as string[],
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "fr"));
}

/* ------------------------------------------------------------- abonnés -- */

/** Le nom de la métrique « abonnés au total » pour chaque réseau. */
const FOLLOWERS_METRIC: Record<string, string> = {
  instagram: "followers",
  facebook: "pageFollows",
  tiktok: "followers_count",
  linkedin: "followers",
  youtube: "totalSubscribers",
};

type Timeline = { data: { metric: string; values: { dateTime: string; value: number }[] }[] };

function iso(d: Date) {
  return d.toISOString().slice(0, 19);
}

async function syncAudience(cfg: MetricoolConfig, clientId: string, brand: MetricoolBrand, days: number) {
  const to = new Date();
  const from = new Date(to.getTime() - days * 86_400_000);
  for (const network of brand.networks) {
    const metric = FOLLOWERS_METRIC[network];
    if (!metric) continue;
    const res = await call<Timeline>(cfg, "/v2/analytics/timelines", {
      blogId: brand.id,
      network,
      subject: "account",
      metric,
      from: iso(from),
      to: iso(to),
      timezone: brand.timezone,
    });
    // Un jour sans relevé n'est pas un jour à zéro abonné : on l'ignore.
    const points = (res.data?.[0]?.values ?? []).filter((v) => typeof v.value === "number" && v.value > 0);
    if (!points.length) continue;
    const rows = points.map((v) => ({ clientId, network, day: v.dateTime.slice(0, 10), followers: Math.round(v.value) }));
    await db
      .insert(audienceDaily)
      .values(rows)
      .onConflictDoUpdate({
        target: [audienceDaily.clientId, audienceDaily.network, audienceDaily.day],
        set: { followers: raw`excluded.followers` },
      });
  }
}

/* -------------------------------------------------------- publications -- */

type Row = Record<string, unknown>;
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : 0);
const str = (v: unknown) => (typeof v === "string" && v ? v : null);

function dateOf(v: unknown): Date | null {
  if (typeof v === "number") return new Date(v);
  if (typeof v === "string") return new Date(v.replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));
  if (v && typeof v === "object" && "dateTime" in v) {
    // { dateTime, timezone } : on garde l'heure locale telle quelle, l'ordre de
    // grandeur suffit pour ranger une publication dans son mois.
    return new Date(String((v as { dateTime: string }).dateTime) + "Z");
  }
  return null;
}

type PostRow = typeof socialPosts.$inferInsert;

const POST_SOURCES: {
  network: string;
  path: string;
  map: (r: Row, clientId: string) => PostRow | null;
}[] = [
  {
    network: "instagram",
    path: "/v2/analytics/posts/instagram",
    map: (r, clientId) => ({
      id: `instagram:${r.postId}`,
      clientId,
      network: "instagram",
      kind: "post",
      publishedAt: dateOf(r.publishedAt)!,
      text: str(r.content),
      imageUrl: str(r.imageUrl),
      url: str(r.url),
      reach: num(r.reach),
      views: num(r.views),
      interactions: num(r.interactions),
      saves: num(r.saved),
      engagement: r.engagement != null ? String(r.engagement) : null,
    }),
  },
  {
    network: "instagram",
    path: "/v2/analytics/reels/instagram",
    map: (r, clientId) => ({
      id: `instagram:${r.reelId}`,
      clientId,
      network: "instagram",
      kind: "reel",
      publishedAt: dateOf(r.publishedAt)!,
      text: str(r.content),
      imageUrl: str(r.imageUrl),
      url: str(r.url),
      reach: num(r.reach),
      views: num(r.views),
      interactions: num(r.interactions),
      saves: num(r.saved),
      engagement: r.engagement != null ? String(r.engagement) : null,
    }),
  },
  {
    network: "facebook",
    path: "/v2/analytics/posts/facebook",
    map: (r, clientId) => ({
      id: `facebook:${r.postId}`,
      clientId,
      network: "facebook",
      kind: "post",
      publishedAt: dateOf(r.timestamp ?? r.created)!,
      text: str(r.text),
      imageUrl: str(r.picture),
      url: str(r.link),
      reach: num(r.impressionsUnique),
      views: num(r.impressions),
      interactions: num(r.reactions) + num(r.comments) + num(r.shares),
      saves: 0,
      engagement: r.engagement != null ? String(r.engagement) : null,
    }),
  },
  {
    network: "facebook",
    path: "/v2/analytics/reels/facebook",
    map: (r, clientId) => ({
      id: `facebook:${r.reelId}`,
      clientId,
      network: "facebook",
      kind: "reel",
      publishedAt: dateOf(r.created)!,
      text: str(r.description),
      imageUrl: str(r.thumbnailUrl),
      url: str(r.reelUrl),
      reach: num(r.postImpressionsUnique),
      views: num(r.blueReelsPlayCount),
      interactions: num(r.postVideoSocialActions) + num(r.postVideoReactions),
      saves: 0,
      engagement: r.engagement != null ? String(r.engagement) : null,
    }),
  },
  {
    network: "tiktok",
    path: "/v2/analytics/posts/tiktok",
    map: (r, clientId) => ({
      id: `tiktok:${r.videoId}`,
      clientId,
      network: "tiktok",
      kind: "video",
      publishedAt: dateOf(r.createTime)!,
      text: str(r.videoDescription) ?? str(r.title),
      imageUrl: str(r.coverImageUrl),
      url: str(r.shareUrl),
      reach: num(r.viewCount),
      views: num(r.viewCount),
      interactions: num(r.likeCount) + num(r.commentCount) + num(r.shareCount),
      saves: 0,
      engagement: r.engagement != null ? String(r.engagement) : null,
    }),
  },
];

async function syncPosts(cfg: MetricoolConfig, clientId: string, brand: MetricoolBrand, days: number) {
  const to = new Date();
  const from = new Date(to.getTime() - days * 86_400_000);
  for (const src of POST_SOURCES) {
    if (!brand.networks.includes(src.network)) continue;
    const res = await call<{ data?: Row[] }>(cfg, src.path, {
      blogId: brand.id,
      from: iso(from),
      to: iso(to),
      timezone: brand.timezone,
    });
    const rows = (res.data ?? [])
      .map((r) => src.map(r, clientId))
      .filter((r): r is PostRow => Boolean(r && r.publishedAt && !Number.isNaN(r.publishedAt.getTime()) && !r.id.endsWith(":undefined")));
    for (const row of rows) {
      const { id, ...rest } = row;
      void id;
      await db
        .insert(socialPosts)
        .values(row)
        .onConflictDoUpdate({ target: socialPosts.id, set: { ...rest, syncedAt: new Date() } });
    }
  }
}

/* -------------------------------------------------------- orchestration -- */

let running: Promise<SyncReport> | null = null;

export type SyncReport = { clients: number; errors: string[] };

/**
 * Relève abonnés et publications de tous les clients raccordés. Une erreur
 * sur un client ou un réseau n'arrête pas les autres : elle est notée.
 */
export function syncMetricool(days = 95): Promise<SyncReport> {
  running ??= (async () => {
    const errors: string[] = [];
    const cfg = await metricoolConfig();
    if (!cfg) return { clients: 0, errors: ["Metricool n'est pas raccordé."] };
    let brands: MetricoolBrand[] = [];
    try {
      brands = await listBrands(cfg);
    } catch (e) {
      errors.push((e as Error).message);
    }
    const linked = await db
      .select({ id: clients.id, name: clients.shortName, brandId: clients.metricoolBrandId })
      .from(clients)
      .where(and(eq(clients.active, true), isNotNull(clients.metricoolBrandId)));
    for (const c of linked) {
      const brand = brands.find((b) => b.id === c.brandId);
      if (!brand) {
        if (brands.length) errors.push(`${c.name} : marque Metricool ${c.brandId} introuvable.`);
        continue;
      }
      for (const step of [syncAudience, syncPosts]) {
        try {
          await step(cfg, c.id, brand, days);
        } catch (e) {
          errors.push(`${c.name} : ${(e as Error).message}`);
        }
      }
    }
    await db
      .update(integrations)
      .set({ lastSyncAt: new Date(), lastError: errors.length ? errors.slice(0, 8).join("\n") : null })
      .where(eq(integrations.id, ID));
    return { clients: linked.length, errors };
  })().finally(() => {
    running = null;
  });
  return running;
}

/** Relance la synchronisation si la dernière date de plus de `hours` heures. */
export async function syncIfStale(hours = 6) {
  const [row] = await db
    .select({ at: integrations.lastSyncAt })
    .from(integrations)
    .where(and(eq(integrations.id, ID), isNotNull(integrations.token)))
    .limit(1);
  const cfg = await metricoolConfig();
  if (!cfg) return;
  if (row?.at && Date.now() - row.at.getTime() < hours * 3_600_000) return;
  void syncMetricool().catch(() => {});
}

/** Pour l'accueil : la date du dernier relevé, et s'il y a de quoi afficher. */
export async function audienceAvailable(since: Date) {
  const [r] = await db
    .select({ n: raw<number>`count(*)::int` })
    .from(audienceDaily)
    .where(gte(audienceDaily.day, since.toISOString().slice(0, 10)));
  return (r?.n ?? 0) > 0;
}

/* ---------------------------------------------------------- programmer -- */

/** Les réseaux de Pilot que Metricool sait publier. */
export const SCHEDULABLE = ["instagram", "facebook", "linkedin", "tiktok"] as const;

export async function schedulePost(input: {
  brandId: string;
  timezone: string;
  /** Heure locale du client, « 2026-11-12T18:00:00 ». */
  localDateTime: string;
  text: string;
  networks: string[];
  mediaUrls: string[];
  kind: string;
  draft: boolean;
}) {
  const cfg = await metricoolConfig();
  if (!cfg) throw new Error("Metricool n'est pas raccordé (Réglages → Intégrations).");

  // Metricool récupère lui-même chaque fichier et l'héberge : sans cette
  // étape, la publication partirait sans visuel.
  const media: string[] = [];
  for (const u of input.mediaUrls) {
    const normalized = await call<unknown>(cfg, "/actions/normalize/image/url", { blogId: input.brandId, url: u });
    const url =
      typeof normalized === "string"
        ? normalized
        : ((normalized as { url?: string; data?: string } | null)?.url ?? (normalized as { data?: string } | null)?.data);
    if (url && /^https?:\/\//.test(url.trim())) media.push(url.trim());
  }

  const isVideo = input.kind === "reel" || input.kind === "video" || input.kind === "story";
  const body = {
    publicationDate: { dateTime: input.localDateTime, timezone: input.timezone },
    text: input.text,
    providers: input.networks.map((network) => ({ network })),
    media,
    // Metricool garde sa propre copie : le lien signé peut expirer sans risque.
    saveExternalMediaFiles: true,
    autoPublish: true,
    draft: input.draft,
    ...(input.networks.includes("instagram")
      ? { instagramData: { autoPublish: true, type: input.kind === "story" ? "STORY" : isVideo ? "REEL" : "POST", showReelOnFeed: true } }
      : {}),
    ...(input.networks.includes("facebook")
      ? { facebookData: { type: input.kind === "story" ? "STORY" : isVideo ? "REEL" : "POST" } }
      : {}),
  };
  const res = await call<{ data?: { id?: number; uuid?: string } }>(cfg, "/v2/scheduler/posts", { blogId: input.brandId }, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return res?.data?.id != null ? String(res.data.id) : (res?.data?.uuid ?? "envoyé");
}
