"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { and, eq, isNull, sql } from "drizzle-orm";
import { apiKeys, db } from "@/db";
import { API_KEY_PREFIX } from "@/lib/api-auth";
import { requireDirection } from "@/lib/auth";
import { hashToken } from "@/lib/tokens";

export type CleImportState = { jeton?: string; error?: string };

/**
 * Crée une clé d'import de l'annuaire et montre son jeton, une seule fois.
 *
 * La clé ne porte que le droit « annuaire:write » : elle importe les fichiers
 * de l'agent ventes et ne lit rien d'autre. Seule son empreinte est gardée.
 */
export async function creerCleImport(_prev: CleImportState, formData: FormData): Promise<CleImportState> {
  const user = await requireDirection();
  const nom = String(formData.get("nom") ?? "").trim() || "Import des prospects (agent ventes)";
  if (nom.length > 120) return { error: "Nom trop long." };
  const jeton = API_KEY_PREFIX + randomBytes(32).toString("base64url");
  await db.insert(apiKeys).values({
    name: nom,
    tokenHash: hashToken(jeton),
    prefix: jeton.slice(0, 12),
    scopes: ["annuaire:write"],
    // Le périmètre par pôle ne sert pas à l'import ; il est renseigné pour
    // qu'une clé sans pôle ne soit jamais créée (voir perimetreDeLaCle).
    departments: ["social", "web"],
    createdById: user.id,
  });
  revalidatePath("/reglages");
  return { jeton };
}

/** Révoque une clé d'import : elle cesse d'ouvrir la porte immédiatement. */
export async function revoquerCleImport(formData: FormData): Promise<void> {
  await requireDirection();
  const id = String(formData.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  await db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiKeys.id, id), isNull(apiKeys.revokedAt), sql`${apiKeys.scopes} ? 'annuaire:write'`));
  revalidatePath("/reglages");
}
