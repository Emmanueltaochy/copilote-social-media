"use server";

import { redirect } from "next/navigation";
import { and, eq, gt } from "drizzle-orm";
import { db, users } from "@/db";
import { createSession, hashPassword } from "@/lib/auth";

export type InviteState = { error?: string };

export async function acceptInvitation(
  _prev: InviteState,
  formData: FormData,
): Promise<InviteState> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  if (password.length < 10) return { error: "Le mot de passe doit faire au moins 10 caractères." };

  const rows = await db
    .select()
    .from(users)
    .where(and(eq(users.inviteToken, token), gt(users.inviteExpiresAt, new Date())))
    .limit(1);
  const user = rows[0];
  if (!user) return { error: "Cette invitation n'est plus valable." };

  await db
    .update(users)
    .set({
      passwordHash: await hashPassword(password),
      // Le jeton est consommé : un lien intercepté après coup ne sert plus.
      inviteToken: null,
      inviteExpiresAt: null,
    })
    .where(eq(users.id, user.id));

  await createSession(user.id);
  // Un collaborateur arrive dans l'outil de l'agence, un contact client dans
  // son portail : le lien d'invitation est le même, la destination non.
  redirect(user.role === "client" ? "/portail" : "/");
}
