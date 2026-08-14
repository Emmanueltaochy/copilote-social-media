"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db, brands, briefFields, briefs, clientFiles } from "@/db";
import { requireUser } from "@/lib/auth";
import { majStatutBrief } from "@/app/(agence)/web/actions";
import { removeStored } from "@/lib/storage";

/**
 * Ce que le client peut écrire lui-même.
 *
 * Chaque action revérifie que l'objet touché appartient bien à son client :
 * un identifiant se devine, et un portail qui fait confiance à un champ caché
 * est un portail qui donne accès aux dossiers des autres.
 */

export type PortailWebState = { ok?: string; error?: string };

/** Répond à une question de son brief. */
export async function repondreAuBrief(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (user.role !== "client" || !user.clientId) return;

  const fieldId = String(formData.get("id") ?? "");
  const briefId = String(formData.get("briefId") ?? "");
  if (!fieldId || !briefId) return;

  const [brief] = await db.select().from(briefs).where(eq(briefs.id, briefId)).limit(1);
  if (!brief || brief.clientId !== user.clientId) return;
  // Un brouillon n'a pas été envoyé : le client n'est pas censé le connaître.
  if (brief.status === "brouillon") return;

  const [champ] = await db
    .select({ id: briefFields.id })
    .from(briefFields)
    .where(and(eq(briefFields.id, fieldId), eq(briefFields.briefId, briefId)))
    .limit(1);
  if (!champ) return;

  const valeur = String(formData.get("answer") ?? "").trim();
  await db
    .update(briefFields)
    .set({
      answer: valeur || null,
      answeredAt: valeur ? new Date() : null,
      // Vide : la réponse vient du client, pas d'un compte interne.
      answeredById: null,
    })
    .where(eq(briefFields.id, fieldId));

  await majStatutBrief(briefId);
  revalidatePath(`/portail/brief/${briefId}`);
  revalidatePath("/portail");
}

/**
 * Met à jour la charte graphique.
 *
 * Le même écran des deux côtés : le client écrit ses couleurs et ses polices,
 * l'agence complète. Deux documents séparés divergent en une semaine.
 */
export async function majCharte(formData: FormData): Promise<void> {
  const user = await requireUser();
  const clientId =
    user.role === "client" ? user.clientId : String(formData.get("clientId") ?? "");
  if (!clientId) return;
  if (user.role === "client" && user.clientId !== clientId) return;

  const couleurs = String(formData.get("palette") ?? "")
    .split(/[\s,;]+/)
    .map((c) => c.trim())
    .filter((c) => /^#?[0-9a-fA-F]{3,8}$/.test(c))
    .map((c) => (c.startsWith("#") ? c : `#${c}`))
    .slice(0, 12);

  const valeurs = {
    fonts: String(formData.get("fonts") ?? "").trim() || null,
    voice: String(formData.get("voice") ?? "").trim() || null,
    palette: couleurs,
  };

  await db
    .insert(brands)
    .values({ clientId, ...valeurs })
    .onConflictDoUpdate({ target: brands.clientId, set: valeurs });

  revalidatePath("/portail");
  revalidatePath(`/clients/${clientId}`);
}

/** Retire un fichier qu'on a soi-même déposé. */
export async function retirerFichier(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (user.role !== "client" || !user.clientId) return;

  const id = String(formData.get("id") ?? "");
  const [fichier] = await db.select().from(clientFiles).where(eq(clientFiles.id, id)).limit(1);
  if (!fichier || fichier.clientId !== user.clientId) return;
  // On ne retire que ce qu'on a déposé soi-même : les documents laissés par
  // l'agence sont dans le dossier du client sans lui appartenir.
  if (fichier.uploadedById !== user.id) return;

  await db.delete(clientFiles).where(eq(clientFiles.id, id));
  await removeStored(fichier.storagePath).catch(() => {});
  revalidatePath("/portail");
}
