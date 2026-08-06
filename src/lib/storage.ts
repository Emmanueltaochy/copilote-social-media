import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { mkdir, stat, unlink, writeFile } from "node:fs/promises";
import { statfs } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

/**
 * Stockage des médias sur le disque du VPS.
 *
 * Le principe : on ne garde que ce qui est publiable et réutilisable. Les
 * rushes de tournage restent chez l'agence — un seul tournage en 4K pèse plus
 * que six mois de médias livrés, et les mettre ici remplirait le disque en
 * quelques semaines.
 *
 * Trois garde-fous en découlent : une taille maximale par fichier, un refus
 * d'envoi quand le disque se remplit, et une dérivée web générée à
 * l'importation pour que les écrans n'aient jamais à servir l'original.
 */

/** Racine des médias. Volume Docker en production, dossier local sinon. */
export const MEDIA_ROOT = process.env.MEDIA_ROOT ?? "/data/assets";

/** Au-delà, c'est un rush, pas un média livré. */
export const MAX_UPLOAD_BYTES = 120 * 1024 * 1024; // 120 Mo

/** En dessous, on refuse d'écrire : un disque plein arrête aussi PostgreSQL. */
export const MIN_FREE_BYTES = 5 * 1024 * 1024 * 1024; // 5 Go

/** En dessous, on prévient : il reste de la marge, mais plus pour longtemps. */
export const WARN_FREE_BYTES = 15 * 1024 * 1024 * 1024; // 15 Go

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
const VIDEO_TYPES = new Set(["video/mp4", "video/quicktime", "video/webm"]);

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
export async function storeUpload(file: File, clientId: string): Promise<StoredFile> {
  if (!isAccepted(file.type)) {
    throw new UploadError(
      "Format non accepté. Images JPEG, PNG, WebP, AVIF ou vidéos MP4, MOV, WebM.",
    );
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new UploadError(
      `Fichier trop lourd (${formatBytes(file.size)}). Maximum ${formatBytes(MAX_UPLOAD_BYTES)} : ` +
        "les rushes de tournage n'ont pas leur place ici, seulement les médias livrés.",
    );
  }

  const disk = await diskUsage();
  if (disk && disk.freeBytes - file.size < MIN_FREE_BYTES) {
    throw new UploadError(
      `Espace disque insuffisant (${formatBytes(disk.freeBytes)} libres). ` +
        "Fais de la place avant d'importer : un disque plein arrête aussi la base de données.",
    );
  }

  const dir = relativeDir(clientId);
  await mkdir(path.join(MEDIA_ROOT, dir), { recursive: true });

  const buffer = Buffer.from(await file.arrayBuffer());
  const checksum = createHash("sha256").update(buffer).digest("hex");
  const id = randomUUID();

  if (isImage(file.type)) {
    const image = sharp(buffer, { failOn: "none" });
    const meta = await image.metadata();

    // 2048 px suffit : au-delà, on stocke des pixels que personne n'affiche.
    const webPath = path.join(dir, `${id}.webp`);
    const output = await image
      .rotate() // respecte l'orientation EXIF, sinon les photos partent de travers
      .resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
    await writeFile(path.join(MEDIA_ROOT, webPath), output);

    // Miniature servie dans les grilles : c'est elle qui rend l'écran fluide.
    await sharp(buffer, { failOn: "none" })
      .rotate()
      .resize({ width: 480, height: 480, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 74 })
      .toFile(path.join(MEDIA_ROOT, thumbPathFor(webPath)));

    return {
      storagePath: webPath,
      mimeType: "image/webp",
      sizeBytes: output.length,
      width: meta.width ?? null,
      height: meta.height ?? null,
      checksum,
    };
  }

  const ext = path.extname(file.name) || ".mp4";
  const videoPath = path.join(dir, `${id}${ext}`);
  await writeFile(path.join(MEDIA_ROOT, videoPath), buffer);

  return {
    storagePath: videoPath,
    mimeType: file.type,
    sizeBytes: buffer.length,
    width: null,
    height: null,
    checksum,
  };
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
