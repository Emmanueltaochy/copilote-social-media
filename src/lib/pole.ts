import "server-only";

import { cookies } from "next/headers";
import { departmentsOf, type Department } from "./auth";
import type { User } from "@/db";

export const POLE_COOKIE = "pilot_pole";

/**
 * Le pôle affiché, pour qui en a deux.
 *
 * Il vit dans un cookie et non dans l'adresse, parce que trois écrans sont
 * communs aux deux métiers — les clients, les heures, l'équipe. Déduire le pôle
 * du chemin ferait basculer la navigation dès qu'on ouvre la fiche d'un client,
 * et on se retrouverait dans l'autre moitié de l'agence sans l'avoir demandé.
 *
 * Le choix est toujours vérifié contre les pôles réellement accordés : un
 * cookie se fabrique à la main, et il ne doit ouvrir aucune porte.
 */
export async function polActif(user: Pick<User, "role" | "departments">): Promise<Department> {
  const autorisés = departmentsOf(user);
  const jar = await cookies();
  const choisi = jar.get(POLE_COOKIE)?.value;
  if (choisi === "web" || choisi === "social") {
    if (autorisés.includes(choisi)) return choisi;
  }
  return autorisés[0];
}
