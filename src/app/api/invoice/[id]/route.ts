import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { eq } from "drizzle-orm";
import { db, invoices } from "@/db";
import { currentUser } from "@/lib/auth";
import { absolutePath } from "@/lib/storage";

/**
 * Sert une facture après contrôle d'accès.
 *
 * Une facture est faite pour être téléchargée par son client — c'est sa
 * raison d'être, sa comptabilité en dépend. Mais par le sien seulement :
 * l'appartenance est vérifiée sur la facture, jamais sur un paramètre.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return new Response("Non autorisé", { status: 401 });

  const { id } = await params;
  const [facture] = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1);
  if (!facture) return new Response("Introuvable", { status: 404 });

  if (user.role === "client" && user.clientId !== facture.clientId) {
    return new Response("Non autorisé", { status: 403 });
  }

  let absolute: string;
  let size: number;
  try {
    absolute = absolutePath(facture.storagePath);
    size = (await stat(absolute)).size;
  } catch {
    return new Response("Fichier absent du disque", { status: 404 });
  }

  const stream = Readable.toWeb(createReadStream(absolute)) as ReadableStream;
  return new Response(stream, {
    headers: {
      "Content-Type": facture.mimeType,
      "Content-Length": String(size),
      // « attachment » et non « inline » : une facture se range dans un
      // dossier, elle ne se lit pas dans un onglet. Le nom proposé porte le
      // numéro, qui est ce qu'un comptable cherche.
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(
        `facture-${facture.number}.pdf`.replace(/[\\/]/g, "-"),
      )}`,
      "Cache-Control": "private, max-age=600",
    },
  });
}
