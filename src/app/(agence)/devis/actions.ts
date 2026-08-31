"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, quoteRequests } from "@/db";
import { requireStaff } from "@/lib/auth";
import { DEVIS_STATUSES, type DevisStatus } from "@/data/devis";

/** Fait avancer une demande, et note ce qu'on en a fait. */
export async function majDevis(formData: FormData): Promise<void> {
  await requireStaff();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const statut = String(formData.get("status") ?? "");
  const note = String(formData.get("agencyNote") ?? "").trim();

  await db
    .update(quoteRequests)
    .set({
      // Une valeur inconnue laisse le statut tel quel : un formulaire bricolé
      // ne doit pas écrire n'importe quoi dans la colonne.
      ...(DEVIS_STATUSES.includes(statut as DevisStatus)
        ? { status: statut as DevisStatus }
        : {}),
      // La note n'est écrite que si le formulaire la portait : l'écran de
      // liste change le statut sans toucher à ce qui a été noté.
      ...(formData.has("agencyNote") ? { agencyNote: note || null } : {}),
      updatedAt: new Date(),
    })
    .where(eq(quoteRequests.id, id));

  revalidatePath("/devis");
  revalidatePath("/portail/devis");
}
