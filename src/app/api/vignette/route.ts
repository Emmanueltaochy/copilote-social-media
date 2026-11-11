import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { currentUser } from "@/lib/auth";
import { MEDIA_ROOT } from "@/lib/storage";

/**
 * Miniature d'une publication suivie en veille, gardée sur notre serveur.
 *
 * Les adresses d'images d'Instagram et de Facebook sont signées et expirent au bout de quelques jours :
 * une miniature vue aujourd'hui serait un carré vide la semaine prochaine. À la première visite (adresse
 * encore valide), l'image est copiée ici ; ensuite, elle vient de notre disque, pour toujours.
 * Seuls les serveurs d'images des réseaux sont acceptés, et seulement pour une personne connectée.
 */
const HOTES = /(^|\.)(cdninstagram\.com|fbcdn\.net|ytimg\.com|ggpht\.com|googleusercontent\.com|metricool\.com)$/i;
const MAX = 6 * 1024 * 1024;

export async function GET(request: Request) {
  if (!(await currentUser())) return new Response("Non autorisé", { status: 401 });
  const u = new URL(request.url).searchParams.get("u") ?? "";
  let cible: URL;
  try {
    cible = new URL(u);
  } catch {
    return new Response("Adresse invalide", { status: 400 });
  }
  if (cible.protocol !== "https:" || !HOTES.test(cible.hostname)) return new Response("Hôte refusé", { status: 400 });

  // Clé du cache : l'adresse sans ses paramètres de signature (ils changent, l'image non)
  const cle = createHash("sha1").update(cible.hostname + cible.pathname).digest("hex");
  const dir = path.join(MEDIA_ROOT, "veille-vignettes");
  const fichier = path.join(dir, `${cle}.img`);
  const entetes = (type: string) => ({ "Content-Type": type, "Cache-Control": "private, max-age=2592000, immutable" });

  try {
    const buf = await readFile(fichier);
    const type = (await readFile(`${fichier}.type`, "utf8").catch(() => "image/jpeg")).trim();
    return new Response(new Uint8Array(buf), { headers: entetes(type) });
  } catch {}

  let res: Response;
  try {
    res = await fetch(cible, { signal: AbortSignal.timeout(12_000), headers: { Accept: "image/*" }, redirect: "follow" });
  } catch {
    return new Response("Image injoignable", { status: 404 });
  }
  const type = res.headers.get("content-type") ?? "";
  if (!res.ok || !type.startsWith("image/")) return new Response("Image expirée", { status: 404 });
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX) return new Response("Image trop lourde", { status: 404 });
  try {
    await mkdir(dir, { recursive: true });
    await writeFile(fichier, buf);
    await writeFile(`${fichier}.type`, type);
  } catch {}
  return new Response(new Uint8Array(buf), { headers: entetes(type) });
}
