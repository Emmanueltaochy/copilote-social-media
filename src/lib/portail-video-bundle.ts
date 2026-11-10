import { copyFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db, integrations, settings } from "@/db";
import { MEDIA_ROOT } from "@/lib/storage";

/**
 * La vidéo de bienvenue livrée avec l'application.
 *
 * Au démarrage, si cette version n'a jamais été installée, elle est copiée
 * dans le stockage et devient la vidéo du portail — exactement comme si la
 * direction l'avait envoyée depuis Réglages. Une seule fois par version : une
 * vidéo envoyée ensuite à la main n'est jamais écrasée.
 */
const BUNDLE = { version: "bienvenue-v2", file: "assets/portail/bienvenue-v2.mp4" };
const MARKER = "portal-video-bundle";

export async function installBundledPortalVideo(): Promise<void> {
  const source = path.resolve(BUNDLE.file);
  try {
    await stat(source);
  } catch {
    return; // pas de vidéo dans cette image : rien à faire
  }
  const [done] = await db.select().from(integrations).where(eq(integrations.id, MARKER)).limit(1);
  if (done?.token === BUNDLE.version) return;

  const relative = path.join("marque", `${BUNDLE.version}-${Date.now().toString(36)}.mp4`);
  await mkdir(path.join(MEDIA_ROOT, "marque"), { recursive: true });
  await copyFile(source, path.join(MEDIA_ROOT, relative));

  await db
    .insert(settings)
    .values({ id: "agence", portalVideoPath: relative })
    .onConflictDoUpdate({ target: settings.id, set: { portalVideoPath: relative } });
  await db
    .insert(integrations)
    .values({ id: MARKER, token: BUNDLE.version, updatedAt: new Date() })
    .onConflictDoUpdate({ target: integrations.id, set: { token: BUNDLE.version, updatedAt: new Date() } });
  console.log(`[pilot] vidéo du portail installée : ${BUNDLE.version}`);
}
