import "server-only";

import { Readable } from "node:stream";
import { and, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { activity, assetFolders, assets, assetUsages, clients, contents, contentVersions, db } from "@/db";
import { getSecret } from "@/lib/secrets";
import { storeIncoming } from "@/lib/storage";
import { notify } from "@/lib/notify";

/*
 * Le stock de Reels montés par l'agent monteur, sur taochyagency.com
 * (admin/videos.php), relié à Pilot.
 *
 *   - Pilot lit le stock et importe une vidéo : elle arrive dans la
 *     bibliothèque du client (dossier « Stock taochyagency.com »), un contenu
 *     Reel est créé avec la légende proposée, et le site passe la vidéo en
 *     « Importée dans Pilot ».
 *   - Programmée chez Metricool → « Programmée » sur le site, avec la date.
 *   - Publiée → « Publiée » sur le site, avec le lien du post ; dans Pilot, le
 *     fichier passe dans le sous-dossier « Publiées ».
 *
 * La clé (créée sur taochyagency.com, bouton « Relier à Pilot ») ne permet que
 * de lire le stock et d'en changer l'état : ni dépôt ni suppression.
 */

const BASE = process.env.STOCK_VIDEOS_URL || "https://taochyagency.com/admin/videos.php";
export const STOCK_FOLDER = "Stock taochyagency.com";
const PUBLISHED_FOLDER = "Publiées";

export type StockVideo = {
  id: string;
  title: string;
  caption: string;
  notes: string;
  duration: number | null;
  status: string;
  created: string | null;
  scheduled: string | null;
  posted: string | null;
  postUrl: string | null;
  url: string | null;
  urls: Record<string, string>;
};

async function key() {
  const s = await getSecret("stock-videos");
  if (!s) throw new Error("Le stock vidéos n'est pas relié (Réglages → Stock vidéos taochyagency.com).");
  return s.token;
}

async function call<T>(api: string, body?: unknown, token?: string): Promise<T> {
  const res = await fetch(`${BASE}?api=${api}`, {
    method: body ? "POST" : "GET",
    headers: { "X-Pilot-Key": token ?? (await key()), Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
    cache: "no-store",
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {}
  if (!res.ok) {
    const err = (json as { error?: string } | null)?.error;
    throw new Error(res.status === 403 ? "Clé refusée par taochyagency.com (créez-en une nouvelle sur la page Vidéos)." : `taochyagency.com répond ${res.status}${err ? ` : ${err}` : ""}.`);
  }
  return json as T;
}

/** Vérifie une clé avant de l'enregistrer. */
export async function verifyStockKey(token: string): Promise<number> {
  const r = await call<{ count?: number }>("list", undefined, token);
  return r?.count ?? 0;
}

export async function listStock(): Promise<StockVideo[]> {
  const r = await call<{ items?: Record<string, unknown>[] }>("list");
  return (r?.items ?? []).map((i) => {
    const urls = (i.urls ?? {}) as Record<string, string>;
    // Essai local (serveur en http) : les adresses des fichiers suivent la même origine.
    if (BASE.startsWith("http://")) {
      const o = new URL(BASE).origin;
      for (const k of Object.keys(urls)) urls[k] = urls[k].replace(/^https:\/\/[^/]+/, o);
    }
    const main = urls.musique ?? Object.entries(urls).find(([, u]) => /\.mp4$/i.test(u))?.[1] ?? null;
    return {
      id: String(i.id),
      title: String(i.title ?? i.id),
      caption: String(i.caption ?? ""),
      notes: String(i.notes ?? ""),
      duration: typeof i.duration === "number" ? i.duration : null,
      status: String(i.status ?? "stock"),
      created: (i.created as string) ?? null,
      scheduled: (i.scheduled as string) ?? null,
      posted: (i.posted as string) ?? null,
      postUrl: (i.post_url as string) ?? null,
      url: main,
      urls,
    };
  });
}

async function remoteUpdate(id: string, patch: Record<string, unknown>) {
  await call("update", { id, ...patch });
}

/** Un dossier de la bibliothèque, créé au besoin. */
async function folder(clientId: string, name: string, parentId: string | null = null) {
  const [found] = await db
    .select({ id: assetFolders.id })
    .from(assetFolders)
    .where(and(eq(assetFolders.clientId, clientId), eq(assetFolders.name, name), parentId ? eq(assetFolders.parentId, parentId) : isNull(assetFolders.parentId)))
    .limit(1);
  if (found) return found.id;
  const [row] = await db.insert(assetFolders).values({ clientId, name, parentId }).returning({ id: assetFolders.id });
  return row.id;
}

/** « 2026-11-12T18:00:00+04:00 » : l'heure de La Réunion de Pilot, avec son fuseau, pour le site. */
function reunionIso(d: Date) {
  return `${d.toISOString().slice(0, 19)}+04:00`;
}

function pilotUrl(contentId: string) {
  const d = process.env.APP_DOMAIN?.trim();
  return d ? `https://${d}/contenu/${contentId}` : null;
}

export type ImportResult = { contentId: string; already: boolean; status: string };

/**
 * Importe une vidéo du stock pour un client : fichier dans sa bibliothèque,
 * contenu Reel créé (légende proposée, date si donnée), état renvoyé au site.
 * Client « confiance » : le contenu est prêt à programmer. Client
 * « validation » : il part dans son portail pour accord.
 */
export async function importStockVideo(input: {
  stockId: string;
  clientId: string;
  scheduledAt?: Date | null;
  networks?: string[];
  caption?: string | null;
  actor: { userId?: string | null; label?: string | null };
}): Promise<ImportResult> {
  const [client] = await db.select().from(clients).where(eq(clients.id, input.clientId)).limit(1);
  if (!client) throw new Error("Client introuvable.");

  // Déjà importée pour ce client : on renvoie le contenu existant.
  const [existing] = await db
    .select({ contentId: assetUsages.contentId, status: contents.status })
    .from(assets)
    .innerJoin(assetUsages, eq(assetUsages.assetId, assets.id))
    .innerJoin(contents, eq(contents.id, assetUsages.contentId))
    .where(and(eq(assets.stockVideoId, input.stockId), eq(assets.clientId, input.clientId)))
    .limit(1);
  if (existing) return { contentId: existing.contentId, already: true, status: existing.status };

  const video = (await listStock()).find((v) => v.id === input.stockId);
  if (!video) throw new Error(`Vidéo « ${input.stockId} » introuvable dans le stock.`);
  if (!video.url) throw new Error(`La vidéo « ${video.title} » n'a pas de fichier MP4.`);

  const res = await fetch(video.url, { signal: AbortSignal.timeout(600_000) });
  if (!res.ok || !res.body) throw new Error(`Téléchargement impossible (${res.status}).`);
  const filename = `${video.id}.mp4`;
  const stored = await storeIncoming(
    {
      filename,
      mimeType: "video/mp4",
      declaredBytes: Number(res.headers.get("content-length")) || null,
      body: Readable.fromWeb(res.body as import("node:stream/web").ReadableStream),
    },
    input.clientId,
  );
  const [asset] = await db
    .insert(assets)
    .values({
      clientId: input.clientId,
      folderId: await folder(input.clientId, STOCK_FOLDER),
      filename: `${video.title}.mp4`,
      storagePath: stored.storagePath,
      mimeType: stored.mimeType,
      sizeBytes: stored.sizeBytes,
      width: stored.width,
      height: stored.height,
      stockVideoId: video.id,
    })
    .returning({ id: assets.id });

  const networks = input.networks?.length ? input.networks : ["instagram", "facebook", "tiktok"];
  const confiance = client.publishMode === "confiance";
  const caption = (input.caption ?? video.caption ?? "").trim() || null;
  const [content] = await db
    .insert(contents)
    .values({
      clientId: input.clientId,
      title: video.title,
      kind: "reel",
      network: networks[0] as "instagram",
      networks: networks as ("instagram" | "facebook" | "linkedin" | "tiktok" | "google")[],
      // Sans légende, pas de validation possible : le contenu attend en création.
      status: !caption ? "creation" : confiance ? "pret" : "validation",
      submittedAt: caption && !confiance ? new Date() : null,
      caption,
      instructions: video.notes || null,
      scheduledAt: input.scheduledAt ?? null,
    })
    .returning({ id: contents.id, status: contents.status });
  await db.insert(assetUsages).values({ contentId: content.id, assetId: asset.id, position: 0 });
  await db.insert(contentVersions).values({ contentId: content.id, number: 1, note: "Vidéo du stock taochyagency.com", createdById: input.actor.userId ?? null });
  await db.insert(activity).values({
    clientId: input.clientId,
    contentId: content.id,
    actorId: input.actor.userId ?? null,
    actorLabel: input.actor.label ?? null,
    text: `« ${video.title} » importé du stock vidéos de taochyagency.com`,
  });
  if (content.status === "validation") {
    await notify({
      kind: "validation_attendue",
      title: `À valider : ${video.title}`,
      body: "Une nouvelle vidéo attend votre validation.",
      href: "/portail/valider",
      clientId: input.clientId,
      contentId: content.id,
      audience: "client",
    });
  }

  await remoteUpdate(video.id, {
    status: "importee",
    pilot: { contentId: content.id, client: client.shortName, url: pilotUrl(content.id), imported: new Date().toISOString() },
  }).catch((e) => console.warn("[pilot] stock vidéos : état non renvoyé", (e as Error).message));
  return { contentId: content.id, already: false, status: content.status };
}

/**
 * Renvoie au site l'état d'un contenu fait d'une vidéo du stock. Ne lève
 * jamais : le site est prévenu en plus, ce n'est pas la raison de l'action.
 */
export async function reportStockStatus(contentId: string, event: "programmee" | "importee" | "publiee") {
  try {
    const rows = await db
      .select({ stockId: assets.stockVideoId, assetId: assets.id, clientId: assets.clientId, folderId: assets.folderId })
      .from(assetUsages)
      .innerJoin(assets, eq(assets.id, assetUsages.assetId))
      .where(and(eq(assetUsages.contentId, contentId), isNotNull(assets.stockVideoId)));
    if (!rows.length || !(await getSecret("stock-videos"))) return;
    const [c] = await db.select().from(contents).where(eq(contents.id, contentId)).limit(1);
    if (!c) return;
    for (const r of rows) {
      const patch: Record<string, unknown> = { status: event };
      if (event === "programmee" && c.scheduledAt) patch.scheduled = reunionIso(c.scheduledAt);
      if (event === "publiee") {
        patch.posted = (c.publishedAt ?? new Date()).toISOString();
        patch.post_url = c.publishedUrl ?? null;
        // Rangée : le fichier passe dans « Stock taochyagency.com / Publiées ».
        const parent = await folder(r.clientId, STOCK_FOLDER);
        await db.update(assets).set({ folderId: await folder(r.clientId, PUBLISHED_FOLDER, parent) }).where(eq(assets.id, r.assetId));
      }
      if (event === "importee") {
        patch.scheduled = null;
        patch.posted = null;
        patch.post_url = null;
      }
      await remoteUpdate(r.stockId!, patch);
    }
  } catch (e) {
    console.warn("[pilot] stock vidéos : état non renvoyé", (e as Error).message);
  }
}

/** Les vidéos du stock déjà importées, avec leur contenu dans Pilot. */
export async function importedStockIds(stockIds: string[]) {
  if (!stockIds.length) return new Map<string, { contentId: string; status: string; client: string }>();
  const rows = await db
    .select({ stockId: assets.stockVideoId, contentId: contents.id, status: contents.status, client: clients.shortName })
    .from(assets)
    .innerJoin(assetUsages, eq(assetUsages.assetId, assets.id))
    .innerJoin(contents, eq(contents.id, assetUsages.contentId))
    .innerJoin(clients, eq(clients.id, contents.clientId))
    .where(inArray(assets.stockVideoId, stockIds));
  return new Map(rows.map((r) => [r.stockId!, { contentId: r.contentId, status: r.status, client: r.client }]));
}

/** Le client « Taochy Agency » (la marque de l'agence), proposé par défaut. */
export async function agencyClientId() {
  const [row] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(sql`lower(${clients.shortName}) like '%taochy%'`)
    .limit(1);
  return row?.id ?? null;
}
