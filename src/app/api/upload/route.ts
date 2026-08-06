import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { db, assets } from "@/db";
import { requireStaff } from "@/lib/auth";
import { storeIncoming, UploadError } from "@/lib/storage";

/**
 * Import d'un média, un fichier par requête.
 *
 * Les actions serveur de Next reconstituent tout le corps de la requête en
 * mémoire avant de l'exécuter, et plafonnent sa taille : trente photos de
 * photographe envoyées ensemble dépassaient la limite et faisaient tomber la
 * page sans rien dire. Une route dédiée reçoit le fichier en flux et l'écrit
 * directement sur le disque, quelle que soit sa taille.
 *
 * Un fichier par requête, aussi : la mémoire reste bornée quel que soit le
 * nombre de fichiers, l'écran peut montrer où en est l'envoi, et un fichier
 * refusé n'emporte pas les trente autres.
 *
 * Le corps est le fichier brut, sans enveloppe multipart — inutile d'analyser
 * un format d'encodage quand il n'y a qu'une chose à transmettre.
 */
export async function POST(request: Request) {
  const user = await requireStaff();

  const url = new URL(request.url);
  const clientId = url.searchParams.get("clientId") ?? "";
  if (!clientId) {
    return Response.json({ error: "Client manquant." }, { status: 400 });
  }

  // Le nom de fichier voyage encodé : il contient volontiers des accents et
  // des espaces, qu'un en-tête HTTP ne transporte pas tels quels.
  const rawName = request.headers.get("x-filename") ?? "";
  let filename = "sans-nom";
  try {
    filename = decodeURIComponent(rawName) || "sans-nom";
  } catch {
    filename = rawName || "sans-nom";
  }

  const mimeType = (request.headers.get("content-type") ?? "").split(";")[0].trim();
  const declared = Number(request.headers.get("content-length") ?? "");

  if (!request.body) {
    return Response.json({ error: "Fichier vide." }, { status: 400 });
  }

  try {
    const stored = await storeIncoming(
      {
        filename,
        mimeType,
        declaredBytes: Number.isFinite(declared) && declared > 0 ? declared : null,
        body: request.body as unknown as NodeReadableStream,
      },
      clientId,
    );

    const [row] = await db
      .insert(assets)
      .values({
        clientId,
        filename,
        storagePath: stored.storagePath,
        mimeType: stored.mimeType,
        sizeBytes: stored.sizeBytes,
        width: stored.width,
        height: stored.height,
        authorId: user.id,
      })
      .returning({ id: assets.id });

    return Response.json({ id: row.id, filename, sizeBytes: stored.sizeBytes });
  } catch (error) {
    if (error instanceof UploadError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    // Le détail part dans les journaux du serveur, pas dans la réponse :
    // un chemin de fichier ou un message de bibliothèque n'aide personne ici.
    console.error("[pilot] import impossible", error);
    return Response.json(
      { error: "Import impossible. Réessaie, ou signale le fichier concerné." },
      { status: 500 },
    );
  }
}
