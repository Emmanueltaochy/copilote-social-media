import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { eq } from "drizzle-orm";
import { db, users } from "@/db";
import { requireUser } from "@/lib/auth";
import { removeStored, storeAvatar, UploadError } from "@/lib/storage";

/**
 * Envoi de sa propre photo de profil.
 *
 * Une route en flux plutôt qu'une action serveur, pour la même raison que les
 * médias : une photo prise au téléphone pèse volontiers plus que le plafond
 * des actions serveur, et le dépassement s'y solde par un écran blanc sans
 * explication.
 *
 * Chacun ne touche qu'à la sienne : l'identité vient de la session, jamais
 * d'un paramètre de la requête.
 */
export async function POST(request: Request) {
  const user = await requireUser();

  const rawName = request.headers.get("x-filename") ?? "";
  let filename = "photo";
  try {
    filename = decodeURIComponent(rawName) || "photo";
  } catch {
    filename = rawName || "photo";
  }

  const declared = Number(
    request.headers.get("x-filesize") ?? request.headers.get("content-length") ?? "",
  );

  if (!request.body) return Response.json({ error: "Fichier vide." }, { status: 400 });

  try {
    const storagePath = await storeAvatar(
      {
        filename,
        mimeType: (request.headers.get("content-type") ?? "").split(";")[0].trim(),
        declaredBytes: Number.isFinite(declared) && declared > 0 ? declared : null,
        body: request.body as unknown as NodeReadableStream,
      },
      user.id,
    );

    const ancienne = user.avatarPath;
    await db.update(users).set({ avatarPath: storagePath }).where(eq(users.id, user.id));
    // L'ancienne photo n'est effacée qu'une fois la nouvelle en base : dans
    // l'autre ordre, une panne au milieu laisserait un compte sans photo et le
    // fichier déjà supprimé.
    if (ancienne) await removeStored(ancienne).catch(() => {});

    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof UploadError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    console.error("[pilot] photo de profil", error);
    return Response.json({ error: "Enregistrement impossible." }, { status: 500 });
  }
}
