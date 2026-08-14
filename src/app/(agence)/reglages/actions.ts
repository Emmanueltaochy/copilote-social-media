"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, settings } from "@/db";
import { requireDirection } from "@/lib/auth";

export type ReglagesState = { ok?: string; error?: string };

/** Une couleur hexadécimale, ou rien. On refuse plutôt que d'écrire n'importe quoi. */
function couleur(valeur: string, defaut: string): string {
  const v = valeur.trim();
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v : defaut;
}

/**
 * Les réglages de l'agence.
 *
 * Réservés à la direction : ils changent ce que voient tous les clients, et
 * une couleur mal choisie se remarque sur vingt portails à la fois.
 */
export async function majReglages(
  _prev: ReglagesState,
  formData: FormData,
): Promise<ReglagesState> {
  await requireDirection();

  const nom = String(formData.get("agencyName") ?? "").trim();
  if (nom.length < 2) return { error: "Le nom de l'agence est obligatoire." };

  await db
    .update(settings)
    .set({
      agencyName: nom,
      primaryColor: couleur(String(formData.get("primaryColor") ?? ""), "#B08D3F"),
      darkColor: couleur(String(formData.get("darkColor") ?? ""), "#121212"),
      portalWelcome: String(formData.get("portalWelcome") ?? "").trim() || null,
      updatedAt: new Date(),
    })
    .where(eq(settings.id, "agence"));

  revalidatePath("/reglages");
  revalidatePath("/portail");
  return { ok: "Réglages enregistrés. Les portails clients les reprennent immédiatement." };
}
