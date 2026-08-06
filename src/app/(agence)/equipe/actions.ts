"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { and, eq, ne } from "drizzle-orm";
import { db, sessions, users } from "@/db";
import { initialsFrom, requireDirection } from "@/lib/auth";

export type TeamFormState = { error?: string; ok?: string };

const ROLES = ["direction", "equipe"] as const;

/**
 * Invitation d'un collaborateur.
 *
 * Même mécanique que pour les contacts clients : un lien à usage unique, daté,
 * et c'est l'invité qui choisit son mot de passe. Personne dans l'agence ne le
 * connaît, et il n'y a pas de mot de passe provisoire à transmettre — celui
 * qu'on communique de vive voix finit toujours par rester en place.
 *
 * Seule la direction invite : donner un accès interne revient à ouvrir le
 * portefeuille clients entier.
 */
export async function inviteTeammate(
  _prev: TeamFormState,
  formData: FormData,
): Promise<TeamFormState> {
  await requireDirection();

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "equipe");

  if (!name || !email) return { error: "Nom et adresse sont nécessaires." };
  if (!email.includes("@")) return { error: "Adresse électronique invalide." };
  if (!ROLES.includes(role as (typeof ROLES)[number])) return { error: "Rôle inconnu." };

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existing.length) return { error: "Un compte utilise déjà cette adresse." };

  await db.insert(users).values({
    name,
    email,
    initials: initialsFrom(name),
    role: role as (typeof ROLES)[number],
    inviteToken: randomBytes(32).toString("base64url"),
    // Une invitation qui traîne est une porte ouverte : elle expire.
    inviteExpiresAt: new Date(Date.now() + 14 * 86_400_000),
  });

  revalidatePath("/equipe");
  return { ok: `Invitation créée pour ${name}. Le lien est à envoyer ci-dessous.` };
}

/** Régénère le lien d'un collaborateur qui ne l'a jamais utilisé. */
export async function renewInvite(formData: FormData): Promise<void> {
  await requireDirection();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const [target] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  // Un compte déjà actif a son mot de passe : lui refaire un lien
  // d'invitation rouvrirait une porte que rien n'oblige à rouvrir.
  if (!target || target.passwordHash) return;

  await db
    .update(users)
    .set({
      inviteToken: randomBytes(32).toString("base64url"),
      inviteExpiresAt: new Date(Date.now() + 14 * 86_400_000),
    })
    .where(eq(users.id, id));

  revalidatePath("/equipe");
}

/**
 * Retire un accès interne.
 *
 * Le compte est désactivé, pas supprimé : ses heures saisies, ses contenus et
 * ses actions restent rattachés à quelqu'un. Les sessions ouvertes sont
 * fermées dans la foulée — sans cela, un départ resterait connecté un mois.
 */
export async function revokeTeammate(formData: FormData): Promise<void> {
  const actor = await requireDirection();
  const id = String(formData.get("id") ?? "");
  if (!id || id === actor.id) return;

  await db.update(users).set({ active: false, inviteToken: null }).where(eq(users.id, id));
  await db.delete(sessions).where(eq(sessions.userId, id));

  revalidatePath("/equipe");
}

export async function restoreTeammate(formData: FormData): Promise<void> {
  await requireDirection();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await db.update(users).set({ active: true }).where(eq(users.id, id));
  revalidatePath("/equipe");
}

/**
 * Change le rôle d'un collaborateur.
 *
 * Une agence sans direction ne peut plus rien administrer : on refuse de
 * retirer le dernier accès direction, plutôt que de laisser le produit dans un
 * état dont personne ne peut le sortir.
 */
export async function changeRole(formData: FormData): Promise<void> {
  const actor = await requireDirection();
  const id = String(formData.get("id") ?? "");
  const role = String(formData.get("role") ?? "");
  if (!id || !ROLES.includes(role as (typeof ROLES)[number])) return;

  if (role !== "direction") {
    const others = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.role, "direction"), eq(users.active, true), ne(users.id, id)))
      .limit(1);
    if (others.length === 0) return;
  }

  await db
    .update(users)
    .set({ role: role as (typeof ROLES)[number] })
    .where(eq(users.id, id));

  // Se rétrograder soi-même change ce qu'on a le droit de voir : les écrans
  // déjà rendus doivent être refaits, pas seulement celui-ci.
  revalidatePath("/equipe");
  revalidatePath("/", "layout");
  if (id === actor.id) revalidatePath("/rentabilite");
}
