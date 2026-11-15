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
 * Une image garde son fichier d'origine (c'est lui qui est publié), plus deux
 * dérivées légères pour l'écran. Ce qu'on accepte pèse donc réellement sur le
 * disque : le plafond écarte ce qui n'est manifestement pas une photo, et le
 * contrôle d'espace libre fait le reste.
 *
 * Une vidéo est stockée telle quelle elle aussi : son plafond reste le vrai
 * garde-fou, avec le contrôle d'espace libre.
 */
export const MAX_IMAGE_BYTES = 400 * 1024 * 1024; // 400 Mo
export const MAX_VIDEO_BYTES = 4 * 1024 * 1024 * 1024; // 4 Go

/** Version d'affichage (application, portail) et miniature des grilles. */
const DISPLAY_WIDTH = 1440;
const DISPLAY_QUALITY = 90;
const THUMB_WIDTH = 480;
const THUMB_QUALITY = 80;
/** Fichier de publication tiré d'un format que les réseaux ne prennent pas. */
const PUBLISH_JPEG_QUALITY = 95;

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

/**
 * Documents rattachés à un client : contrat, charte, brief, devis.
 *
 * Ils sont stockés tels quels, sans transformation — un contrat signé ne se
 * recompresse pas. La liste est fermée : accepter n'importe quel type
 * reviendrait à héberger des exécutables sur un serveur qui sert des fichiers
 * à des comptes extérieurs.
 */
const DOCUMENT_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.oasis.opendocument.text",
  "application/vnd.oasis.opendocument.spreadsheet",
  "text/plain",
  "text/csv",
  "application/zip",
]);

export const isDocument = (mime: string) => DOCUMENT_TYPES.has(mime);

/**
 * Ce qu'on accepte en pièce jointe : documents, images et vidéos.
 *
 * Un client dépose ce qu'il a — un devis en PDF, un logo en PNG, une vidéo
 * tournée au téléphone. Refuser la vidéo l'obligerait à passer par un envoi
 * externe, c'est-à-dire à sortir du portail et à ne plus y revenir.
 */
export const isAttachment = (mime: string) =>
  isDocument(mime) || IMAGE_TYPES.has(mime) || VIDEO_TYPES.has(mime);

/** Une vidéo de téléphone dépasse vite 100 Mo : la limite suit le format. */
export const MAX_DOCUMENT_BYTES = 100 * 1024 * 1024; // 100 Mo
export const MAX_ATTACHMENT_VIDEO_BYTES = 2 * 1024 * 1024 * 1024; // 2 Go
export const maxAttachmentBytes = (mime: string) =>
  VIDEO_TYPES.has(mime) ? MAX_ATTACHMENT_VIDEO_BYTES : MAX_DOCUMENT_BYTES;

export const isImage = (mime: string) => IMAGE_TYPES.has(mime);
export const isVideo = (mime: string) => VIDEO_TYPES.has(mime);
export const isAccepted = (mime: string) => isImage(mime) || isVideo(mime);

/**
 * Type déduit de l'extension, quand le navigateur ne le dit pas.
 *
 * Il arrive qu'il annonce « application/octet-stream », ou rien du tout :
 * selon le système, un .MOV venu d'un iPhone ou un .mkv passé par un disque
 * externe arrivent sans type. Refuser dans ce cas reviendrait à rejeter un
 * fichier parfaitement lisible pour une raison que rien n'explique à l'écran.
 */
const BY_EXTENSION: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
  ".gif": "image/gif",
  ".heic": "image/heic",
  ".heif": "image/heif",
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".mkv": "video/x-matroska",
};

export function resolveMime(declared: string, filename: string): string {
  if (isAccepted(declared)) return declared;
  const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
  return BY_EXTENSION[ext] ?? declared;
}

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
 * Écrit un média et ses dérivées.
 *
 * Une image garde son fichier d'origine : c'est lui qui part chez Metricool à
 * la publication, et une story de 2160 × 3840 recompressée arrive floue sur
 * les réseaux. À côté, deux dérivées WebP pour l'écran seulement — une version
 * d'affichage (application et portail) et une miniature pour les grilles. Les
 * vidéos sont stockées telles quelles : les réencoder demanderait ffmpeg et
 * bien plus de processeur que n'en a un VPS partagé.
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
export async function storeIncoming(input: IncomingFile, clientId: string): Promise<StoredFile> {
  const file = { ...input, mimeType: resolveMime(input.mimeType, input.filename) };

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
      `Fichier trop lourd : ${formatBytes(file.declaredBytes)}, contre ${formatBytes(limit)} ` +
        `autorisés pour ${isVideo(file.mimeType) ? "une vidéo" : "une image"}.`,
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
  let settled = false;
  /** Ce que l'image a commencé d'écrire : à effacer si l'import échoue en route. */
  const written: string[] = [];

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

    // Un flux interrompu se termine sans erreur : la lecture s'arrête, tout
    // paraît normal, et le fichier écrit est un JPEG coupé au milieu. Sans ce
    // contrôle, il entrerait dans la bibliothèque comme une image valide et
    // n'échouerait qu'au moment de le lire — « premature end of JPEG image ».
    // Comparer à la taille annoncée est le seul moyen de faire la différence
    // entre un envoi terminé et un envoi coupé.
    if (file.declaredBytes !== null && received !== file.declaredBytes) {
      throw new UploadError(
        `Envoi interrompu : ${formatBytes(received)} reçus sur ${formatBytes(file.declaredBytes)} annoncés. ` +
          "Rien n'a été enregistré, relance ce fichier.",
      );
    }

    const checksum = hash.digest("hex");

    if (isImage(file.mimeType)) {
      // sharp lit depuis le chemin : le fichier d'origine n'est jamais tenu
      // en mémoire, quelle que soit sa taille.
      const meta = await sharp(tmpPath, { failOn: "none" }).metadata();

      // On se fie au contenu, pas à l'extension : un « .jpg » qui est en
      // réalité un HEIC ne serait pas publiable.
      const kept =
        meta.format === "jpeg"
          ? { ext: ".jpg", mime: "image/jpeg" }
          : meta.format === "png"
            ? { ext: ".png", mime: "image/png" }
            : null;
      const mainPath = path.join(dir, `${id}${kept?.ext ?? ".jpg"}`);
      written.push(mainPath, displayPathFor(mainPath), thumbPathFor(mainPath));

      let sizeBytes = received;
      if (!kept) {
        // HEIC, TIFF, AVIF, WebP, GIF : les réseaux ne les prennent pas tels
        // quels. Le fichier de publication est un JPEG en pleine définition,
        // sans réduction ; la transparence, que le JPEG ignore, devient blanche.
        const info = await sharp(tmpPath, { failOn: "none" })
          .rotate()
          .flatten({ background: "#ffffff" })
          .jpeg({ quality: PUBLISH_JPEG_QUALITY, chromaSubsampling: "4:4:4" })
          .toFile(path.join(MEDIA_ROOT, mainPath));
        sizeBytes = info.size;
      }

      // Version d'affichage : assez large pour rester nette en pleine largeur
      // sur un téléphone (390 points × 3 pixels), assez légère pour un portail.
      await sharp(tmpPath, { failOn: "none" })
        .rotate() // respecte l'orientation EXIF, sinon les photos partent de travers
        .resize({ width: DISPLAY_WIDTH, withoutEnlargement: true })
        .webp({ quality: DISPLAY_QUALITY })
        .toFile(path.join(MEDIA_ROOT, displayPathFor(mainPath)));

      // Miniature des grilles, tirée de la version d'affichage (déjà orientée) :
      // redécoder un original de 24 mégapixels coûterait cent fois plus de
      // mémoire. Réduite par la largeur seule : dans un carré de 480, une
      // story verticale tombait à 270 px de large et s'affichait floue.
      await sharp(path.join(MEDIA_ROOT, displayPathFor(mainPath)), { failOn: "none" })
        .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
        .webp({ quality: THUMB_QUALITY })
        .toFile(path.join(MEDIA_ROOT, thumbPathFor(mainPath)));

      // JPEG et PNG : l'original devient le fichier principal, octet pour
      // octet. Déplacé en dernier, une fois les dérivées écrites.
      if (kept) await rename(tmpPath, path.join(MEDIA_ROOT, mainPath));

      // Orientations EXIF 5 à 8 : l'image est couchée dans le fichier, largeur
      // et hauteur affichées sont inversées.
      const turned = (meta.orientation ?? 1) >= 5;
      settled = true;
      return {
        storagePath: mainPath,
        mimeType: kept?.mime ?? "image/jpeg",
        sizeBytes,
        width: (turned ? meta.height : meta.width) ?? null,
        height: (turned ? meta.width : meta.height) ?? null,
        checksum,
      };
    }

    const ext = path.extname(file.filename) || ".mp4";
    const videoPath = path.join(dir, `${id}${ext}`);
    // Le temporaire devient le fichier final : un déplacement sur le même
    // volume ne recopie rien, même pour plusieurs gigaoctets.
    await rename(tmpPath, path.join(MEDIA_ROOT, videoPath));

    settled = true;
    return {
      storagePath: videoPath,
      mimeType: file.mimeType,
      sizeBytes: received,
      width: null,
      height: null,
      checksum,
    };
  } catch (error) {
    // libvips signale une image coupée par « premature end ». C'est un envoi
    // interrompu, pas un mauvais format : le dire autrement enverrait chercher
    // un problème dans le fichier d'origine, qui est intact.
    if (error instanceof Error && /premature end|truncat/i.test(error.message)) {
      throw new UploadError(
        "Envoi interrompu : l'image est arrivée incomplète. Rien n'a été enregistré, relance ce fichier.",
      );
    }
    if (error instanceof Error && /unsupported image format|Input file/i.test(error.message)) {
      throw new UploadError(
        "Cette image n'a pas pu être lue. Si elle vient directement d'un boîtier, " +
          "exporte-la en JPEG ou TIFF avant de l'importer.",
      );
    }
    throw error;
  } finally {
    // Le temporaire d'une image a fini son office ou est devenu le fichier
    // principal ; celui d'une vidéo a été déplacé. Il ne doit rien rester.
    await unlink(tmpPath).catch(() => {});
    // Une conversion interrompue laisse des fichiers à moitié écrits. Sans
    // ligne en base, plus rien ne les désigne : ils occuperaient le disque
    // sans que personne puisse les retrouver ni les supprimer.
    if (!settled) {
      for (const p of written) await unlink(path.join(MEDIA_ROOT, p)).catch(() => {});
    }
  }
}

/** La miniature vit à côté du fichier, suffixée : pas de second index à tenir. */
export function thumbPathFor(storagePath: string): string {
  const ext = path.extname(storagePath);
  return `${storagePath.slice(0, -ext.length)}.thumb.webp`;
}

/**
 * La version d'affichage d'une image, à côté de l'original.
 *
 * Les médias importés avant qu'on garde les originaux n'en ont pas : leur
 * fichier principal est déjà un WebP réduit, et c'est lui qu'on affiche.
 */
export function displayPathFor(storagePath: string): string {
  const ext = path.extname(storagePath);
  return `${storagePath.slice(0, -ext.length)}.web.webp`;
}

/**
 * Une image d'avant la conservation des originaux : il n'en reste qu'un WebP
 * réduit. Depuis, un fichier principal n'est jamais un WebP (JPEG ou PNG
 * d'origine, ou JPEG de publication).
 */
export function isLegacyImage(asset: { storagePath: string; mimeType: string }): boolean {
  return asset.mimeType === "image/webp" && asset.storagePath.endsWith(".webp");
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
  for (const p of [storagePath, thumbPathFor(storagePath), displayPathFor(storagePath)]) {
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

/* ------------------------------------------------- pièces jointes client -- */

export type StoredDocument = {
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
};

/**
 * Écrit une pièce jointe telle quelle.
 *
 * Aucune transformation : un contrat, un devis, une charte doivent ressortir
 * à l'octet près tels qu'ils sont entrés. Ils vivent à part des médias, dans
 * un dossier « documents », pour qu'une sauvegarde ou une inspection à la
 * main distingue d'un coup d'œil ce qui est publiable de ce qui est
 * contractuel.
 */
export async function storeDocument(
  file: IncomingFile,
  clientId: string,
): Promise<StoredDocument> {
  if (!isAttachment(file.mimeType)) {
    throw new UploadError(
      "Format non accepté. PDF, Word, Excel, PowerPoint, OpenDocument, texte, CSV, ZIP ou image.",
    );
  }
  const plafond = maxAttachmentBytes(file.mimeType);
  if (file.declaredBytes !== null && file.declaredBytes > plafond) {
    throw new UploadError(
      `Fichier trop lourd (${formatBytes(file.declaredBytes)}). Maximum ${formatBytes(plafond)}.`,
    );
  }

  const disk = await diskUsage();
  if (disk && disk.freeBytes - (file.declaredBytes ?? 0) < MIN_FREE_BYTES) {
    throw new UploadError(
      `Espace disque insuffisant (${formatBytes(disk.freeBytes)} libres).`,
    );
  }

  const dir = path.join(clientId, "documents");
  await mkdir(path.join(MEDIA_ROOT, dir), { recursive: true });
  const tmpDir = path.join(MEDIA_ROOT, ".tmp");
  await mkdir(tmpDir, { recursive: true });

  const id = randomUUID();
  const tmpPath = path.join(tmpDir, id);
  let received = 0;
  const source = file.body instanceof Readable ? file.body : Readable.fromWeb(file.body);

  try {
    await pipeline(
      source,
      async function* (chunks: AsyncIterable<Buffer>) {
        for await (const chunk of chunks) {
          received += chunk.length;
          if (received > plafond) {
            throw new UploadError(`Fichier trop lourd (plus de ${formatBytes(plafond)}).`);
          }
          yield chunk;
        }
      },
      createWriteStream(tmpPath),
    );

    if (received === 0) throw new UploadError("Fichier vide.");
    // Même contrôle que pour les médias : un envoi coupé produirait un PDF
    // illisible que rien ne distinguerait d'un PDF entier.
    if (file.declaredBytes !== null && received !== file.declaredBytes) {
      throw new UploadError(
        `Envoi interrompu : ${formatBytes(received)} reçus sur ${formatBytes(file.declaredBytes)} annoncés. ` +
          "Rien n'a été enregistré, relance ce fichier.",
      );
    }

    // L'extension d'origine est conservée : c'est elle qui fait ouvrir le
    // fichier avec le bon logiciel une fois téléchargé.
    const ext = path.extname(file.filename).slice(0, 12);
    const storagePath = path.join(dir, `${id}${ext}`);
    await rename(tmpPath, path.join(MEDIA_ROOT, storagePath));

    return { storagePath, mimeType: file.mimeType, sizeBytes: received };
  } finally {
    await unlink(tmpPath).catch(() => {});
  }
}

/* ------------------------------------------------------ photos de profil -- */

/** Une photo de profil ne dépassera jamais cette taille à l'entrée. */
export const MAX_AVATAR_BYTES = 25 * 1024 * 1024; // 25 Mo

/**
 * Enregistre la photo de profil de quelqu'un.
 *
 * Elle est recadrée en carré et réduite à 256 px : c'est la plus grande taille
 * à laquelle elle sera jamais affichée, et une photo de téléphone de 8 Mo
 * servie telle quelle dans une liste de conversations ferait ramer l'écran
 * pour des pixels que personne ne voit.
 *
 * Le fichier porte le nom de la personne suivi d'un identifiant tiré au sort :
 * remplacer sa photo doit changer l'adresse, sinon le navigateur continue
 * d'afficher l'ancienne, qu'on croit alors ne pas avoir réussi à envoyer.
 */
export async function storeAvatar(file: IncomingFile, userId: string): Promise<string> {
  const mime = resolveMime(file.mimeType, file.filename);
  if (!isImage(mime)) {
    throw new UploadError("Une photo, donc une image : JPEG, PNG, HEIC ou WebP.");
  }
  if (file.declaredBytes !== null && file.declaredBytes > MAX_AVATAR_BYTES) {
    throw new UploadError(
      `Photo trop lourde (${formatBytes(file.declaredBytes)}). Maximum ${formatBytes(MAX_AVATAR_BYTES)}.`,
    );
  }

  const dir = "avatars";
  await mkdir(path.join(MEDIA_ROOT, dir), { recursive: true });
  const tmpDir = path.join(MEDIA_ROOT, ".tmp");
  await mkdir(tmpDir, { recursive: true });

  const tmpPath = path.join(tmpDir, randomUUID());
  let received = 0;
  const source = file.body instanceof Readable ? file.body : Readable.fromWeb(file.body);

  try {
    await pipeline(
      source,
      async function* (chunks: AsyncIterable<Buffer>) {
        for await (const chunk of chunks) {
          received += chunk.length;
          if (received > MAX_AVATAR_BYTES) {
            throw new UploadError(`Photo trop lourde (plus de ${formatBytes(MAX_AVATAR_BYTES)}).`);
          }
          yield chunk;
        }
      },
      createWriteStream(tmpPath),
    );

    if (received === 0) throw new UploadError("Fichier vide.");
    if (file.declaredBytes !== null && received !== file.declaredBytes) {
      throw new UploadError("Envoi interrompu. Rien n'a été enregistré, relance la photo.");
    }

    const storagePath = path.join(dir, `${userId}-${randomUUID().slice(0, 8)}.webp`);
    await sharp(tmpPath, { failOn: "none" })
      .rotate() // sans quoi les portraits pris au téléphone arrivent couchés
      .resize({ width: 256, height: 256, fit: "cover", position: "attention" })
      .webp({ quality: 82 })
      .toFile(path.join(MEDIA_ROOT, storagePath));

    return storagePath;
  } catch (error) {
    if (error instanceof Error && /premature end|truncat/i.test(error.message)) {
      throw new UploadError("Envoi interrompu : la photo est arrivée incomplète. Relance-la.");
    }
    if (error instanceof Error && /unsupported image format|Input file/i.test(error.message)) {
      throw new UploadError("Cette image n'a pas pu être lue. Essaie un JPEG ou un PNG.");
    }
    throw error;
  } finally {
    await unlink(tmpPath).catch(() => {});
  }
}

export const MAX_BRANDING_BYTES = 25 * 1024 * 1024; // 25 Mo

/**
 * Les images de marque : un logo par pôle, et le visuel des pages d'entrée.
 *
 * La liste est ici et nulle part ailleurs — les routes s'y réfèrent plutôt que
 * de répéter trois chaînes, pour qu'un nom mal orthographié dans une adresse
 * ne serve jamais un fichier.
 */
export const BRANDING_KINDS = ["logo", "logo-web", "cover"] as const;
export type BrandingKind = (typeof BRANDING_KINDS)[number];
export const isBrandingKind = (v: string): v is BrandingKind =>
  (BRANDING_KINDS as readonly string[]).includes(v);

/**
 * Enregistre une image de marque : le logo, ou le visuel des pages de connexion.
 *
 * Les deux sont servis à des visiteurs non connectés, sur la page qu'ils voient
 * avant tout le reste : ils doivent être légers. Le logo est réduit sans être
 * recadré — un logo tronqué ne serait plus un logo — et gardé en WebP avec sa
 * transparence. Le visuel, lui, remplit une colonne d'écran ou un fond de
 * téléphone : il est recadré au format portrait, celui qui convient aux deux.
 */
export async function storeBranding(
  file: IncomingFile,
  kind: BrandingKind,
): Promise<string> {
  const mime = resolveMime(file.mimeType, file.filename);
  if (!isImage(mime)) {
    throw new UploadError("Une image : JPEG, PNG, HEIC ou WebP.");
  }
  if (file.declaredBytes !== null && file.declaredBytes > MAX_BRANDING_BYTES) {
    throw new UploadError(
      `Image trop lourde (${formatBytes(file.declaredBytes)}). Maximum ${formatBytes(MAX_BRANDING_BYTES)}.`,
    );
  }

  const dir = "marque";
  await mkdir(path.join(MEDIA_ROOT, dir), { recursive: true });
  const tmpDir = path.join(MEDIA_ROOT, ".tmp");
  await mkdir(tmpDir, { recursive: true });

  const tmpPath = path.join(tmpDir, randomUUID());
  let received = 0;
  const source = file.body instanceof Readable ? file.body : Readable.fromWeb(file.body);

  try {
    await pipeline(
      source,
      async function* (chunks: AsyncIterable<Buffer>) {
        for await (const chunk of chunks) {
          received += chunk.length;
          if (received > MAX_BRANDING_BYTES) {
            throw new UploadError(`Image trop lourde (plus de ${formatBytes(MAX_BRANDING_BYTES)}).`);
          }
          yield chunk;
        }
      },
      createWriteStream(tmpPath),
    );

    if (received === 0) throw new UploadError("Fichier vide.");
    if (file.declaredBytes !== null && received !== file.declaredBytes) {
      throw new UploadError("Envoi interrompu. Rien n'a été enregistré, relance l'image.");
    }

    // Le nom change à chaque envoi : sans cela, le navigateur continuerait
    // d'afficher l'ancienne image, qu'on croirait n'avoir pas su remplacer.
    const storagePath = path.join(dir, `${kind}-${randomUUID().slice(0, 8)}.webp`);
    const image = sharp(tmpPath, { failOn: "none" }).rotate();

    if (kind !== "cover") {
      await image
        .resize({ width: 512, height: 512, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 90 })
        .toFile(path.join(MEDIA_ROOT, storagePath));
    } else {
      await image
        .resize({ width: 1200, height: 1600, fit: "cover", position: "attention" })
        .webp({ quality: 78 })
        .toFile(path.join(MEDIA_ROOT, storagePath));
    }

    return storagePath;
  } catch (error) {
    if (error instanceof Error && /premature end|truncat/i.test(error.message)) {
      throw new UploadError("Envoi interrompu : l'image est arrivée incomplète. Relance-la.");
    }
    if (error instanceof Error && /unsupported image format|Input file/i.test(error.message)) {
      throw new UploadError("Cette image n'a pas pu être lue. Essaie un JPEG ou un PNG.");
    }
    throw error;
  } finally {
    await unlink(tmpPath).catch(() => {});
  }
}

/**
 * Enregistre le visuel d'une bannière de portail.
 *
 * Ramené à 1600 px de large sans recadrage : une bannière est composée avec
 * ses proportions — un rognage automatique couperait le texte que l'agence y
 * a mis. Elle est simplement empêchée de dépasser une taille qui ralentirait
 * l'affichage du portail.
 */
export async function storePromoImage(file: IncomingFile): Promise<string> {
  const mime = resolveMime(file.mimeType, file.filename);
  if (!isImage(mime)) throw new UploadError("Une image : JPEG, PNG, HEIC ou WebP.");
  if (file.declaredBytes !== null && file.declaredBytes > MAX_BRANDING_BYTES) {
    throw new UploadError(
      `Image trop lourde (${formatBytes(file.declaredBytes)}). Maximum ${formatBytes(MAX_BRANDING_BYTES)}.`,
    );
  }

  const dir = "promos";
  await mkdir(path.join(MEDIA_ROOT, dir), { recursive: true });
  const tmpDir = path.join(MEDIA_ROOT, ".tmp");
  await mkdir(tmpDir, { recursive: true });

  const tmpPath = path.join(tmpDir, randomUUID());
  let received = 0;
  const source = file.body instanceof Readable ? file.body : Readable.fromWeb(file.body);

  try {
    await pipeline(
      source,
      async function* (chunks: AsyncIterable<Buffer>) {
        for await (const chunk of chunks) {
          received += chunk.length;
          if (received > MAX_BRANDING_BYTES) {
            throw new UploadError(`Image trop lourde (plus de ${formatBytes(MAX_BRANDING_BYTES)}).`);
          }
          yield chunk;
        }
      },
      createWriteStream(tmpPath),
    );

    if (received === 0) throw new UploadError("Fichier vide.");
    if (file.declaredBytes !== null && received !== file.declaredBytes) {
      throw new UploadError("Envoi interrompu. Rien n'a été enregistré, relance l'image.");
    }

    const storagePath = path.join(dir, `${randomUUID()}.webp`);
    await sharp(tmpPath, { failOn: "none" })
      .rotate()
      .resize({ width: 1600, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toFile(path.join(MEDIA_ROOT, storagePath));

    return storagePath;
  } catch (error) {
    if (error instanceof Error && /premature end|truncat/i.test(error.message)) {
      throw new UploadError("Envoi interrompu : l'image est arrivée incomplète. Relance-la.");
    }
    if (error instanceof Error && /unsupported image format|Input file/i.test(error.message)) {
      throw new UploadError("Cette image n'a pas pu être lue. Essaie un JPEG ou un PNG.");
    }
    throw error;
  } finally {
    await unlink(tmpPath).catch(() => {});
  }
}

/* ------------------------------------------------ vidéo d'accueil -------- */

export const MAX_PORTAL_VIDEO_BYTES = 1024 * 1024 * 1024; // 1 Go

/**
 * Les formats qu'un navigateur lit sans extension : MP4 partout, WebM hors
 * Safari, MOV seulement chez Apple. Un MKV s'enregistrerait mais resterait un
 * cadre noir chez le client — on le refuse plutôt que de le laisser croire en
 * ligne.
 */
const PORTAL_VIDEO_EXT: Record<string, string> = {
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "video/quicktime": ".mov",
};

export const portalVideoMime = (storagePath: string): string =>
  storagePath.endsWith(".webm") ? "video/webm" : storagePath.endsWith(".mov") ? "video/quicktime" : "video/mp4";

/**
 * Enregistre la vidéo d'accueil du portail, sans la transformer.
 *
 * Écrite d'abord dans un fichier temporaire puis renommée : un envoi coupé ne
 * laisse jamais une vidéo à moitié écrite à la place de la précédente.
 */
export async function storePortalVideo(file: IncomingFile): Promise<string> {
  const mime = resolveMime(file.mimeType, file.filename);
  const ext = PORTAL_VIDEO_EXT[mime];
  if (!ext) throw new UploadError("Une vidéo MP4 (conseillé), WebM ou MOV.");
  if (file.declaredBytes !== null && file.declaredBytes > MAX_PORTAL_VIDEO_BYTES) {
    throw new UploadError(
      `Vidéo trop lourde (${formatBytes(file.declaredBytes)}). Maximum ${formatBytes(MAX_PORTAL_VIDEO_BYTES)}.`,
    );
  }

  const dir = "marque";
  await mkdir(path.join(MEDIA_ROOT, dir), { recursive: true });
  const tmpDir = path.join(MEDIA_ROOT, ".tmp");
  await mkdir(tmpDir, { recursive: true });

  const tmpPath = path.join(tmpDir, randomUUID());
  let received = 0;
  const source = file.body instanceof Readable ? file.body : Readable.fromWeb(file.body);

  try {
    await pipeline(
      source,
      async function* (chunks: AsyncIterable<Buffer>) {
        for await (const chunk of chunks) {
          received += chunk.length;
          if (received > MAX_PORTAL_VIDEO_BYTES) {
            throw new UploadError(`Vidéo trop lourde (plus de ${formatBytes(MAX_PORTAL_VIDEO_BYTES)}).`);
          }
          yield chunk;
        }
      },
      createWriteStream(tmpPath),
    );

    if (received === 0) throw new UploadError("Fichier vide.");
    if (file.declaredBytes !== null && received !== file.declaredBytes) {
      throw new UploadError("Envoi interrompu. Rien n'a été enregistré, relance la vidéo.");
    }

    const storagePath = path.join(dir, `video-portail-${randomUUID().slice(0, 8)}${ext}`);
    await rename(tmpPath, path.join(MEDIA_ROOT, storagePath));
    return storagePath;
  } finally {
    await unlink(tmpPath).catch(() => {});
  }
}
