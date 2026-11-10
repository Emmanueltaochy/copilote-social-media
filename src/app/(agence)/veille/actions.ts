"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { activity, clients, contents, contentVersions, db, trendReports } from "@/db";
import { requireStaff } from "@/lib/auth";
import { addCompetitor, COMPETITOR_NETWORKS, removeCompetitor, type CompetitorNetwork } from "@/lib/metricool-competitors";
import { analyseTrends } from "@/lib/agent/trends";

export type VeilleState = { ok?: string; error?: string };

async function brandOf(clientId: string) {
  const [c] = await db.select({ brandId: clients.metricoolBrandId, name: clients.shortName }).from(clients).where(eq(clients.id, clientId)).limit(1);
  if (!c?.brandId) throw new Error("Ce client n'est pas relié à Metricool (Réglages → Metricool).");
  return c;
}

export async function ajouterConcurrent(_prev: VeilleState, formData: FormData): Promise<VeilleState> {
  await requireStaff();
  const clientId = String(formData.get("clientId") ?? "");
  const network = String(formData.get("network") ?? "instagram") as CompetitorNetwork;
  const handle = String(formData.get("handle") ?? "").trim();
  if (!handle) return { error: "Indiquez le compte du concurrent (@nom ou lien)." };
  if (!COMPETITOR_NETWORKS.includes(network)) return { error: "Réseau non suivi." };
  try {
    const c = await brandOf(clientId);
    await addCompetitor(c.brandId!, network, handle);
    revalidatePath("/veille");
    return { ok: `Concurrent ajouté. Metricool relève ses publications : comptez jusqu'à 24 h pour les premiers chiffres.` };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function retirerConcurrent(formData: FormData): Promise<void> {
  await requireStaff();
  const c = await brandOf(String(formData.get("clientId") ?? ""));
  await removeCompetitor(c.brandId!, String(formData.get("network")) as CompetitorNetwork, String(formData.get("competitorId")));
  revalidatePath("/veille");
}

/** Crée une idée dans le planning du client, inspirée d'une publication concurrente. */
export async function copierIdee(formData: FormData): Promise<void> {
  const user = await requireStaff();
  const clientId = String(formData.get("clientId") ?? "");
  const titre = String(formData.get("titre") ?? "Idée inspirée de la veille").slice(0, 120);
  const kind = String(formData.get("format") ?? "reel");
  const network = String(formData.get("reseau") ?? "instagram");
  const legende = String(formData.get("legende") ?? "").trim();
  const consignes = String(formData.get("consignes") ?? "").trim();
  const [row] = await db
    .insert(contents)
    .values({
      clientId,
      title: titre,
      kind: (["feed", "story", "reel", "carrousel", "autre"].includes(kind) ? kind : "reel") as "reel",
      network: (["instagram", "facebook", "linkedin", "tiktok"].includes(network) ? network : "instagram") as "instagram",
      networks: [(["instagram", "facebook", "linkedin", "tiktok"].includes(network) ? network : "instagram") as "instagram"],
      status: "idee",
      caption: legende || null,
      instructions: consignes || null,
    })
    .returning({ id: contents.id });
  await db.insert(contentVersions).values({ contentId: row.id, number: 1, note: "Première proposition", createdById: user.id });
  await db.insert(activity).values({ clientId, contentId: row.id, actorId: user.id, text: `Idée « ${titre} » ajoutée depuis la veille` });
  revalidatePath("/veille");
  revalidatePath("/production");
}

export async function lancerAnalyse(_prev: VeilleState, formData: FormData): Promise<VeilleState> {
  await requireStaff();
  try {
    await analyseTrends(String(formData.get("clientId") ?? ""));
    revalidatePath("/veille");
    return { ok: "Analyse terminée." };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function supprimerAnalyse(formData: FormData): Promise<void> {
  await requireStaff();
  await db.delete(trendReports).where(eq(trendReports.id, String(formData.get("id"))));
  revalidatePath("/veille");
}
