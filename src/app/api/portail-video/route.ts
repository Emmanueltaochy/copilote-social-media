import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, settings } from "@/db";
import { currentDirection, currentUser } from "@/lib/auth";
import {
  absolutePath,
  portalVideoMime,
  removeStored,
  storePortalVideo,
  UploadError,
} from "@/lib/storage";

async function cheminActuel(): Promise<string | null> {
  const [config] = await db.select().from(settings).where(eq(settings.id, "agence")).limit(1);
  return config?.portalVideoPath ?? null;
}

/**
 * Sert la vidéo d'accueil du portail, à toute personne connectée.
 *
 * Avec prise en charge des plages d'octets (`Range`) : Safari, donc tous les
 * iPhone, refuse de lire une vidéo servie d'un bloc, et aucun navigateur ne
 * permet sans elles d'avancer dans la vidéo avant qu'elle soit chargée en
 * entier.
 */
export async function GET(request: Request) {
  if (!(await currentUser())) return new Response("Non autorisé", { status: 401 });

  const storagePath = await cheminActuel();
  if (!storagePath) return new Response("Aucune vidéo", { status: 404 });

  let absolute: string;
  let size: number;
  try {
    absolute = absolutePath(storagePath);
    size = (await stat(absolute)).size;
  } catch {
    return new Response("Fichier absent du disque", { status: 404 });
  }

  const commun = {
    "Content-Type": portalVideoMime(storagePath),
    "Accept-Ranges": "bytes",
    // Le nom du fichier change à chaque envoi : l'adresse porte la version
    // côté page, le cache peut donc être long.
    "Cache-Control": "private, max-age=3600",
  };

  const plage = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("range") ?? "");
  if (plage && (plage[1] || plage[2])) {
    let debut: number;
    let fin: number;
    if (plage[1]) {
      debut = Number(plage[1]);
      fin = plage[2] ? Math.min(Number(plage[2]), size - 1) : size - 1;
    } else {
      // « bytes=-500 » : les 500 derniers octets.
      debut = Math.max(0, size - Number(plage[2]));
      fin = size - 1;
    }
    if (debut > fin || debut >= size) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    }
    const flux = Readable.toWeb(createReadStream(absolute, { start: debut, end: fin })) as ReadableStream;
    return new Response(flux, {
      status: 206,
      headers: {
        ...commun,
        "Content-Length": String(fin - debut + 1),
        "Content-Range": `bytes ${debut}-${fin}/${size}`,
      },
    });
  }

  const flux = Readable.toWeb(createReadStream(absolute)) as ReadableStream;
  return new Response(flux, { headers: { ...commun, "Content-Length": String(size) } });
}

/**
 * Envoi de la vidéo d'accueil, réservé à la direction.
 *
 * En flux, hors du proxy : une vidéo dépasse de loin le plafond des actions
 * serveur et celui que le proxy impose aux corps de requête.
 */
export async function POST(request: Request) {
  if (!(await currentDirection())) {
    return Response.json({ error: "Non autorisé." }, { status: 403 });
  }
  if (!request.body) return Response.json({ error: "Fichier vide." }, { status: 400 });

  const rawName = request.headers.get("x-filename") ?? "";
  let filename = "video";
  try {
    filename = decodeURIComponent(rawName) || "video";
  } catch {
    filename = rawName || "video";
  }
  const declared = Number(
    request.headers.get("x-filesize") ?? request.headers.get("content-length") ?? "",
  );

  try {
    const storagePath = await storePortalVideo({
      filename,
      mimeType: (request.headers.get("content-type") ?? "").split(";")[0].trim(),
      declaredBytes: Number.isFinite(declared) && declared > 0 ? declared : null,
      body: request.body as unknown as NodeReadableStream,
    });

    const ancienne = await cheminActuel();
    await db
      .insert(settings)
      .values({ id: "agence", portalVideoPath: storagePath })
      .onConflictDoUpdate({
        target: settings.id,
        set: { portalVideoPath: storagePath, updatedAt: new Date() },
      });
    // L'ancienne vidéo ne part qu'une fois la nouvelle en base.
    if (ancienne) await removeStored(ancienne).catch(() => {});

    revalidatePath("/reglages");
    revalidatePath("/portail");
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof UploadError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    console.error("[pilot] vidéo du portail", error);
    return Response.json({ error: "Enregistrement impossible." }, { status: 500 });
  }
}

/** Retire la vidéo : l'accueil du portail redevient ce qu'il était. */
export async function DELETE() {
  if (!(await currentDirection())) {
    return Response.json({ error: "Non autorisé." }, { status: 403 });
  }
  const ancienne = await cheminActuel();
  await db
    .update(settings)
    .set({ portalVideoPath: null, updatedAt: new Date() })
    .where(eq(settings.id, "agence"));
  if (ancienne) await removeStored(ancienne).catch(() => {});

  revalidatePath("/reglages");
  revalidatePath("/portail");
  return Response.json({ ok: true });
}
