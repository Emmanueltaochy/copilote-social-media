"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, adMetrics, adSets, campaigns } from "@/db";
import { requireStaff } from "@/lib/auth";
import { CAMPAIGN_STATUSES, mondayOf } from "@/lib/ads";

export type CampaignFormState = { error?: string; ok?: string };

function refresh(id?: string) {
  revalidatePath("/ads");
  revalidatePath("/rapports");
  if (id) revalidatePath(`/ads/${id}`);
}

/** Un montant saisi en euros devient des centimes : la base ne stocke pas de flottants. */
function toCents(value: FormDataEntryValue | null): number {
  const n = Number(String(value ?? "0").replace(",", ".").trim() || "0");
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
}

function toInt(value: FormDataEntryValue | null): number {
  const n = Number(String(value ?? "0").replace(/\s/g, "").trim() || "0");
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

const campaignSchema = z.object({
  clientId: z.string().uuid("Choisis un client."),
  name: z.string().trim().min(1, "Donne un nom à la campagne."),
  platform: z.string().trim().min(1),
  budget: z.string().optional(),
  targetCpl: z.string().optional(),
  startsOn: z.string().optional(),
  endsOn: z.string().optional(),
});

export async function createCampaign(
  _prev: CampaignFormState,
  formData: FormData,
): Promise<CampaignFormState> {
  await requireStaff();

  const parsed = campaignSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Formulaire incomplet." };
  const v = parsed.data;

  if (v.startsOn && v.endsOn && v.endsOn < v.startsOn) {
    return { error: "La fin de campagne doit être après le début." };
  }

  const [campaign] = await db
    .insert(campaigns)
    .values({
      clientId: v.clientId,
      name: v.name,
      platform: v.platform,
      status: "brouillon",
      budgetCents: toCents(v.budget ?? null),
      targetCplCents: v.targetCpl ? toCents(v.targetCpl) : null,
      startsOn: v.startsOn || null,
      endsOn: v.endsOn || null,
    })
    .returning();

  refresh(campaign.id);
  redirect(`/ads/${campaign.id}`);
}

export async function updateCampaign(formData: FormData): Promise<void> {
  await requireStaff();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const status = String(formData.get("status") ?? "");
  await db
    .update(campaigns)
    .set({
      ...(CAMPAIGN_STATUSES.includes(status as never) ? { status: status as never } : {}),
      budgetCents: toCents(formData.get("budget")),
      targetCplCents: formData.get("targetCpl") ? toCents(formData.get("targetCpl")) : null,
      platform: String(formData.get("platform") ?? "Meta").trim() || "Meta",
    })
    .where(eq(campaigns.id, id));

  refresh(id);
}

export async function deleteCampaign(formData: FormData): Promise<void> {
  await requireStaff();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await db.delete(campaigns).where(eq(campaigns.id, id));
  revalidatePath("/ads");
  redirect("/ads");
}

/* ------------------------------------------------------------ ensembles -- */

export async function addAdSet(formData: FormData): Promise<void> {
  await requireStaff();
  const campaignId = String(formData.get("campaignId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!campaignId || !name) return;

  const [row] = await db
    .select({ n: sql<number>`coalesce(max(${adSets.position}), -1)::int` })
    .from(adSets)
    .where(eq(adSets.campaignId, campaignId));

  await db.insert(adSets).values({ campaignId, name, position: (row?.n ?? -1) + 1 });
  refresh(campaignId);
}

export async function removeAdSet(formData: FormData): Promise<void> {
  await requireStaff();
  const id = String(formData.get("id") ?? "");
  const campaignId = String(formData.get("campaignId") ?? "");
  if (!id) return;
  await db.delete(adSets).where(eq(adSets.id, id));
  refresh(campaignId);
}

/* --------------------------------------------------------------- saisie -- */

/**
 * Saisie hebdomadaire des chiffres d'une régie.
 *
 * Il n'y a pas de connexion aux API publicitaires : les jetons expirent, les
 * comptes changent de main, et une intégration en panne donne des chiffres
 * faux sans le dire. Une saisie manuelle hebdomadaire est plus lente mais
 * toujours vraie, et c'est de toute façon ce que fait déjà l'agence pour son
 * reporting.
 *
 * Une même semaine ressaisie remplace la précédente au lieu d'en créer une
 * seconde : corriger une erreur de saisie est le cas normal, pas l'exception.
 */
export async function saveMetrics(
  _prev: CampaignFormState,
  formData: FormData,
): Promise<CampaignFormState> {
  const user = await requireStaff();

  const adSetId = String(formData.get("adSetId") ?? "");
  const campaignId = String(formData.get("campaignId") ?? "");
  if (!adSetId) return { error: "Choisis un ensemble de publicités." };

  // Toute date d'une semaine ramène à son lundi : deux personnes qui saisissent
  // la même semaine à deux jours d'écart ne doivent pas créer deux lignes.
  const raw = String(formData.get("weekStart") ?? "").trim();
  const weekStart = mondayOf(raw ? new Date(`${raw}T00:00:00`) : new Date());

  const values = {
    spendCents: toCents(formData.get("spend")),
    impressions: toInt(formData.get("impressions")),
    clicks: toInt(formData.get("clicks")),
    leads: toInt(formData.get("leads")),
    conversions: toInt(formData.get("conversions")),
    revenueCents: toCents(formData.get("revenue")),
  };

  if (values.clicks > values.impressions && values.impressions > 0) {
    return { error: "Plus de clics que d'impressions : vérifie la saisie." };
  }

  await db
    .insert(adMetrics)
    .values({ adSetId, weekStart, ...values, capturedById: user.id })
    .onConflictDoUpdate({
      target: [adMetrics.adSetId, adMetrics.weekStart],
      set: { ...values, capturedById: user.id, capturedAt: new Date() },
    });

  refresh(campaignId);
  return { ok: `Chiffres enregistrés pour la semaine du ${weekStart.slice(8)}/${weekStart.slice(5, 7)}.` };
}

export async function removeMetrics(formData: FormData): Promise<void> {
  await requireStaff();
  const adSetId = String(formData.get("adSetId") ?? "");
  const weekStart = String(formData.get("weekStart") ?? "");
  const campaignId = String(formData.get("campaignId") ?? "");
  if (!adSetId || !weekStart) return;
  await db
    .delete(adMetrics)
    .where(and(eq(adMetrics.adSetId, adSetId), eq(adMetrics.weekStart, weekStart)));
  refresh(campaignId);
}
