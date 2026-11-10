"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { clients, db } from "@/db";
import { requireDirection } from "@/lib/auth";
import { forgetMetricool, saveMetricoolConfig, syncMetricool, verifyToken } from "@/lib/metricool";

export type MetricoolState = { ok?: string; error?: string };

/** Enregistre la clé après l'avoir essayée : une clé fausse ne s'enregistre pas. */
export async function enregistrerMetricool(_prev: MetricoolState, formData: FormData): Promise<MetricoolState> {
  await requireDirection();
  const token = String(formData.get("token") ?? "").trim();
  if (token.length < 10) return { error: "Collez la clé d'API de votre compte Metricool." };
  try {
    const { userId, brands } = await verifyToken(token);
    await saveMetricoolConfig(token, userId);
    revalidatePath("/reglages");
    return { ok: `Clé valide : ${brands} marque${brands > 1 ? "s" : ""} trouvée${brands > 1 ? "s" : ""}. Reliez-les à vos clients ci-dessous.` };
  } catch (e) {
    return { error: `Metricool refuse cette clé. ${(e as Error).message}` };
  }
}

export async function oublierMetricool(): Promise<void> {
  await requireDirection();
  await forgetMetricool();
  revalidatePath("/reglages");
}

/** Relie un client à une marque Metricool (ou le délie avec une valeur vide). */
export async function relierMarque(formData: FormData): Promise<void> {
  await requireDirection();
  const clientId = String(formData.get("clientId") ?? "");
  // Le bouton « Relier à … » envoie sa valeur après celle de la liste.
  const brandId = formData.getAll("brandId").map((v) => String(v).trim()).filter(Boolean).pop() ?? "";
  if (!clientId) return;
  await db
    .update(clients)
    .set({ metricoolBrandId: brandId || null })
    .where(eq(clients.id, clientId));
  revalidatePath("/reglages");
}

export async function synchroniserMetricool(): Promise<MetricoolState> {
  await requireDirection();
  const r = await syncMetricool();
  revalidatePath("/");
  revalidatePath("/reglages");
  if (r.errors.length && !r.clients) return { error: r.errors.join(" · ") };
  return r.errors.length
    ? { ok: `${r.clients} client${r.clients > 1 ? "s" : ""} relevé${r.clients > 1 ? "s" : ""}, avec ${r.errors.length} souci${r.errors.length > 1 ? "s" : ""} (voir ci-dessous).` }
    : { ok: `${r.clients} client${r.clients > 1 ? "s" : ""} relevé${r.clients > 1 ? "s" : ""} : abonnés et publications à jour.` };
}
