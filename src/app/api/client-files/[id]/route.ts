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
 * Ces fichiers sont contractuels : contrats, devis, chartes. Ils ne sont donc
 * accessibles qu'aux comptes internes — un contact client n'a pas à lire le
 * contrat d'une autre marque, ni le sien depuis son portail, où rien ne les
 * affiche.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user || user.role === "client") {
    return new Response("Non autorisé", { status: 403 });
  }

  const { id } = await params;
  const rows = await db.select().from(clientFiles).where(eq(clientFiles.id, id)).limit(1);
  const file = rows[0];
  if (!file) return new Response("Introuvable", { status: 404 });

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
