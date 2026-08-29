import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { eq, sql } from "drizzle-orm";
import { db, assets, assetFolders, assetUsages, contents } from "@/db";
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
  // Rattachement immédiat quand l'import part de la fiche d'un contenu :
  // importer puis retourner chercher le média dans une liste fait trois
  // écrans pour une seule intention.
  const contentId = url.searchParams.get("contentId") ?? "";
  // Le dossier de destination, choisi à l'import : ranger trente photos une à
  // une après coup, personne ne le fait — et la bibliothèque redevient le tas
  // qu'on voulait éviter.
  const askedFolder = url.searchParams.get("folderId") ?? "";

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
  // « x-filesize » d'abord : il vient du navigateur et traverse les relais
  // intacts, là où Content-Length peut être remplacé par un encodage par blocs.
  const declared = Number(
    request.headers.get("x-filesize") ?? request.headers.get("content-length") ?? "",
  );

  if (!request.body) {
    return Response.json({ error: "Fichier vide." }, { status: 400 });
  }

  // Le dossier est vérifié contre le client : un identifiant bricolé dans
  // l'adresse ne doit pas ranger un média chez quelqu'un d'autre.
  let folderId: string | null = null;
  if (askedFolder) {
    const [dossier] = await db
      .select({ clientId: assetFolders.clientId })
      .from(assetFolders)
      .where(eq(assetFolders.id, askedFolder))
      .limit(1);
    if (dossier && dossier.clientId === clientId) folderId = askedFolder;
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
        folderId,
        authorId: user.id,
      })
      .returning({ id: assets.id });

    if (contentId) {
      const [target] = await db
        .select({ clientId: contents.clientId })
        .from(contents)
        .where(eq(contents.id, contentId))
        .limit(1);
      // Un média appartient à une marque : le rattacher au contenu d'une
      // autre le ferait apparaître dans le mauvais portail client.
      if (target?.clientId === clientId) {
        const [last] = await db
          .select({ n: sql<number>`coalesce(max(${assetUsages.position}), -1)::int` })
          .from(assetUsages)
          .where(eq(assetUsages.contentId, contentId));
        await db
          .insert(assetUsages)
          .values({ contentId, assetId: row.id, position: (last?.n ?? -1) + 1 })
          .onConflictDoNothing();
      }
    }

    return Response.json({ id: row.id, filename, sizeBytes: stored.sizeBytes });
  } catch (error) {
    if (error instanceof UploadError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    console.error("[pilot] import impossible", filename, error);

    // Le motif technique est repris à l'écran, en une ligne. L'outil est
    // interne, et « Import impossible » sans rien d'autre oblige à aller
    // fouiller les journaux du serveur pour savoir quoi corriger.
    const reason =
      error instanceof Error ? error.message.split("\n")[0].slice(0, 160) : String(error).slice(0, 160);
    return Response.json(
      { error: `Import impossible — ${reason}` },
      { status: 500 },
    );
  }
}
