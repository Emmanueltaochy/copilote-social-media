import "server-only";

import { createSign } from "node:crypto";
import { Readable } from "node:stream";
import { and, eq, inArray, isNotNull, like, sql } from "drizzle-orm";
import { assets, assetUsages, db } from "@/db";
import { getSecret } from "@/lib/secrets";
import { isLegacyImage, removeStored, storeIncoming } from "@/lib/storage";

/*
 * Google Drive : les vidéastes déposent les rushs dans un dossier partagé,
 * l'assistant les retrouve et les range dans la bibliothèque du client.
 *
 * Accès par compte de service Google : on colle sa clé JSON dans Réglages,
 * puis on partage le dossier des rushs avec l'adresse du compte de service
 * (…@….iam.gserviceaccount.com), en lecture. Rien d'autre n'est visible.
 */

type ServiceAccount = { client_email: string; private_key: string };

let cached: { token: string; exp: number } | null = null;

async function serviceAccount(): Promise<ServiceAccount> {
  const s = await getSecret("google-drive");
  if (!s) throw new Error("Google Drive n'est pas raccordé (Réglages → Google Drive).");
  try {
    const j = JSON.parse(s.token) as ServiceAccount;
    if (!j.client_email || !j.private_key) throw new Error();
    return j;
  } catch {
    throw new Error("La clé Google Drive enregistrée n'est pas un JSON de compte de service valide.");
  }
}

export async function driveAccountEmail(): Promise<string | null> {
  try {
    return (await serviceAccount()).client_email;
  } catch {
    return null;
  }
}

async function accessToken(): Promise<string> {
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const sa = await serviceAccount();
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/drive.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  })}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(sa.private_key, "base64url");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${signature}` }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Google refuse le compte de service (${res.status}).`);
  const j = (await res.json()) as { access_token: string; expires_in: number };
  cached = { token: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return j.access_token;
}

export type DriveFile = { id: string; name: string; mimeType: string; size: number | null; createdTime: string; folder: string };

async function list(q: string): Promise<{ id: string; name: string; mimeType: string; size?: string; createdTime: string }[]> {
  const token = await accessToken();
  const out: { id: string; name: string; mimeType: string; size?: string; createdTime: string }[] = [];
  let pageToken = "";
  do {
    const url = new URL("https://www.googleapis.com/drive/v3/files");
    url.searchParams.set("q", q);
    url.searchParams.set("fields", "nextPageToken, files(id,name,mimeType,size,createdTime)");
    url.searchParams.set("pageSize", "200");
    url.searchParams.set("supportsAllDrives", "true");
    url.searchParams.set("includeItemsFromAllDrives", "true");
    url.searchParams.set("orderBy", "createdTime desc");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30_000) });
    if (res.status === 404) throw new Error("Dossier Drive introuvable : partagez-le avec le compte de service.");
    if (!res.ok) throw new Error(`Google Drive ${res.status}`);
    const j = (await res.json()) as { nextPageToken?: string; files: { id: string; name: string; mimeType: string; size?: string; createdTime: string }[] };
    out.push(...j.files);
    pageToken = j.nextPageToken ?? "";
  } while (pageToken && out.length < 1000);
  return out;
}

/**
 * Les images et vidéos d'un dossier (et de ses sous-dossiers, sur deux
 * niveaux), qui ne sont pas encore dans la bibliothèque.
 */
export async function newDriveFiles(folderId: string): Promise<DriveFile[]> {
  const folders = [{ id: folderId, path: "" }];
  const files: DriveFile[] = [];
  for (let depth = 0; depth < 3 && folders.length; depth++) {
    const level = folders.splice(0);
    for (const f of level) {
      const items = await list(`'${f.id.replace(/'/g, "")}' in parents and trashed = false`);
      for (const it of items) {
        if (it.mimeType === "application/vnd.google-apps.folder") {
          folders.push({ id: it.id, path: f.path ? `${f.path}/${it.name}` : it.name });
        } else if (it.mimeType.startsWith("image/") || it.mimeType.startsWith("video/")) {
          files.push({ id: it.id, name: it.name, mimeType: it.mimeType, size: it.size ? Number(it.size) : null, createdTime: it.createdTime, folder: f.path });
        }
      }
    }
  }
  if (!files.length) return [];
  const known = await db.select({ id: assets.driveFileId }).from(assets).where(inArray(assets.driveFileId, files.map((f) => f.id)));
  const seen = new Set(known.map((k) => k.id));
  return files.filter((f) => !seen.has(f.id));
}

/**
 * Télécharge le fichier d'origine (files.get?alt=media) et le range sur le
 * disque. Jamais la miniature de Drive : c'est ce fichier qui sera publié.
 */
async function downloadOriginal(fileId: string, clientId: string) {
  const token = await accessToken();
  const meta = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=name,mimeType,size&supportsAllDrives=true`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (!meta.ok) throw new Error(`Fichier Drive introuvable (${meta.status}).`);
  const m = (await meta.json()) as { name: string; mimeType: string; size?: string };
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok || !res.body) throw new Error(`Téléchargement Drive impossible (${res.status}).`);
  const stored = await storeIncoming(
    {
      filename: m.name,
      mimeType: m.mimeType,
      declaredBytes: m.size ? Number(m.size) : null,
      body: Readable.fromWeb(res.body as import("node:stream/web").ReadableStream),
    },
    clientId,
  );
  return { name: m.name, stored };
}

/**
 * Remet à niveau une image importée de Drive avant qu'on garde les originaux.
 *
 * Il n'en restait qu'un WebP réduit ; l'original est toujours sur Drive. On le
 * retélécharge et on le range à la place, sous le même identifiant : les
 * contenus qui utilisent ce média n'ont rien à refaire. L'ancien fichier n'est
 * effacé qu'une fois le nouveau en place ; si Drive ne répond pas, rien ne
 * change et l'ancienne image continue de servir.
 */
export async function restoreDriveOriginal(assetId: string): Promise<"fait" | "inutile" | "echec"> {
  const [a] = await db
    .select({ id: assets.id, clientId: assets.clientId, driveFileId: assets.driveFileId, storagePath: assets.storagePath, mimeType: assets.mimeType })
    .from(assets)
    .where(eq(assets.id, assetId))
    .limit(1);
  if (!a?.driveFileId || !isLegacyImage(a)) return "inutile";
  try {
    const { stored } = await downloadOriginal(a.driveFileId, a.clientId);
    // Deux remises à niveau du même média peuvent se croiser (le bouton des
    // Réglages et une programmation) : seule la première remplace la ligne.
    const done = await db
      .update(assets)
      .set({ storagePath: stored.storagePath, mimeType: stored.mimeType, sizeBytes: stored.sizeBytes, width: stored.width, height: stored.height })
      .where(and(eq(assets.id, a.id), eq(assets.storagePath, a.storagePath)))
      .returning({ id: assets.id });
    await removeStored(done.length ? a.storagePath : stored.storagePath);
    return "fait";
  } catch (e) {
    console.error(`Original Drive non récupéré pour le média ${assetId} : ${(e as Error).message}`);
    return "echec";
  }
}

/** Les images importées de Drive dont il ne reste que la version réduite. */
export async function countLegacyDriveImages(): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(assets)
    .where(and(isNotNull(assets.driveFileId), eq(assets.mimeType, "image/webp"), like(assets.storagePath, "%.webp")));
  return r?.n ?? 0;
}

/**
 * Reprend d'un coup les originaux des images déjà importées de Drive.
 *
 * Un fichier après l'autre, et pendant un temps borné : une bibliothèque de
 * plusieurs centaines d'images ne doit pas tenir une requête ouverte dix
 * minutes. Ce qui reste est repris au clic suivant.
 */
export async function restoreDriveOriginals(budgetMs = 45_000): Promise<{ done: number; failed: number; remaining: number }> {
  const rows = await db
    .select({ id: assets.id })
    .from(assets)
    .where(and(isNotNull(assets.driveFileId), eq(assets.mimeType, "image/webp"), like(assets.storagePath, "%.webp")))
    .orderBy(sql`${assets.createdAt} desc`)
    .limit(500);
  if (!rows.length) return { done: 0, failed: 0, remaining: 0 };
  // Un compte de service refusé ferait échouer chaque fichier l'un après
  // l'autre : autant le dire une fois, avec la vraie raison.
  await accessToken();
  const start = Date.now();
  let done = 0;
  let failed = 0;
  for (const r of rows) {
    if (Date.now() - start > budgetMs) break;
    const result = await restoreDriveOriginal(r.id);
    if (result === "fait") done++;
    else if (result === "echec") failed++;
  }
  return { done, failed, remaining: (await countLegacyDriveImages()) - failed };
}

/** Télécharge un fichier Drive dans la bibliothèque du client, et le joint au contenu si demandé. */
export async function importDriveFile(fileId: string, clientId: string, contentId?: string | null) {
  const [already] = await db.select({ id: assets.id }).from(assets).where(and(eq(assets.driveFileId, fileId), eq(assets.clientId, clientId))).limit(1);
  let assetId = already?.id;
  if (assetId) {
    // Déjà dans la bibliothèque, mais peut-être en version réduite d'avant :
    // on en profite pour récupérer l'original.
    await restoreDriveOriginal(assetId);
  } else {
    const { name, stored } = await downloadOriginal(fileId, clientId);
    const [row] = await db
      .insert(assets)
      .values({
        clientId,
        filename: name,
        storagePath: stored.storagePath,
        mimeType: stored.mimeType,
        sizeBytes: stored.sizeBytes,
        width: stored.width,
        height: stored.height,
        driveFileId: fileId,
      })
      .returning({ id: assets.id });
    assetId = row.id;
  }
  if (contentId) {
    const [last] = await db
      .select({ n: sql<number>`coalesce(max(${assetUsages.position}), -1)::int` })
      .from(assetUsages)
      .where(eq(assetUsages.contentId, contentId));
    await db
      .insert(assetUsages)
      .values({ contentId, assetId, position: (last?.n ?? -1) + 1 })
      .onConflictDoNothing();
  }
  return assetId;
}
