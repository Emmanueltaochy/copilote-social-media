"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { genererLeMois, moisDepuis, planDuMois } from "@/lib/plan";
import { db, clients } from "@/db";
import { eq } from "drizzle-orm";

export type PreparerState = { ok?: string; error?: string };

function options(formData: FormData) {
  const heure = Number(formData.get("heure") ?? 11);
  return {
    joursOuvres: formData.get("joursOuvres") !== "non",
    heure: Number.isFinite(heure) && heure >= 0 && heure <= 23 ? Math.floor(heure) : 11,
  };
}

/** Prépare le mois d'un client : ne crée que ce qui manque. */
export async function preparerUnClient(
  _prev: PreparerState,
  formData: FormData,
): Promise<PreparerState> {
  const user = await requireStaff();
  const clientId = String(formData.get("clientId") ?? "");
  const mois = moisDepuis(String(formData.get("mois") ?? ""));
  if (!clientId) return { error: "Client manquant." };

  const résultat = await genererLeMois(clientId, mois, user.id, options(formData));

  revalidatePath("/preparer");
  revalidatePath("/production");
  revalidatePath("/calendrier");
  revalidatePath("/contenu");
  revalidatePath(`/clients/${clientId}`);

  return résultat.crees > 0 ? { ok: résultat.message } : { error: résultat.message };
}

/**
 * Prépare le mois de tous les clients d'un coup.
 *
 * Le geste de début de mois se fait une fois pour le portefeuille entier. Les
 * clients sans décomposition sont sautés en le disant : les passer sous silence
 * ferait croire qu'ils sont à jour.
 */
export async function preparerTout(
  _prev: PreparerState,
  formData: FormData,
): Promise<PreparerState> {
  const user = await requireStaff();
  const mois = moisDepuis(String(formData.get("mois") ?? ""));
  const opts = options(formData);

  const actifs = await db
    .select({ id: clients.id, name: clients.shortName })
    .from(clients)
    .where(eq(clients.active, true));

  let total = 0;
  const touchés: string[] = [];
  const sansPlan: string[] = [];

  for (const c of actifs) {
    const plan = await planDuMois(c.id, mois);
    if (!plan) continue;
    if (plan.sansDecomposition) {
      sansPlan.push(c.name);
      continue;
    }
    if (plan.aCreer === 0) continue;

    const r = await genererLeMois(c.id, mois, user.id, opts);
    if (r.crees > 0) {
      total += r.crees;
      touchés.push(`${c.name} (${r.crees})`);
    }
  }

  revalidatePath("/preparer");
  revalidatePath("/production");
  revalidatePath("/calendrier");
  revalidatePath("/contenu");

  if (total === 0) {
    return {
      error: sansPlan.length
        ? `Rien à créer. Sans décomposition : ${sansPlan.join(", ")}.`
        : "Tous les clients sont déjà à jour sur ce mois.",
    };
  }

  return {
    ok:
      `${total} contenus préparés · ${touchés.join(", ")}` +
      (sansPlan.length ? ` — sans décomposition, donc ignorés : ${sansPlan.join(", ")}.` : "."),
  };
}
