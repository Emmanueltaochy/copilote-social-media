import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { and, eq } from "drizzle-orm";
import { db, assets, shootCrew } from "@/db";
import { currentUser } from "@/lib/auth";
import { absolutePath, displayPathFor, thumbPathFor } from "@/lib/storage";

/**
 * Sert un média après contrôle d'accès.
 *
 * Les fichiers ne sont pas exposés par un dossier public : les visuels d'un
 * client, ses produits non encore sortis, ses locaux, n'ont pas à être
 * accessibles à qui devine une URL. Un compte client ne voit que ses propres
 * médias.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await currentUser();
  if (!user) return new Response("Non autorisé", { status: 401 });

  const { id } = await params;
  const rows = await db.select().from(assets).where(eq(assets.id, id)).limit(1);
  const asset = rows[0];
  if (!asset) return new Response("Introuvable", { status: 404 });

  if (user.role === "client" && user.clientId !== asset.clientId) {
    return new Response("Non autorisé", { status: 403 });
  }
  // Un vidéaste : seulement les médias d'un tournage où il est dans l'équipe.
  if (user.role === "videaste") {
    const [membre] = asset.shootId
      ? await db
          .select({ id: shootCrew.userId })
          .from(shootCrew)
          .where(and(eq(shootCrew.shootId, asset.shootId), eq(shootCrew.userId, user.id)))
          .limit(1)
      : [];
    if (!membre) return new Response("Non autorisé", { status: 403 });
  }

  // Trois fichiers par image : la miniature des grilles, la version
  // d'affichage (par défaut) et l'original, celui qui part à la publication.
  const format = new URL(request.url).searchParams.get("format");
  const isImage = asset.mimeType.startsWith("image/");
  const candidates =
    format === "original" || !isImage
      ? [asset.storagePath]
      : format === "thumb"
        ? [thumbPathFor(asset.storagePath), displayPathFor(asset.storagePath), asset.storagePath]
        : [displayPathFor(asset.storagePath), asset.storagePath];

  // Une dérivée peut manquer (média importé avant qu'on garde les originaux,
  // vidéo sans miniature) : on retombe sur le fichier principal.
  let served: { file: string; size: number; relative: string } | null = null;
  for (const relative of candidates) {
    try {
      const file = absolutePath(relative);
      served = { file, size: (await stat(file)).size, relative };
      break;
    } catch {
      // essai suivant
    }
  }
  if (!served) return new Response("Fichier absent du disque", { status: 404 });

  const isOriginal = served.relative === asset.storagePath;
  const stream = Readable.toWeb(createReadStream(served.file)) as ReadableStream;
  return new Response(stream, {
    headers: {
      "Content-Type": isOriginal ? asset.mimeType : "image/webp",
      "Content-Length": String(served.size),
      ...(format === "original"
        ? { "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(downloadName(asset.filename, asset.mimeType))}` }
        : {}),
      // Privé : un cache partagé ne doit pas resservir le média d'un client
      // à quelqu'un d'autre.
      "Cache-Control": "private, max-age=3600",
    },
  });
}

/**
 * Le nom proposé au téléchargement. Un HEIC ou un TIFF est stocké en JPEG :
 * lui laisser son extension d'origine donnerait un fichier que rien n'ouvre.
 */
function downloadName(filename: string, mimeType: string): string {
  const ext = mimeType === "image/jpeg" ? ".jpg" : mimeType === "image/png" ? ".png" : mimeType === "image/webp" ? ".webp" : null;
  if (!ext) return filename;
  const current = filename.match(/\.[a-z0-9]+$/i)?.[0].toLowerCase();
  if (current === ext || (ext === ".jpg" && current === ".jpeg")) return filename;
  return `${current ? filename.slice(0, -current.length) : filename}${ext}`;
}
