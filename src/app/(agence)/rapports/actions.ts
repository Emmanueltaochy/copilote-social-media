"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, contentStats } from "@/db";
import { requireStaff } from "@/lib/auth";

/**
 * Saisie des statistiques d'un contenu publié.
 *
 * Un champ vide n'est pas un zéro : une portée non relevée doit rester une
 * portée inconnue, sinon les moyennes du rapport sont tirées vers le bas par
 * des chiffres qui n'ont jamais été mesurés.
 */
function toIntOrNull(value: FormDataEntryValue | null): number | null {
  const s = String(value ?? "").replace(/\s/g, "").trim();
  if (!s) return null;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

export async function saveStats(formData: FormData): Promise<void> {
  const user = await requireStaff();
  const contentId = String(formData.get("contentId") ?? "");
  if (!contentId) return;

  const values = {
    reach: toIntOrNull(formData.get("reach")),
    engagement: toIntOrNull(formData.get("engagement")),
    clicks: toIntOrNull(formData.get("clicks")),
    saves: toIntOrNull(formData.get("saves")),
    capturedAt: new Date(),
    capturedById: user.id,
  };

  await db
    .insert(contentStats)
    .values({ contentId, ...values })
    .onConflictDoUpdate({ target: contentStats.contentId, set: values });

  revalidatePath("/rapports");
  revalidatePath(`/contenu/${contentId}`);
}

export async function clearStats(formData: FormData): Promise<void> {
  await requireStaff();
  const contentId = String(formData.get("contentId") ?? "");
  if (!contentId) return;
  await db.delete(contentStats).where(eq(contentStats.contentId, contentId));
  revalidatePath("/rapports");
}
