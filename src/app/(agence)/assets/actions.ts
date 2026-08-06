"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, assets } from "@/db";
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
