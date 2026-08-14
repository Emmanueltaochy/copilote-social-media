"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, users } from "@/db";
import {
  createSession,
  destroySession,
  hashPassword,
  hasAnyUser,
  initialsFrom,
  verifyPassword,
} from "@/lib/auth";

export type FormState = { error?: string };

export async function login(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const suite = String(formData.get("suite") ?? "") || "/";

  if (!email || !password) return { error: "Renseigne ton adresse et ton mot de passe." };

  const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const user = rows[0];

  // Message identique dans les deux cas : distinguer « compte inconnu » de
  // « mot de passe faux » permettrait d'énumérer les comptes existants.
  const invalid = { error: "Adresse ou mot de passe incorrect." };
  if (!user || !user.active || !user.passwordHash) return invalid;
  if (!(await verifyPassword(password, user.passwordHash))) return invalid;

  await createSession(user.id);
  redirect(user.role === "client" ? "/portail" : suite);
}

export async function logout(): Promise<void> {
  await destroySession();
  redirect("/connexion");
}

/**
 * Création du tout premier compte. N'est possible que tant que la base ne
 * contient aucun utilisateur : sans ce verrou, l'adresse resterait ouverte à
 * quiconque la découvrirait.
 */
export async function createFirstUser(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (await hasAnyUser()) return { error: "Un compte existe déjà. Utilise la page de connexion." };

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!name || !email) return { error: "Nom et adresse sont nécessaires." };
  if (password.length < 10) {
    return { error: "Le mot de passe doit faire au moins 10 caractères." };
  }

  const [user] = await db
    .insert(users)
    .values({
      name,
      email,
      initials: initialsFrom(name),
      role: "direction",
      // La direction exerce les deux métiers de l'agence. L'écrire plutôt que
      // de le déduire : une donnée qui se devine finit par se deviner mal.
      departments: ["social", "web"],
      passwordHash: await hashPassword(password),
    })
    .returning();

  await createSession(user.id);
  redirect("/");
}
