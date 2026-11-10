"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { scheduleContent } from "@/lib/metricool-schedule";

export type ProgState = { ok?: string; error?: string };

/** Le bouton « Programmer dans Metricool » de la fiche contenu. */
export async function programmerMetricool(_prev: ProgState, formData: FormData): Promise<ProgState> {
  const user = await requireStaff();
  const id = String(formData.get("id") ?? "");
  const r = await scheduleContent(id, { userId: user.id });
  revalidatePath(`/contenu/${id}`);
  return r.ok ? { ok: r.message } : { error: r.error };
}
