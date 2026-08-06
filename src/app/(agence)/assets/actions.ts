"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, assets } from "@/db";
import { requireStaff } from "@/lib/auth";
import { removeStored, storeUpload, UploadError } from "@/lib/storage";

export type AssetFormState = { error?: string; ok?: string };

export async function uploadAssets(
  _prev: AssetFormState,
  formData: FormData,
): Promise<AssetFormState> {
  const user = await requireStaff();

  const clientId = String(formData.get("clientId") ?? "");
  if (!clientId) return { error: "Choisis un client." };

  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { error: "Aucun fichier sélectionné." };

  let stored = 0;
  for (const file of files) {
    try {
      const result = await storeUpload(file, clientId);
      await db.insert(assets).values({
        clientId,
        filename: file.name,
        storagePath: result.storagePath,
        mimeType: result.mimeType,
        sizeBytes: result.sizeBytes,
        width: result.width,
        height: result.height,
        authorId: user.id,
      });
      stored += 1;
    } catch (error) {
      // On s'arrête au premier refus plutôt que d'importer à moitié en
      // silence : mieux vaut un message clair qu'une bibliothèque incomplète.
      const message =
        error instanceof UploadError
          ? error.message
          : "Import impossible. Réessaie, ou envoie un fichier plus léger.";
      revalidatePath("/assets");
      return stored > 0 ? { error: `${stored} média(s) importé(s), puis : ${message}` } : { error: message };
    }
  }

  revalidatePath("/assets");
  return { ok: `${stored} média${stored > 1 ? "s importés" : " importé"}.` };
}

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
