"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { departmentsOf, requireStaff } from "@/lib/auth";
import { POLE_COOKIE } from "@/lib/pole";

/**
 * Bascule d'un pôle à l'autre.
 *
 * Le choix est enregistré puis on part à l'accueil du pôle : rester sur l'écran
 * courant enverrait un développeur web sur le calendrier éditorial, qui ne le
 * concerne pas.
 */
export async function changerDePole(formData: FormData): Promise<void> {
  const user = await requireStaff();
  const voulu = String(formData.get("pole") ?? "");
  const autorisés = departmentsOf(user);

  if (voulu !== "social" && voulu !== "web") return;
  // Un cookie se fabrique à la main : le pôle demandé est confronté aux pôles
  // réellement accordés avant d'être écrit.
  if (!autorisés.includes(voulu)) return;

  const jar = await cookies();
  jar.set(POLE_COOKIE, voulu, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  redirect(voulu === "web" ? "/web" : "/");
}
