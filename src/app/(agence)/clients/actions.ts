"use server";

/** Les valeurs acceptées, pour ne pas laisser un champ bricolé atteindre la base. */
const CONTENT_KINDS = ["feed", "story", "reel", "carrousel", "autre"];
const NETWORKS = ["instagram", "facebook", "linkedin", "tiktok", "google"];

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { unlink } from "node:fs/promises";
import { db, brands, clientFiles, clients, contractLines, users } from "@/db";
import { absolutePath } from "@/lib/storage";
import { canSeeMoney, initialsFrom, requireStaff } from "@/lib/auth";

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

/**
 * Les pôles cochés pour un client.
 *
 * Aucun coché retombe sur le social : c'est le métier historique, et un client
 * sans pôle n'apparaîtrait nulle part — on l'aurait créé pour rien.
 */
function polesDe(formData: FormData): string[] {
  const cochés = formData
    .getAll("departments")
    .map(String)
    .filter((d) => d === "social" || d === "web");
  return cochés.length > 0 ? cochés : ["social"];
}

export async function createClient(
  _prev: ClientFormState,
  formData: FormData,
): Promise<ClientFormState> {
  const user = await requireStaff();

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
      // Les montants ne sont retenus que si l'auteur a le droit de les voir :
      // masquer un champ à l'affichage n'empêche pas de l'envoyer quand même.
      monthlyFeeCents: canSeeMoney(user) ? Math.round(v.monthlyFee * 100) : 0,
      contentTarget: v.contentTarget,
      shootsIncluded: v.shootsIncluded,
      hoursSold: canSeeMoney(user) ? v.hoursSold : 0,
      adsBudgetLabel: v.adsBudgetLabel || null,
      departments: polesDe(formData),
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
  const user = await requireStaff();
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
      // Un membre de l'équipe modifie la fiche sans voir les montants : ceux
      // qu'il n'a pas vus ne doivent pas être écrasés par la valeur par
      // défaut du formulaire, qui vaudrait zéro.
      ...(canSeeMoney(user)
        ? { monthlyFeeCents: Math.round(v.monthlyFee * 100), hoursSold: v.hoursSold }
        : {}),
      contentTarget: v.contentTarget,
      shootsIncluded: v.shootsIncluded,
      adsBudgetLabel: v.adsBudgetLabel || null,
      // Les cases ne sont dans le formulaire que si l'écran les a montrées :
      // les écrire sans les avoir demandées ramènerait tout le monde au social.
      ...(formData.has("departments") ? { departments: polesDe(formData) } : {}),
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

/**
 * Ajoute une ligne à la décomposition de l'engagement.
 *
 * Le format et le réseau sont demandés en plus du libellé : c'est ce qui
 * permet, chaque début de mois, de fabriquer les contenus au lieu de seulement
 * les compter. Le libellé reste libre — il est écrit pour l'équipe, pas pour la
 * machine.
 */
export async function addContractLine(formData: FormData): Promise<void> {
  await requireStaff();
  const clientId = String(formData.get("clientId") ?? "");
  const label = String(formData.get("label") ?? "").trim();
  const target = Number(formData.get("monthlyTarget") ?? 0);
  const kind = String(formData.get("kind") ?? "feed");
  // Plusieurs réseaux possibles : « Object.fromEntries » n'en garderait qu'un,
  // on lit donc la liste telle quelle. Aucun coché retombe sur Instagram.
  const cochés = formData.getAll("networks").map(String).filter((n) => NETWORKS.includes(n));
  const networks = cochés.length > 0 ? cochés : ["instagram"];
  if (!clientId || !label) return;
  if (!CONTENT_KINDS.includes(kind)) return;

  const existing = await db
    .select({ id: contractLines.id })
    .from(contractLines)
    .where(eq(contractLines.clientId, clientId));

  await db.insert(contractLines).values({
    clientId,
    label,
    monthlyTarget: Number.isFinite(target) && target > 0 ? Math.floor(target) : 0,
    kind: kind as "feed",
    network: networks[0] as "instagram",
    networks,
    position: existing.length,
  });
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/preparer");
}

/** Retire une ligne. Les contenus déjà créés à partir d'elle ne bougent pas. */
export async function removeContractLine(formData: FormData): Promise<void> {
  await requireStaff();
  const id = String(formData.get("id") ?? "");
  const clientId = String(formData.get("clientId") ?? "");
  if (!id) return;

  await db.delete(contractLines).where(eq(contractLines.id, id));
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/preparer");
}


/**
 * Ouvre un accès au portail pour un contact du client.
 *
 * Aucun mot de passe n'est choisi ici : un lien d'invitation à usage unique
 * est généré, et c'est le client qui définit le sien. Personne dans l'agence
 * ne connaît donc le mot de passe d'un client.
 */
export async function createClientAccess(
  _prev: ClientFormState,
  formData: FormData,
): Promise<ClientFormState> {
  await requireStaff();

  const clientId = String(formData.get("clientId") ?? "");
  const name = String(formData.get("contactName") ?? "").trim();
  const email = String(formData.get("contactEmail") ?? "").trim().toLowerCase();
  if (!clientId || !name || !email) return { error: "Nom et adresse du contact sont nécessaires." };

  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing.length) return { error: "Un compte utilise déjà cette adresse." };

  const token = randomBytes(32).toString("base64url");
  await db.insert(users).values({
    name,
    email,
    initials: initialsFrom(name),
    role: "client",
    clientId,
    inviteToken: token,
    // Une invitation qui traîne est une porte ouverte : elle expire.
    inviteExpiresAt: new Date(Date.now() + 14 * 86_400_000),
  });

  revalidatePath(`/clients/${clientId}`);
  return {};
}

export async function revokeClientAccess(formData: FormData): Promise<void> {
  await requireStaff();
  const userId = String(formData.get("userId") ?? "");
  const clientId = String(formData.get("clientId") ?? "");
  if (!userId) return;
  // Désactiver plutôt que supprimer : l'historique des actions du contact
  // reste rattaché à quelqu'un.
  await db.update(users).set({ active: false }).where(eq(users.id, userId));
  revalidatePath(`/clients/${clientId}`);
}

/**
 * Retire une pièce jointe.
 *
 * Le fichier part du disque en même temps que la ligne : sans elle, plus rien
 * ne le désigne et il occuperait le volume sans que personne puisse le
 * retrouver.
 */
export async function deleteClientFile(formData: FormData): Promise<void> {
  await requireStaff();
  const id = String(formData.get("id") ?? "");
  const clientId = String(formData.get("clientId") ?? "");
  if (!id) return;

  const [row] = await db.select().from(clientFiles).where(eq(clientFiles.id, id)).limit(1);
  if (!row) return;

  await unlink(absolutePath(row.storagePath)).catch(() => {});
  await db.delete(clientFiles).where(eq(clientFiles.id, id));
  revalidatePath(`/clients/${clientId}`);
}
