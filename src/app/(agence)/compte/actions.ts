"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, users } from "@/db";
import { hashPassword, initialsFrom, requireUser, verifyPassword } from "@/lib/auth";
import { removeStored } from "@/lib/storage";

export type CompteState = { ok?: string; error?: string };

/**
 * Son propre nom et ses propres initiales.
 *
 * L'adresse e-mail n'est pas modifiable ici : c'est l'identifiant de connexion
 * et la destination des notifications. La changer soi-même par erreur revient à
 * se fermer la porte, et personne ne peut la rouvrir sans passer par la base.
 */
export async function updateProfile(
  _prev: CompteState,
  formData: FormData,
): Promise<CompteState> {
  const user = await requireUser();

  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2) return { error: "Un nom, même court." };

  const saisies = String(formData.get("initials") ?? "").trim().toUpperCase();
  const initials = (saisies || initialsFrom(name)).slice(0, 3);

  await db.update(users).set({ name, initials }).where(eq(users.id, user.id));

  revalidatePath("/", "layout");
  return { ok: "Profil enregistré." };
}

/**
 * Changement de mot de passe.
 *
 * L'ancien est exigé même si la personne est déjà connectée : un écran laissé
 * ouvert dans un bureau suffirait sinon à s'approprier le compte, et c'est
 * précisément le genre d'accès qu'on ne remarque jamais.
 */
export async function updatePassword(
  _prev: CompteState,
  formData: FormData,
): Promise<CompteState> {
  const user = await requireUser();

  const actuel = String(formData.get("current") ?? "");
  const nouveau = String(formData.get("password") ?? "");

  if (!user.passwordHash) return { error: "Ce compte n'a pas encore de mot de passe." };
  if (!(await verifyPassword(actuel, user.passwordHash))) {
    return { error: "Mot de passe actuel incorrect." };
  }
  if (nouveau.length < 10) {
    return { error: "Au moins 10 caractères : c'est la seule protection du compte." };
  }
  if (nouveau === actuel) return { error: "Le nouveau mot de passe est identique à l'ancien." };

  await db
    .update(users)
    .set({ passwordHash: await hashPassword(nouveau) })
    .where(eq(users.id, user.id));

  return { ok: "Mot de passe changé." };
}

/** Retire sa photo : on retombe sur les initiales. */
export async function removeAvatar(): Promise<void> {
  const user = await requireUser();
  if (!user.avatarPath) return;

  await db.update(users).set({ avatarPath: null }).where(eq(users.id, user.id));
  await removeStored(user.avatarPath).catch(() => {});

  revalidatePath("/", "layout");
}
