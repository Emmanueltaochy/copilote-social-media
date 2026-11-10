"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { forgetInboxCache, sendReply } from "@/lib/metricool-inbox";

export type ReplyState = { ok?: string; error?: string };

/**
 * Répond à un message ou à un commentaire, via Metricool. Désactivé en
 * préversion : la réponse partirait pour de vrai chez une vraie personne.
 */
export async function repondre(_prev: ReplyState, formData: FormData): Promise<ReplyState> {
  await requireStaff();
  if (process.env.METRICOOL_DRAFT_ONLY === "1") return { error: "Préversion : les réponses sont désactivées (elles partiraient pour de vrai)." };
  const text = String(formData.get("text") ?? "").trim();
  if (!text) return { error: "Écrivez votre réponse." };
  const t = {
    kind: String(formData.get("kind")),
    provider: String(formData.get("provider")),
    brandId: String(formData.get("brandId")),
    id: String(formData.get("id")),
    recipient: (formData.get("recipient") as string) || null,
    objectId: (formData.get("objectId") as string) || null,
  };
  try {
    await sendReply(t, text);
  } catch (e) {
    return { error: (e as Error).message };
  }
  revalidatePath("/boite");
  return { ok: "Réponse envoyée." };
}

export async function actualiser(formData: FormData): Promise<void> {
  await requireStaff();
  for (const id of String(formData.get("brands") ?? "").split(",").filter(Boolean)) forgetInboxCache(id);
  revalidatePath("/boite");
}
