import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { db, clientFiles } from "@/db";
import { requireUser } from "@/lib/auth";
import { storeDocument, UploadError } from "@/lib/storage";

/**
 * Envoi d'une pièce jointe de fiche client.
 *
 * Même mécanique que l'import de médias : un fichier par requête, reçu en
 * flux, hors du filtre global — dès qu'un proxy existe, Next recopie le corps
 * en mémoire et le tronque au-delà de dix mégaoctets, sans le signaler. La
 * route vérifie donc elle-même la session.
 */
export async function POST(request: Request) {
  const user = await requireUser();

  const url = new URL(request.url);
  const clientId = url.searchParams.get("clientId") ?? "";
  if (!clientId) return Response.json({ error: "Client manquant." }, { status: 400 });

  // Le portail dépose ici, lui aussi : un client peut envoyer ses fichiers,
  // mais uniquement dans son propre dossier.
  if (user.role === "client" && user.clientId !== clientId) {
    return Response.json({ error: "Non autorisé." }, { status: 403 });
  }

  const rawName = request.headers.get("x-filename") ?? "";
  let filename = "sans-nom";
  try {
    filename = decodeURIComponent(rawName) || "sans-nom";
  } catch {
    filename = rawName || "sans-nom";
  }

  const label = (() => {
    const raw = request.headers.get("x-label") ?? "";
    try {
      return decodeURIComponent(raw).trim() || null;
    } catch {
      return null;
    }
  })();

  /*
   * Qui verra ce document.
   *
   * Un dépôt du client est par nature partagé — il nous l'envoie. Un dépôt de
   * l'équipe est interne sauf demande explicite : le contrat signé et la
   * grille tarifaire vivent dans le même dossier que la maquette livrée, et
   * c'est le partage qui doit être un geste, pas la confidentialité.
   */
  const visibility =
    user.role === "client"
      ? "client"
      : (request.headers.get("x-visibility") ?? "") === "client"
        ? "client"
        : "interne";

  const mimeType = (request.headers.get("content-type") ?? "").split(";")[0].trim();
  const declared = Number(
    request.headers.get("x-filesize") ?? request.headers.get("content-length") ?? "",
  );

  if (!request.body) return Response.json({ error: "Fichier vide." }, { status: 400 });

  try {
    const stored = await storeDocument(
      {
        filename,
        mimeType,
        declaredBytes: Number.isFinite(declared) && declared > 0 ? declared : null,
        body: request.body as unknown as NodeReadableStream,
      },
      clientId,
    );

    const [row] = await db
      .insert(clientFiles)
      .values({
        clientId,
        filename,
        label,
        storagePath: stored.storagePath,
        mimeType: stored.mimeType,
        sizeBytes: stored.sizeBytes,
        visibility,
        uploadedById: user.id,
      })
      .returning({ id: clientFiles.id });

    return Response.json({ id: row.id, filename });
  } catch (error) {
    if (error instanceof UploadError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    console.error("[pilot] pièce jointe impossible", filename, error);
    const reason =
      error instanceof Error ? error.message.split("\n")[0].slice(0, 160) : String(error).slice(0, 160);
    return Response.json({ error: `Envoi impossible — ${reason}` }, { status: 500 });
  }
}
