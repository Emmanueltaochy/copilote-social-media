import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, rename, stat, unlink } from "node:fs/promises";
import { statfs } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import sharp from "sharp";

/**
 * Bride libvips pour une machine partagée.
 *
 * Par défaut, il se règle pour une machine dédiée : un fil d'exécution par
 * cœur et un cache de plusieurs dizaines de mégaoctets, conservé entre les
 * images. Sur ce VPS il cohabite avec PostgreSQL et d'autres sites, et les
 * imports se font de toute façon un fichier après l'autre — la parallélisation
 * n'apporte rien et le cache ne resservira jamais, puisque deux photos
 * consécutives n'ont rien en commun. Les brider divise la mémoire de pointe
 * sans rien coûter en vitesse.
 */
sharp.concurrency(1);
sharp.cache({ memory: 32, files: 0, items: 0 });

/**
 * Stockage des médias sur le disque du VPS.
 *
 * Deux règles portent tout le reste.
 *
 * D'abord, rien ne transite par la mémoire. Un fichier arrive en flux et part
 * directement sur le disque, puis est traité depuis son chemin. Charger
 * trente photos de photographe en mémoire pour les traiter ensemble suffirait
 * à faire tomber le serveur, et il héberge d'autres sites.
 *
 * Ensuite, une image n'est jamais conservée telle quelle : elle est réencodée
 * à une taille d'affichage et l'original est jeté. Le poids du fichier envoyé
 * n'a donc presque aucun effet sur le disque. Les vidéos, elles, sont gardées
 * en l'état — les réencoder demanderait ffmpeg et bien plus de processeur que
 * n'en a un VPS partagé.
 */

/** Racine des médias. Volume Docker en production, dossier local sinon. */
export const MEDIA_ROOT = process.env.MEDIA_ROOT ?? "/data/assets";

/**
 * Plafonds par fichier.
 *
 * Une image n'est jamais conservée telle quelle : elle est réencodée à une
 * taille d'affichage et l'original est jeté. Un fichier de 80 Mo sorti d'un
 * boîtier professionnel finit donc à quelques centaines de kilo-octets sur le
 * disque — accepter du lourd ne coûte rien en stockage, seulement du temps de
 * transfert. Le plafond ne sert plus qu'à écarter ce qui n'est manifestement
 * pas une photo.
 *
 * Une vidéo, elle, est stockée telle quelle : son plafond reste le vrai
 * garde-fou, avec le contrôle d'espace libre.
 */
export const MAX_IMAGE_BYTES = 400 * 1024 * 1024; // 400 Mo
export const MAX_VIDEO_BYTES = 4 * 1024 * 1024 * 1024; // 4 Go

export const maxBytesFor = (mime: string) => (isVideo(mime) ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES);

/** En dessous, on refuse d'écrire : un disque plein arrête aussi PostgreSQL. */
export const MIN_FREE_BYTES = 5 * 1024 * 1024 * 1024; // 5 Go

/** En dessous, on prévient : il reste de la marge, mais plus pour longtemps. */
export const WARN_FREE_BYTES = 15 * 1024 * 1024 * 1024; // 15 Go

/**
 * Formats acceptés — ceux que libvips sait ouvrir.
 *
 * Les fichiers bruts de boîtier (CR2, CR3, NEF, ARW…) n'en font pas partie :
 * les décoder demanderait une bibliothèque de dématriçage, et un photographe
 * livre de toute façon des fichiers développés. Mieux vaut le dire clairement
 * que d'accepter un fichier qu'on ne saurait pas afficher.
 */
const IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/tiff",
  "image/gif",
  "image/heic",
  "image/heif",
]);
const VIDEO_TYPES = new Set(["video/mp4", "video/quicktime", "video/webm", "video/x-matroska"]);

export const isImage = (mime: string) => IMAGE_TYPES.has(mime);
export const isVideo = (mime: string) => VIDEO_TYPES.has(mime);
export const isAccepted = (mime: string) => isImage(mime) || isVideo(mime);

export type DiskUsage = { freeBytes: number; totalBytes: number; usedRatio: number };

export async function diskUsage(): Promise<DiskUsage | null> {
  try {
    const fs = await statfs(MEDIA_ROOT);
    const totalBytes = fs.blocks * fs.bsize;
    const freeBytes = fs.bavail * fs.bsize;
    return { freeBytes, totalBytes, usedRatio: 1 - freeBytes / totalBytes };
  } catch {
    return null;
  }
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} o`;
  const units = ["Ko", "Mo", "Go", "To"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toLocaleString("fr-FR", { maximumFractionDigits: v < 10 ? 1 : 0 })} ${units[i]}`;
}

/**
 * Les fichiers sont rangés par client puis par mois : une arborescence
 * lisible reste réparable à la main le jour où quelque chose cloche, et
 * quelques milliers d'entrées par dossier suffisent à ne pas ralentir.
 */
function relativeDir(clientId: string, now = new Date()): string {
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return path.join(clientId, month);
}

export type StoredFile = {
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  /** Empreinte du contenu : permet de repérer un doublon exact. */
  checksum: string;
};

export class UploadError extends Error {}

/**
 * Écrit un média et sa dérivée web.
 *
 * Les images sont recompressées à une taille d'affichage : l'original d'un
 * appareil photo pèse dix fois la version publiée, pour une image que
 * personne ne regardera à cette résolution. Les vidéos sont stockées telles
 * quelles — les réencoder demanderait ffmpeg et bien plus de processeur que
 * n'en a un VPS partagé.
 */
export type IncomingFile = {
  filename: string;
  mimeType: string;
  /** Taille annoncée, quand elle est connue. Sert au contrôle préalable. */
  declaredBytes: number | null;
  body: NodeReadableStream | Readable;
};

/**
 * Reçoit un fichier en flux et l'écrit sur le disque.
 *
 * L'écriture passe par un fichier temporaire : une connexion coupée au milieu
 * d'un envoi ne doit pas laisser une image tronquée dans la bibliothèque, où
 * plus rien ne la distinguerait d'une image entière.
 */
export async function storeIncoming(file: IncomingFile, clientId: string): Promise<StoredFile> {
  if (!isAccepted(file.mimeType)) {
    throw new UploadError(
      "Format non reconnu. Images JPEG, PNG, TIFF, WebP, AVIF, HEIC ou vidéos MP4, MOV, WebM. " +
        "Les fichiers bruts de boîtier (CR2, CR3, NEF, ARW) ne sont pas lisibles ici : " +
        "exporte-les en JPEG ou TIFF.",
    );
  }

  const limit = maxBytesFor(file.mimeType);
  if (file.declaredBytes !== null && file.declaredBytes > limit) {
    throw new UploadError(
      `Fichier trop lourd (${formatBytes(file.declaredBytes)}). Maximum ${formatBytes(limit)}.`,
    );
  }

  const disk = await diskUsage();
  if (disk && disk.freeBytes - (file.declaredBytes ?? 0) < MIN_FREE_BYTES) {
    throw new UploadError(
      `Espace disque insuffisant (${formatBytes(disk.freeBytes)} libres). ` +
        "Fais de la place avant d'importer : un disque plein arrête aussi la base de données.",
    );
  }

  const dir = relativeDir(clientId);
  await mkdir(path.join(MEDIA_ROOT, dir), { recursive: true });
  const tmpDir = path.join(MEDIA_ROOT, ".tmp");
  await mkdir(tmpDir, { recursive: true });

  const id = randomUUID();
  const tmpPath = path.join(tmpDir, id);
  const hash = createHash("sha256");
  let received = 0;

  const source = file.body instanceof Readable ? file.body : Readable.fromWeb(file.body);

  try {
    await pipeline(
      source,
      async function* (chunks: AsyncIterable<Buffer>) {
        for await (const chunk of chunks) {
          received += chunk.length;
          // La taille annoncée peut mentir : on recompte en écrivant, et on
          // coupe court plutôt que de remplir le disque.
          if (received > limit) {
            throw new UploadError(
              `Fichier trop lourd (plus de ${formatBytes(limit)}).`,
            );
          }
          hash.update(chunk);
          yield chunk;
        }
      },
      createWriteStream(tmpPath),
    );

    if (received === 0) throw new UploadError("Fichier vide.");

    const checksum = hash.digest("hex");

    if (isImage(file.mimeType)) {
      // sharp lit depuis le chemin : le fichier d'origine n'est jamais tenu
      // en mémoire, quelle que soit sa taille.
      const meta = await sharp(tmpPath, { failOn: "none" }).metadata();

      const webPath = path.join(dir, `${id}.webp`);
      // 2048 px suffit : au-delà, on stocke des pixels que personne n'affiche.
      const info = await sharp(tmpPath, { failOn: "none" })
        .rotate() // respecte l'orientation EXIF, sinon les photos partent de travers
        .resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 82 })
        .toFile(path.join(MEDIA_ROOT, webPath));

      // Miniature servie dans les grilles : c'est elle qui rend l'écran fluide.
      // Elle est tirée de la version déjà réduite, et non de l'original : sur
      // une photo de 24 mégapixels, redécoder l'original coûte cent fois plus
      // de mémoire pour un résultat que l'œil ne distingue pas à 480 px.
      // L'orientation a déjà été appliquée à l'étape précédente.
      await sharp(path.join(MEDIA_ROOT, webPath), { failOn: "none" })
        .resize({ width: 480, height: 480, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 74 })
        .toFile(path.join(MEDIA_ROOT, thumbPathFor(webPath)));

      return {
        storagePath: webPath,
        mimeType: "image/webp",
        sizeBytes: info.size,
        width: meta.width ?? null,
        height: meta.height ?? null,
        checksum,
      };
    }

    const ext = path.extname(file.filename) || ".mp4";
    const videoPath = path.join(dir, `${id}${ext}`);
    // Le temporaire devient le fichier final : un déplacement sur le même
    // volume ne recopie rien, même pour plusieurs gigaoctets.
    await rename(tmpPath, path.join(MEDIA_ROOT, videoPath));

    return {
      storagePath: videoPath,
      mimeType: file.mimeType,
      sizeBytes: received,
      width: null,
      height: null,
      checksum,
    };
  } catch (error) {
    if (error instanceof Error && /unsupported image format|Input file/i.test(error.message)) {
      throw new UploadError(
        "Cette image n'a pas pu être lue. Si elle vient directement d'un boîtier, " +
          "exporte-la en JPEG ou TIFF avant de l'importer.",
      );
    }
    throw error;
  } finally {
    // Le temporaire d'une image a fini son office ; celui d'une vidéo a été
    // déplacé et n'existe plus. Dans les deux cas, il ne doit rien rester.
    await unlink(tmpPath).catch(() => {});
  }
}

/** La miniature vit à côté du fichier, suffixée : pas de second index à tenir. */
export function thumbPathFor(storagePath: string): string {
  const ext = path.extname(storagePath);
  return `${storagePath.slice(0, -ext.length)}.thumb.webp`;
}

export function absolutePath(storagePath: string): string {
  // Empêche qu'un chemin en base fasse sortir de la racine des médias.
  const resolved = path.resolve(MEDIA_ROOT, storagePath);
  if (!resolved.startsWith(path.resolve(MEDIA_ROOT))) {
    throw new UploadError("Chemin de fichier invalide.");
  }
  return resolved;
}

export async function removeStored(storagePath: string): Promise<void> {
  for (const p of [storagePath, thumbPathFor(storagePath)]) {
    try {
      await unlink(absolutePath(p));
    } catch {
      // Un fichier déjà absent n'est pas une erreur : l'entrée en base part
      // de toute façon, et un média orphelin ne doit pas bloquer la suppression.
    }
  }
}

export async function fileExists(storagePath: string): Promise<boolean> {
  try {
    await stat(absolutePath(storagePath));
    return true;
  } catch {
    return false;
  }
}
