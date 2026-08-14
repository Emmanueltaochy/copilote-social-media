import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { eq } from "drizzle-orm";
import { db, clientFiles } from "@/db";
import { currentUser } from "@/lib/auth";
import { absolutePath } from "@/lib/storage";

/**
 * Sert une pièce jointe après contrôle d'accès.
 *
 * Le dossier d'un client est partagé avec lui : depuis son portail il y dépose
 * ses fichiers et relit ceux qu'on lui a laissés. Il n'accède qu'au sien —
 * l'appartenance est vérifiée sur le fichier, jamais sur un paramètre.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return new Response("Non autorisé", { status: 401 });

  const { id } = await params;
  const rows = await db.select().from(clientFiles).where(eq(clientFiles.id, id)).limit(1);
  const file = rows[0];
  if (!file) return new Response("Introuvable", { status: 404 });

  if (user.role === "client" && user.clientId !== file.clientId) {
    return new Response("Non autorisé", { status: 403 });
  }

  let size: number;
  let absolute: string;
  try {
    absolute = absolutePath(file.storagePath);
    size = (await stat(absolute)).size;
  } catch {
    return new Response("Fichier absent du disque", { status: 404 });
  }

  const stream = Readable.toWeb(createReadStream(absolute)) as ReadableStream;
  return new Response(stream, {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Length": String(size),
      // Le nom d'origine est proposé au téléchargement : « contrat-2026.pdf »
      // se retrouve dans un dossier, pas un identifiant de trente caractères.
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
      "Cache-Control": "private, max-age=600",
    },
  });
}
