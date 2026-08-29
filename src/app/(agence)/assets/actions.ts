"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, assets, assetFolders } from "@/db";
import { requireStaff } from "@/lib/auth";
import { removeStored } from "@/lib/storage";

export async function updateAssetRights(formData: FormData): Promise<void> {
  await requireStaff();
  const id = String(formData.get("id") ?? "");
  const rights = String(formData.get("rights") ?? "");
  if (!id || !["illimites", "a_renouveler", "expires"].includes(rights)) return;
  await db
    .update(assets)
    .set({ rights: rights as "illimites" | "a_renouveler" | "expires" })
    .where(eq(assets.id, id));
  revalidatePath("/assets");
}

export async function deleteAsset(formData: FormData): Promise<void> {
  await requireStaff();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const rows = await db.select().from(assets).where(eq(assets.id, id)).limit(1);
  if (!rows[0]) return;
  // Le fichier part avant la ligne : l'inverse laisserait un média orphelin
  // sur le disque, invisible et impossible à retrouver.
  await removeStored(rows[0].storagePath);
  await db.delete(assets).where(eq(assets.id, id));
  revalidatePath("/assets");
}

/* ---------------------------------------------------------------- dossiers -- */

/**
 * Crée un dossier dans le dossier courant.
 *
 * Le parent est vérifié contre le client : un identifiant bricolé dans le
 * formulaire ne doit pas ranger un dossier chez quelqu'un d'autre.
 */
export async function createFolder(formData: FormData): Promise<void> {
  await requireStaff();
  const clientId = String(formData.get("clientId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const parentId = String(formData.get("parentId") ?? "") || null;
  if (!clientId || !name) return;

  if (parentId) {
    const [parent] = await db
      .select({ clientId: assetFolders.clientId })
      .from(assetFolders)
      .where(eq(assetFolders.id, parentId))
      .limit(1);
    if (!parent || parent.clientId !== clientId) return;
  }

  await db.insert(assetFolders).values({ clientId, name, parentId });
  revalidatePath("/assets");
}

export async function renameFolder(formData: FormData): Promise<void> {
  await requireStaff();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!id || !name) return;
  await db.update(assetFolders).set({ name }).where(eq(assetFolders.id, id));
  revalidatePath("/assets");
}

/**
 * Supprime un dossier sans rien perdre.
 *
 * Son contenu — médias et sous-dossiers — remonte d'un cran avant la
 * suppression. La clé étrangère est en cascade côté base : sans cette remontée,
 * un clic effacerait les photos de plusieurs jours de shooting.
 */
export async function deleteFolder(formData: FormData): Promise<void> {
  await requireStaff();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const [dossier] = await db
    .select()
    .from(assetFolders)
    .where(eq(assetFolders.id, id))
    .limit(1);
  if (!dossier) return;

  await db.update(assets).set({ folderId: dossier.parentId }).where(eq(assets.folderId, id));
  await db
    .update(assetFolders)
    .set({ parentId: dossier.parentId })
    .where(eq(assetFolders.parentId, id));
  await db.delete(assetFolders).where(eq(assetFolders.id, id));
  revalidatePath("/assets");
}

/** Range un média dans un dossier, ou le remet à la racine. */
export async function moveAsset(formData: FormData): Promise<void> {
  await requireStaff();
  const id = String(formData.get("id") ?? "");
  const folderId = String(formData.get("folderId") ?? "") || null;
  if (!id) return;

  const [media] = await db
    .select({ clientId: assets.clientId })
    .from(assets)
    .where(eq(assets.id, id))
    .limit(1);
  if (!media) return;

  if (folderId) {
    const [dossier] = await db
      .select({ clientId: assetFolders.clientId })
      .from(assetFolders)
      .where(eq(assetFolders.id, folderId))
      .limit(1);
    // Un dossier appartient à un client : y ranger le média d'un autre le
    // ferait disparaître de sa bibliothèque sans prévenir personne.
    if (!dossier || dossier.clientId !== media.clientId) return;
  }

  await db.update(assets).set({ folderId }).where(eq(assets.id, id));
  revalidatePath("/assets");
}
