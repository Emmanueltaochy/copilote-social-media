import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { eq } from "drizzle-orm";
import { db, settings } from "@/db";
import { absolutePath } from "@/lib/storage";

/**
 * Sert le logo ou le visuel de connexion, sans session.
 *
 * C'est la seule route de fichiers ouverte à un visiteur non connecté, et elle
 * l'est parce qu'elle sert la page de connexion elle-même. Elle ne peut pas
 * servir autre chose : le chemin n'est jamais lu dans l'adresse, il est
 * relu dans les réglages. Deux images, pas une de plus.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  if (kind !== "logo" && kind !== "cover") return new Response("Introuvable", { status: 404 });

  const [config] = await db.select().from(settings).where(eq(settings.id, "agence")).limit(1);
  const storagePath = kind === "cover" ? config?.coverPath : config?.logoPath;
  if (!storagePath) return new Response("Introuvable", { status: 404 });

  let absolute: string;
  let size: number;
  try {
    absolute = absolutePath(storagePath);
    size = (await stat(absolute)).size;
  } catch {
    return new Response("Fichier absent du disque", { status: 404 });
  }

  const stream = Readable.toWeb(createReadStream(absolute)) as ReadableStream;
  return new Response(stream, {
    headers: {
      "Content-Type": "image/webp",
      "Content-Length": String(size),
      // Le nom du fichier change à chaque envoi : le cache peut être long sans
      // jamais montrer une image périmée.
      "Cache-Control": "public, max-age=3600",
    },
  });
}
