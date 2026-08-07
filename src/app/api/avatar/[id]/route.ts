import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { eq } from "drizzle-orm";
import { db, users } from "@/db";
import { currentUser } from "@/lib/auth";
import { absolutePath } from "@/lib/storage";

/**
 * Sert la photo de profil de quelqu'un.
 *
 * Comme les médias, elle passe par un contrôle de session : une photo de
 * l'équipe n'a pas à être récupérable par qui devine une adresse. Le cache est
 * privé et court — le nom du fichier change à chaque nouvelle photo, donc rien
 * ne périme vraiment, mais un cache partagé resservirait le visage de l'un à
 * la place de l'autre.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await currentUser();
  if (!viewer) return new Response("Non autorisé", { status: 401 });

  const { id } = await params;
  const [row] = await db
    .select({ avatarPath: users.avatarPath })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  if (!row?.avatarPath) return new Response("Sans photo", { status: 404 });

  let file: string;
  let size: number;
  try {
    file = absolutePath(row.avatarPath);
    size = (await stat(file)).size;
  } catch {
    return new Response("Fichier absent du disque", { status: 404 });
  }

  const stream = Readable.toWeb(createReadStream(file)) as ReadableStream;
  return new Response(stream, {
    headers: {
      "Content-Type": "image/webp",
      "Content-Length": String(size),
      "Cache-Control": "private, max-age=3600",
    },
  });
}
