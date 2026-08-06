import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { eq } from "drizzle-orm";
import { db, assets } from "@/db";
import { currentUser } from "@/lib/auth";
import { absolutePath, thumbPathFor } from "@/lib/storage";

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

  const wantsThumb = new URL(request.url).searchParams.get("format") === "thumb";
  const relative = wantsThumb ? thumbPathFor(asset.storagePath) : asset.storagePath;

  let file: string;
  let size: number;
  try {
    file = absolutePath(relative);
    size = (await stat(file)).size;
  } catch {
    // La miniature peut manquer pour une vidéo : on retombe sur le fichier.
    try {
      file = absolutePath(asset.storagePath);
      size = (await stat(file)).size;
    } catch {
      return new Response("Fichier absent du disque", { status: 404 });
    }
  }

  const stream = Readable.toWeb(createReadStream(file)) as ReadableStream;
  return new Response(stream, {
    headers: {
      "Content-Type": wantsThumb ? "image/webp" : asset.mimeType,
      "Content-Length": String(size),
      // Privé : un cache partagé ne doit pas resservir le média d'un client
      // à quelqu'un d'autre.
      "Cache-Control": "private, max-age=3600",
    },
  });
}
