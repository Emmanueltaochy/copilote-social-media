import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { eq } from "drizzle-orm";
import { db, promos } from "@/db";
import { currentUser } from "@/lib/auth";
import { absolutePath } from "@/lib/storage";

/**
 * Sert le visuel d'une bannière.
 *
 * Une bannière s'adresse à tous les clients de l'agence : il n'y a pas
 * d'appartenance à vérifier, seulement une session. Le chemin du fichier est
 * relu en base et jamais pris dans l'adresse.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return new Response("Non autorisé", { status: 401 });

  const { id } = await params;
  const [banniere] = await db.select().from(promos).where(eq(promos.id, id)).limit(1);
  if (!banniere?.imagePath) return new Response("Introuvable", { status: 404 });

  let absolute: string;
  let size: number;
  try {
    absolute = absolutePath(banniere.imagePath);
    size = (await stat(absolute)).size;
  } catch {
    return new Response("Fichier absent du disque", { status: 404 });
  }

  const stream = Readable.toWeb(createReadStream(absolute)) as ReadableStream;
  return new Response(stream, {
    headers: {
      "Content-Type": "image/webp",
      "Content-Length": String(size),
      // Le nom du fichier change à chaque envoi : le cache peut être long.
      "Cache-Control": "private, max-age=3600",
    },
  });
}
