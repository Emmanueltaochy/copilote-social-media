"use server";

import { redirect } from "next/navigation";
import { createSession } from "@/lib/auth";
import { consumeReset } from "@/lib/password-reset";

export type ResetState = { error?: string };

export async function resetPassword(_prev: ResetState, formData: FormData): Promise<ResetState> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "");

  if (password.length < 10) return { error: "Le mot de passe doit faire au moins 10 caractères." };
  if (password !== confirmation) return { error: "Les deux mots de passe ne correspondent pas." };

  const user = await consumeReset(token, password);
  if (!user) return { error: "Ce lien n'est plus valable. Demandez-en un nouveau." };

  await createSession(user.id);
  redirect(user.role === "client" ? "/portail" : "/");
}
