"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db, timeEntries } from "@/db";
import { requireStaff } from "@/lib/auth";
import { polActif } from "@/lib/pole";
import { mondayOf } from "@/lib/ads";
import { parseDuration } from "@/lib/duration";

export type HoursFormState = { error?: string; ok?: string };

function refresh() {
  revalidatePath("/heures");
  revalidatePath("/rentabilite");
  revalidatePath("/rapports");
}

export async function saveHours(
  _prev: HoursFormState,
  formData: FormData,
): Promise<HoursFormState> {
  const user = await requireStaff();

  const clientId = String(formData.get("clientId") ?? "");
  if (!clientId) return { error: "Choisis un client." };

  const minutes = parseDuration(String(formData.get("duration") ?? ""));
  if (minutes === null) {
    return { error: "Durée non comprise. Écris par exemple 3, 3,5, 3h30 ou 45min." };
  }
  if (minutes <= 0) return { error: "Une durée doit être positive." };
  // Personne ne travaille 18 heures sur un seul client en une semaine sans
  // que ce soit une faute de frappe. Mieux vaut le demander maintenant.
  if (minutes > 60 * 60) return { error: "Plus de 60 heures sur une semaine : vérifie la saisie." };

  const raw = String(formData.get("weekStart") ?? "").trim();
  const weekStart = mondayOf(raw ? new Date(`${raw}T00:00:00`) : new Date());
  const activity = String(formData.get("activity") ?? "").trim();

  // L'heure est rattachée au pôle sous lequel on l'a saisie. C'est ce qui
  // permet à un client qui achète les deux prestations d'avoir deux marges
  // séparées, au lieu d'une intégration de site qui plombe son forfait social.
  const pole = await polActif(user);

  await db.insert(timeEntries).values({
    clientId,
    userId: user.id,
    weekStart,
    minutes,
    activity: activity || null,
    pole,
  });

  refresh();
  return { ok: `${(minutes / 60).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} h enregistrées.` };
}

export async function removeHours(formData: FormData): Promise<void> {
  const user = await requireStaff();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  // Chacun ne retire que ses propres heures : l'écran est partagé, l'historique
  // de quelqu'un d'autre ne s'efface pas depuis ici.
  await db.delete(timeEntries).where(and(eq(timeEntries.id, id), eq(timeEntries.userId, user.id)));
  refresh();
}
