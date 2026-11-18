"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { and, eq } from "drizzle-orm";
import { clients, db, trendReports, veilleAccounts } from "@/db";
import { requireDepartment, requireStaff } from "@/lib/auth";
import { addCompetitor, COMPETITOR_NETWORKS, normalizeHandle, removeCompetitor, type CompetitorNetwork } from "@/lib/metricool-competitors";
import { creerContenu } from "@/lib/contenu-creation";
import { etatMemoire, foisMoyenneDe, publicationVeille, recupererHistorique, relancerHistoriqueDemain } from "@/lib/veille";
import { FORMAT_LABEL, formatPilot, type Format } from "@/lib/veille-regles";
import { fmt } from "@/components/stats/Charts";

/** Clé d'un compte suivi : réseau + identifiant en minuscules, sans @. */
const cle = (h: string) => h.replace(/^@/, "").trim().toLowerCase();
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
  const kind = formData.get("kind") === "inspiration" ? "inspiration" : "concurrent";
  if (!handle) return { error: "Indiquez le compte (@nom ou lien)." };
  if (!COMPETITOR_NETWORKS.includes(network)) return { error: "Réseau non suivi." };
  try {
    const c = await brandOf(clientId);
    const etat = await addCompetitor(c.brandId!, network, handle);
    await db
      .insert(veilleAccounts)
      .values({ clientId, network, handle: cle(normalizeHandle(network, handle)), kind })
      .onConflictDoUpdate({ target: [veilleAccounts.clientId, veilleAccounts.network, veilleAccounts.handle], set: { kind } });
    // Metricool collecte l'historique du nouveau compte sous 24 h : la remontée sera refaite demain.
    await relancerHistoriqueDemain(clientId).catch(() => undefined);
    revalidatePath("/veille");
    const quoi = kind === "inspiration" ? "Inspiration" : "Concurrent";
    if (etat === "en_cours") {
      return {
        ok: `${quoi} noté. Metricool met du temps à trouver ce compte : rechargez la page dans quelques minutes. S'il n'apparaît toujours pas, vérifiez l'identifiant (@nom exact du compte, profil public).`,
      };
    }
    return { ok: `${quoi} ajouté. Metricool relève ses publications : comptez jusqu'à 24 h pour les premiers chiffres.` };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function retirerConcurrent(formData: FormData): Promise<void> {
  await requireStaff();
  const c = await brandOf(String(formData.get("clientId") ?? ""));
  const clientId = String(formData.get("clientId") ?? "");
  const network = String(formData.get("network"));
  await removeCompetitor(c.brandId!, network as CompetitorNetwork, String(formData.get("competitorId")));
  const handle = String(formData.get("handle") ?? "");
  if (handle) await db.delete(veilleAccounts).where(and(eq(veilleAccounts.clientId, clientId), eq(veilleAccounts.network, network), eq(veilleAccounts.handle, cle(handle))));
  revalidatePath("/veille");
}

/** Passe un compte suivi de « concurrent » à « inspiration du secteur », ou l'inverse. */
export async function changerRole(formData: FormData): Promise<void> {
  await requireStaff();
  const clientId = String(formData.get("clientId") ?? "");
  const network = String(formData.get("network") ?? "");
  const handle = cle(String(formData.get("handle") ?? ""));
  const kind = formData.get("kind") === "inspiration" ? "inspiration" : "concurrent";
  if (!clientId || !network || !handle) return;
  await db
    .insert(veilleAccounts)
    .values({ clientId, network, handle, kind })
    .onConflictDoUpdate({ target: [veilleAccounts.clientId, veilleAccounts.network, veilleAccounts.handle], set: { kind } });
  revalidatePath("/veille");
}

/** Crée une idée dans le planning du client, depuis l'analyse des tendances par l'IA. */
export async function copierIdee(formData: FormData): Promise<void> {
  const user = await requireDepartment("social");
  const clientId = String(formData.get("clientId") ?? "");
  const titre = String(formData.get("titre") ?? "Idée inspirée de la veille").slice(0, 120);
  const kind = String(formData.get("format") ?? "reel");
  const network = String(formData.get("reseau") ?? "instagram");
  const legende = String(formData.get("legende") ?? "").trim();
  const consignes = String(formData.get("consignes") ?? "").trim();
  const reseau = (["instagram", "facebook", "linkedin", "tiktok"].includes(network) ? network : "instagram") as "instagram";
  await creerContenu({
    clientId,
    title: titre,
    kind: (["feed", "story", "reel", "carrousel", "autre"].includes(kind) ? kind : "reel") as "reel",
    networks: [reseau],
    caption: legende || null,
    instructions: consignes || null,
    auteurId: user.id,
    journal: `Idée « ${titre} » ajoutée depuis la veille`,
  });
  revalidatePath("/veille");
  revalidatePath("/production");
}

export type RefaireState = { ok?: boolean; contenuId?: string; error?: string };

const RESEAU_LABEL: Record<string, string> = { instagram: "Instagram", facebook: "Facebook", youtube: "YouTube" };
const jourFr = (d: Date) => d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Indian/Reunion" });

/**
 * « Refaire cette idée » : une idée dans le planning du client, avec le lien
 * de la publication d'origine et la note « Inspiré de @compte, publication du
 * … ». Jamais de copie : ni la légende ni le texte d'origine ne sont repris,
 * seulement ce qui a marché (format, chiffres) et la consigne d'adapter.
 * Mêmes droits que la page Veille (pôle social, direction comprise).
 */
export async function refaireIdee(_prev: RefaireState, formData: FormData): Promise<RefaireState> {
  const user = await requireDepartment("social");
  const p = await publicationVeille(String(formData.get("postId") ?? ""));
  if (!p) return { error: "Publication introuvable : rechargez la page." };
  const [c] = await db.select({ id: clients.id, name: clients.shortName }).from(clients).where(eq(clients.id, p.clientId)).limit(1);
  if (!c) return { error: "Client introuvable." };
  const format = p.format as Format;
  const reseau = RESEAU_LABEL[p.network] ?? p.network;
  const quand = p.publishedAt ? `publication du ${jourFr(p.publishedAt)}` : "publication à la date inconnue";
  const note = `Inspiré de @${p.handle}, ${quand}`;
  const fois = await foisMoyenneDe(p).catch(() => null);
  const chiffres = [
    `${fmt(p.likes)} j'aime`,
    `${fmt(p.comments)} commentaires`,
    p.shares ? `${fmt(p.shares)} partages` : null,
    p.views ? `${fmt(p.views)} vues` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const titre = `Refaire : ${FORMAT_LABEL[format].toLowerCase()} de @${p.handle}`.slice(0, 120);
  const consignes = [
    `${note} (${reseau}).`,
    p.url ? `Référence : ${p.url}` : null,
    `Ce qui a marché : ${FORMAT_LABEL[format]} · ${chiffres}${fois ? ` · ${String(fois).replace(".", ",")} fois la moyenne du compte à ce moment-là` : ""} (relevé du ${jourFr(p.metricsAt)}).`,
    "",
    `Jamais de copie : reprendre le mécanisme (accroche, format, angle, rythme), pas le texte ni les images. L'adapter au métier et à la charte de ${c.name}.`,
  ]
    .filter((l) => l !== null)
    .join("\n");
  const contenu = await creerContenu({
    clientId: c.id,
    title: titre,
    kind: formatPilot(format),
    networks: [p.network === "facebook" ? "facebook" : "instagram"],
    caption: null,
    instructions: consignes,
    auteurId: user.id,
    journal: `Idée « ${titre} » ajoutée depuis la veille (${note})`,
    liens: p.url ? [{ url: p.url, label: note }] : [],
  });
  revalidatePath("/veille");
  revalidatePath("/production");
  return { ok: true, contenuId: contenu.id };
}

/**
 * « Récupérer l'historique » (direction) : en arrière-plan, reprend la
 * remontée inachevée, ou la refait depuis aujourd'hui (par exemple après que
 * le support de Metricool a chargé un historique plus ancien).
 */
export async function recupererHistoriqueAction(_prev: VeilleState, formData: FormData): Promise<VeilleState> {
  const user = await requireStaff();
  if (user.role !== "direction") return { error: "Réservé à la direction." };
  const clientId = String(formData.get("clientId") ?? "");
  try {
    await brandOf(clientId);
  } catch (e) {
    return { error: (e as Error).message };
  }
  if ((await etatMemoire(clientId)).enCours) return { ok: "Une récupération est déjà en cours : rechargez la page dans quelques minutes." };
  after(() => recupererHistorique(clientId).catch((e) => console.warn("[pilot] veille : historique,", (e as Error).message)));
  return { ok: "Récupération lancée : Pilot remonte l'historique de Metricool par tranches. Rechargez la page dans quelques minutes." };
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
