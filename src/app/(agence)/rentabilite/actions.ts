"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db, hourlyRates } from "@/db";
import { requireDirection } from "@/lib/auth";

/**
 * Fixe le coût horaire d'une personne.
 *
 * Le tarif est historisé plutôt que remplacé : une augmentation ne doit pas
 * réécrire la marge des mois déjà clos. Un tarif posé le même jour remplace
 * le précédent — c'est une correction de saisie, pas un changement de tarif.
 */
export async function setRate(formData: FormData): Promise<void> {
  await requireDirection();

  const userId = String(formData.get("userId") ?? "");
  if (!userId) return;

  const value = Number(String(formData.get("rate") ?? "0").replace(",", ".").trim() || "0");
  if (!Number.isFinite(value) || value < 0) return;
  const costPerHourCents = Math.round(value * 100);

  const raw = String(formData.get("effectiveFrom") ?? "").trim();
  const effectiveFrom = raw || new Date().toISOString().slice(0, 10);

  const existing = await db
    .select({ id: hourlyRates.id })
    .from(hourlyRates)
    .where(and(eq(hourlyRates.userId, userId), eq(hourlyRates.effectiveFrom, effectiveFrom)))
    .limit(1);

  if (existing[0]) {
    await db
      .update(hourlyRates)
      .set({ costPerHourCents })
      .where(eq(hourlyRates.id, existing[0].id));
  } else {
    await db.insert(hourlyRates).values({ userId, costPerHourCents, effectiveFrom });
  }

  revalidatePath("/rentabilite");
  revalidatePath("/rapports");
}
