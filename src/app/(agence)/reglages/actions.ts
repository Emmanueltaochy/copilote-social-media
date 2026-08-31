"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, promos, settings } from "@/db";
import { requireDirection } from "@/lib/auth";
import { removeStored } from "@/lib/storage";

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

/* -------------------------------------------------------------- bannières -- */

export type PromoState = { ok?: string; error?: string };

/** Une date de formulaire, ou rien. Une saisie illisible ne devient pas « maintenant ». */
function dateOuRien(valeur: string): Date | null {
  const v = valeur.trim();
  if (!v) return null;
  const d = new Date(`${v}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Crée une bannière du portail client.
 *
 * L'agence vend aussi à ses propres clients, et le portail est l'endroit où
 * ils viennent d'eux-mêmes. Deux garde-fous : l'audience, pour ne pas proposer
 * un site à qui vient d'en acheter un, et la date de fin — une promotion « ce
 * mois-ci » encore affichée en décembre décrédibilise le reste.
 */
export async function creerPromo(_prev: PromoState, formData: FormData): Promise<PromoState> {
  const user = await requireDirection();

  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { error: "Donne un titre à la bannière." };

  const audience = String(formData.get("audience") ?? "tous");
  if (!["tous", "social", "web"].includes(audience)) return { error: "Audience inconnue." };

  const ctaLabel = String(formData.get("ctaLabel") ?? "").trim();
  const ctaUrl = String(formData.get("ctaUrl") ?? "").trim();
  // Un bouton sans adresse ne mène nulle part, une adresse sans bouton ne se
  // clique pas : les deux vont ensemble ou aucun des deux.
  if ((ctaLabel && !ctaUrl) || (ctaUrl && !ctaLabel)) {
    return { error: "Un bouton demande un intitulé et une adresse, ou rien du tout." };
  }
  if (ctaUrl && !/^https?:\/\//i.test(ctaUrl)) {
    return { error: "L'adresse du bouton doit commencer par http:// ou https://." };
  }

  const startsAt = dateOuRien(String(formData.get("startsAt") ?? ""));
  const endsAt = dateOuRien(String(formData.get("endsAt") ?? ""));
  if (startsAt && endsAt && endsAt < startsAt) {
    return { error: "La date de fin est avant la date de début." };
  }

  const [ligne] = await db
    .insert(promos)
    .values({
      title,
      body: String(formData.get("body") ?? "").trim() || null,
      ctaLabel: ctaLabel || null,
      ctaUrl: ctaUrl || null,
      audience,
      // La fin est inclusive : « jusqu'au 30 » veut dire « le 30 compris ».
      startsAt,
      endsAt: endsAt ? new Date(endsAt.getTime() + 86_399_000) : null,
      createdById: user.id,
    })
    .returning({ id: promos.id });

  revalidatePath("/reglages");
  revalidatePath("/portail");
  return { ok: ligne ? "Bannière créée." : "Bannière créée." };
}

export async function basculerPromo(formData: FormData): Promise<void> {
  await requireDirection();
  const id = String(formData.get("id") ?? "");
  const actif = String(formData.get("active") ?? "") === "true";
  if (!id) return;
  await db.update(promos).set({ active: actif }).where(eq(promos.id, id));
  revalidatePath("/reglages");
  revalidatePath("/portail");
}

export async function supprimerPromo(formData: FormData): Promise<void> {
  await requireDirection();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const [ligne] = await db.select().from(promos).where(eq(promos.id, id)).limit(1);
  if (!ligne) return;
  // Le visuel part avec la bannière : sans cela le disque garderait des
  // images que plus rien ne désigne.
  if (ligne.imagePath) await removeStored(ligne.imagePath).catch(() => {});
  await db.delete(promos).where(eq(promos.id, id));
  revalidatePath("/reglages");
  revalidatePath("/portail");
}
