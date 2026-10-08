"use server";

import { after } from "next/server";
import { prepareReset } from "@/lib/password-reset";

export type ForgotState = { error?: string; sent?: boolean };

/**
 * Demande d'un lien de réinitialisation.
 *
 * La réponse est la même que l'adresse corresponde à un compte ou non : dire
 * « aucun compte à ce nom » permettrait à n'importe qui de vérifier qui est
 * client de l'agence.
 */
export async function requestReset(_prev: ForgotState, formData: FormData): Promise<ForgotState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) return { error: "Renseigne une adresse e-mail valide." };

  const envoi = await prepareReset(email);
  // Expédié après la réponse : le temps passé à parler au serveur de
  // messagerie ne doit pas distinguer une adresse connue d'une inconnue.
  if (envoi) after(envoi);

  return { sent: true };
}
