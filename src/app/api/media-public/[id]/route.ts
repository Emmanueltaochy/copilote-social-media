import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { eq } from "drizzle-orm";
import { db, assets } from "@/db";
import { verifyMediaSignature } from "@/lib/media-sign";
import { absolutePath } from "@/lib/storage";

/**
 * Sert un média sur présentation d'un lien signé (voir lib/media-sign) :
 * c'est par là que Metricool vient chercher le visuel d'une publication
 * programmée depuis Pilot. Sans signature valide, rien n'est servi.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const q = new URL(request.url).searchParams;
  if (!(await verifyMediaSignature(id, q.get("exp"), q.get("sig")))) {
    return new Response("Lien invalide ou expiré", { status: 403 });
  }
  const [asset] = await db.select().from(assets).where(eq(assets.id, id)).limit(1);
  if (!asset) return new Response("Introuvable", { status: 404 });
  let file: string;
  let size: number;
  try {
    file = absolutePath(asset.storagePath);
    size = (await stat(file)).size;
  } catch {
    return new Response("Fichier absent du disque", { status: 404 });
  }
  const stream = Readable.toWeb(createReadStream(file)) as ReadableStream;
  return new Response(stream, {
    headers: {
      "Content-Type": asset.mimeType,
      "Content-Length": String(size),
      "Content-Disposition": `inline; filename="${encodeURIComponent(asset.filename)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
