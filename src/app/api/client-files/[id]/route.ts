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
 * Le dossier d'un client est en partie partagé avec lui : depuis son portail il
 * y dépose ses fichiers et relit ceux qu'on lui a explicitement laissés. Il
 * n'accède qu'au sien, et seulement aux documents marqués partagés —
 * l'appartenance comme la visibilité se vérifient sur le fichier, jamais sur
 * un paramètre.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return new Response("Non autorisé", { status: 401 });

  const { id } = await params;
  const rows = await db.select().from(clientFiles).where(eq(clientFiles.id, id)).limit(1);
  const file = rows[0];
  if (!file) return new Response("Introuvable", { status: 404 });

  if (user.role === "client") {
    // Deux conditions, et non une : le dossier d'un client contient aussi ce
    // que l'agence garde pour elle — contrat, grille tarifaire, notes de
    // rentabilité. Une adresse se devine, la visibilité se vérifie ici.
    if (user.clientId !== file.clientId || file.visibility !== "client") {
      return new Response("Non autorisé", { status: 403 });
    }
  }

  let size: number;
  let absolute: string;
  try {
    absolute = absolutePath(file.storagePath);
    size = (await stat(absolute)).size;
  } catch {
    return new Response("Fichier absent du disque", { status: 404 });
  }

  // « ?telecharger » : le navigateur enregistre le fichier au lieu de l'ouvrir
  // dans un onglet. Sans cela, une photo s'affiche et il faut encore faire
  // « enregistrer sous » — un geste de trop, multiplié par le nombre de photos.
  const telecharger = new URL(request.url).searchParams.has("telecharger");

  const stream = Readable.toWeb(createReadStream(absolute)) as ReadableStream;
  return new Response(stream, {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Length": String(size),
      // Le nom d'origine est proposé au téléchargement : « contrat-2026.pdf »
      // se retrouve dans un dossier, pas un identifiant de trente caractères.
      // Les deux formes : `filename*` porte les accents, `filename` sert de
      // repli aux navigateurs qui ne lisent que lui.
      "Content-Disposition": `${telecharger ? "attachment" : "inline"}; filename="${asciiName(file.filename)}"; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
      "Cache-Control": "private, max-age=600",
    },
  });
}

/** Le nom sans accents ni guillemets, pour la forme `filename` historique. */
const asciiName = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7e]|["\\]/g, "_");
