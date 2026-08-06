"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, brands, clients, contractLines } from "@/db";
import { requireStaff } from "@/lib/auth";

/**
 * Un client sans engagement chiffré reste valide : certains comptes sont à la
 * carte. C'est le zéro qui doit être permis, pas le champ vide.
 */
const clientSchema = z.object({
  name: z.string().trim().min(1, "Le nom est obligatoire."),
  shortName: z.string().trim().optional(),
  sector: z.string().trim().optional(),
  monthlyFee: z.coerce.number().min(0).default(0),
  contentTarget: z.coerce.number().int().min(0).default(0),
  shootsIncluded: z.coerce.number().int().min(0).default(0),
  hoursSold: z.coerce.number().int().min(0).default(0),
  adsBudgetLabel: z.string().trim().optional(),
});

export type ClientFormState = { error?: string };

export async function createClient(
  _prev: ClientFormState,
  formData: FormData,
): Promise<ClientFormState> {
  await requireStaff();

  const parsed = clientSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Formulaire incomplet." };
  }
  const v = parsed.data;

  const existing = await db
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.name, v.name))
    .limit(1);
  if (existing.length) return { error: "Un client porte déjà ce nom." };

  const [client] = await db
    .insert(clients)
    .values({
      name: v.name,
      shortName: v.shortName?.trim() || v.name,
      sector: v.sector || null,
      // Saisi en euros, stocké en centimes : les flottants ne comptent pas juste.
      monthlyFeeCents: Math.round(v.monthlyFee * 100),
      contentTarget: v.contentTarget,
      shootsIncluded: v.shootsIncluded,
      hoursSold: v.hoursSold,
      adsBudgetLabel: v.adsBudgetLabel || null,
    })
    .returning();

  await db.insert(brands).values({ clientId: client.id });

  revalidatePath("/clients");
  revalidatePath("/");
  redirect(`/clients/${client.id}`);
}

export async function updateClient(
  _prev: ClientFormState,
  formData: FormData,
): Promise<ClientFormState> {
  await requireStaff();
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Client introuvable." };

  const parsed = clientSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Formulaire incomplet." };
  }
  const v = parsed.data;

  await db
    .update(clients)
    .set({
      name: v.name,
      shortName: v.shortName?.trim() || v.name,
      sector: v.sector || null,
      monthlyFeeCents: Math.round(v.monthlyFee * 100),
      contentTarget: v.contentTarget,
      shootsIncluded: v.shootsIncluded,
      hoursSold: v.hoursSold,
      adsBudgetLabel: v.adsBudgetLabel || null,
    })
    .where(eq(clients.id, id));

  revalidatePath("/clients");
  revalidatePath(`/clients/${id}`);
  revalidatePath("/");
  return {};
}

/**
 * On archive plutôt qu'on ne supprime : l'historique d'un client parti reste
 * nécessaire pour les rapports et la rentabilité des mois passés.
 */
export async function archiveClient(formData: FormData): Promise<void> {
  await requireStaff();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await db
    .update(clients)
    .set({ active: false, archivedAt: new Date() })
    .where(eq(clients.id, id));
  revalidatePath("/clients");
  revalidatePath("/");
  redirect("/clients");
}

export async function addContractLine(formData: FormData): Promise<void> {
  await requireStaff();
  const clientId = String(formData.get("clientId") ?? "");
  const label = String(formData.get("label") ?? "").trim();
  const target = Number(formData.get("monthlyTarget") ?? 0);
  if (!clientId || !label) return;

  const existing = await db
    .select({ id: contractLines.id })
    .from(contractLines)
    .where(eq(contractLines.clientId, clientId));

  await db.insert(contractLines).values({
    clientId,
    label,
    monthlyTarget: Number.isFinite(target) ? target : 0,
    position: existing.length,
  });
  revalidatePath(`/clients/${clientId}`);
}
