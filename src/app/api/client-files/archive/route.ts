import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { PassThrough, Readable } from "node:stream";
import archiver from "archiver";
import { asc, eq } from "drizzle-orm";
import { db, clientFiles, clients } from "@/db";
import { currentUser } from "@/lib/auth";
import { absolutePath } from "@/lib/storage";

/**
 * Toutes les pièces jointes d'un client, en une archive ZIP.
 *
 * Réservé à l'agence : le dossier mêle documents partagés et documents
 * internes, et l'archive les prend tous.
 *
 * L'archive est fabriquée en flux, pendant le téléchargement : rien n'est
 * écrit sur le disque ni gardé en mémoire, si bien que trois vidéos de deux
 * gigaoctets ne coûtent pas six gigaoctets au serveur. Les fichiers y sont
 * rangés sans compression — photos, vidéos et PDF le sont déjà, et les
 * recompresser ferait travailler le processeur pour gagner quelques pour cent.
 */
export async function GET(request: Request) {
  const user = await currentUser();
  if (!user) return new Response("Non autorisé", { status: 401 });
  if (user.role === "client") return new Response("Non autorisé", { status: 403 });

  const clientId = new URL(request.url).searchParams.get("clientId") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(clientId)) return new Response("Client inconnu", { status: 400 });

  const [client] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
  if (!client) return new Response("Client introuvable", { status: 404 });

  const files = await db
    .select()
    .from(clientFiles)
    .where(eq(clientFiles.clientId, clientId))
    .orderBy(asc(clientFiles.createdAt));

  // Les fichiers absents du disque sont écartés avant d'ouvrir l'archive :
  // une fois le flux commencé, une erreur ne peut plus devenir une réponse
  // propre, seulement un téléchargement coupé.
  const presents: { absolute: string; filename: string }[] = [];
  for (const f of files) {
    try {
      const absolute = absolutePath(f.storagePath);
      await stat(absolute);
      presents.push({ absolute, filename: f.filename });
    } catch {
      // ignoré : le fichier n'est plus sur le disque
    }
  }
  if (presents.length === 0) return new Response("Aucun fichier à télécharger", { status: 404 });

  const zip = archiver("zip", { store: true });
  const sortie = new PassThrough();
  zip.on("error", (error) => sortie.destroy(error));
  zip.pipe(sortie);

  // Deux fichiers peuvent porter le même nom — deux « photo.jpg » envoyées à
  // un mois d'écart. Dans une archive, le second écraserait le premier à
  // l'extraction : il prend un numéro.
  const pris = new Set<string>();
  for (const f of presents) {
    const nom = nomLibre(f.filename.replace(/[\\/]/g, "_") || "fichier", pris);
    zip.append(createReadStream(f.absolute), { name: nom });
  }
  void zip.finalize();

  const nomArchive = `${client.shortName || client.name || "client"} - fichiers.zip`;
  return new Response(Readable.toWeb(sortie) as ReadableStream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(nomArchive)}`,
      "Cache-Control": "no-store",
    },
  });
}

function nomLibre(nom: string, pris: Set<string>): string {
  const cle = (n: string) => n.toLowerCase();
  if (!pris.has(cle(nom))) {
    pris.add(cle(nom));
    return nom;
  }
  const point = nom.lastIndexOf(".");
  const base = point > 0 ? nom.slice(0, point) : nom;
  const ext = point > 0 ? nom.slice(point) : "";
  for (let i = 2; ; i += 1) {
    const candidat = `${base} (${i})${ext}`;
    if (!pris.has(cle(candidat))) {
      pris.add(cle(candidat));
      return candidat;
    }
  }
}
