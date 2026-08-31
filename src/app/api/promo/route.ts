import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, promos } from "@/db";
import { currentDirection } from "@/lib/auth";
import { removeStored, storePromoImage, UploadError } from "@/lib/storage";

/**
 * Le visuel d'une bannière, envoyé en flux.
 *
 * Même raison que partout ailleurs : une image exportée d'un outil de
 * création dépasse volontiers le plafond des actions serveur, et le
 * dépassement s'y solde par un écran blanc sans explication.
 */
export async function POST(request: Request) {
  if (!(await currentDirection())) {
    return Response.json({ error: "Non autorisé." }, { status: 403 });
  }

  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!id) return Response.json({ error: "Bannière manquante." }, { status: 400 });

  const [banniere] = await db.select().from(promos).where(eq(promos.id, id)).limit(1);
  if (!banniere) return Response.json({ error: "Bannière introuvable." }, { status: 404 });

  const rawName = request.headers.get("x-filename") ?? "";
  let filename = "image";
  try {
    filename = decodeURIComponent(rawName) || "image";
  } catch {
    filename = rawName || "image";
  }

  const declared = Number(
    request.headers.get("x-filesize") ?? request.headers.get("content-length") ?? "",
  );
  if (!request.body) return Response.json({ error: "Fichier vide." }, { status: 400 });

  try {
    const storagePath = await storePromoImage({
      filename,
      mimeType: (request.headers.get("content-type") ?? "").split(";")[0].trim(),
      declaredBytes: Number.isFinite(declared) && declared > 0 ? declared : null,
      body: request.body as unknown as NodeReadableStream,
    });

    await db.update(promos).set({ imagePath: storagePath }).where(eq(promos.id, id));
    // L'ancien visuel ne part qu'une fois le nouveau en base : dans l'autre
    // ordre, une panne au milieu laisserait la bannière sans image.
    if (banniere.imagePath) await removeStored(banniere.imagePath).catch(() => {});

    revalidatePath("/reglages");
    revalidatePath("/portail");
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof UploadError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    console.error("[pilot] visuel de bannière", error);
    return Response.json({ error: "Enregistrement impossible." }, { status: 500 });
  }
}
