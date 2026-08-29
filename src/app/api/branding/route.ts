import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { eq } from "drizzle-orm";
import { db, settings } from "@/db";
import { requireDirection } from "@/lib/auth";
import { removeStored, storeBranding, UploadError } from "@/lib/storage";
import { revalidatePath } from "next/cache";

/**
 * Envoi du logo ou du visuel de connexion.
 *
 * Une route en flux comme pour les médias : une photo tirée d'un appareil pèse
 * volontiers plus que le plafond des actions serveur, et le dépassement s'y
 * solde par un écran blanc sans explication.
 *
 * Réservé à la direction : ces images sont la première chose que voit un
 * client, avant même de se connecter.
 */
export async function POST(request: Request) {
  await requireDirection();

  const kind = new URL(request.url).searchParams.get("kind") === "cover" ? "cover" : "logo";

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
    const storagePath = await storeBranding(
      {
        filename,
        mimeType: (request.headers.get("content-type") ?? "").split(";")[0].trim(),
        declaredBytes: Number.isFinite(declared) && declared > 0 ? declared : null,
        body: request.body as unknown as NodeReadableStream,
      },
      kind,
    );

    const [config] = await db.select().from(settings).where(eq(settings.id, "agence")).limit(1);
    const ancienne = kind === "cover" ? config?.coverPath : config?.logoPath;

    await db
      .insert(settings)
      .values({ id: "agence", ...(kind === "cover" ? { coverPath: storagePath } : { logoPath: storagePath }) })
      .onConflictDoUpdate({
        target: settings.id,
        set: {
          ...(kind === "cover" ? { coverPath: storagePath } : { logoPath: storagePath }),
          updatedAt: new Date(),
        },
      });

    // L'ancienne image ne part qu'une fois la nouvelle en base : dans l'autre
    // ordre, une panne au milieu laisserait la page de connexion sans visuel
    // et le fichier déjà supprimé.
    if (ancienne) await removeStored(ancienne).catch(() => {});

    revalidatePath("/reglages");
    revalidatePath("/connexion");
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof UploadError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    console.error("[pilot] image de marque", error);
    return Response.json({ error: "Enregistrement impossible." }, { status: 500 });
  }
}

/** Retire le logo ou le visuel : on revient au dégradé et au nom écrit. */
export async function DELETE(request: Request) {
  await requireDirection();
  const kind = new URL(request.url).searchParams.get("kind") === "cover" ? "cover" : "logo";

  const [config] = await db.select().from(settings).where(eq(settings.id, "agence")).limit(1);
  const ancienne = kind === "cover" ? config?.coverPath : config?.logoPath;

  await db
    .update(settings)
    .set({ ...(kind === "cover" ? { coverPath: null } : { logoPath: null }), updatedAt: new Date() })
    .where(eq(settings.id, "agence"));
  if (ancienne) await removeStored(ancienne).catch(() => {});

  revalidatePath("/reglages");
  revalidatePath("/connexion");
  return Response.json({ ok: true });
}
