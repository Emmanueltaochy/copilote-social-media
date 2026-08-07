"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { db, notifications } from "@/db";
import { requireUser } from "@/lib/auth";

/**
 * Marque une notification comme lue.
 *
 * Chacun ne touche que les siennes : la condition sur le destinataire est
 * dans la requête et non dans un contrôle préalable, pour qu'aucun chemin
 * d'appel ne puisse l'oublier.
 */
export async function markRead(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.id, id), eq(notifications.userId, user.id)));

  revalidatePath("/", "layout");
}

export async function markAllRead(): Promise<void> {
  const user = await requireUser();
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, user.id), isNull(notifications.readAt)));
  revalidatePath("/", "layout");
}
