"use server";

import { cookies } from "next/headers";
import { requireStaff } from "@/lib/auth";
import { SCOPE_COOKIE } from "@/lib/scope";

/** Mémorise le client choisi dans le sélecteur (null = tous les clients). */
export async function choisirClient(clientId: string | null): Promise<void> {
  await requireStaff();
  const jar = await cookies();
  // Cookie de session, sans durée : le filtre tient le temps du travail sur
  // un client, puis s'efface à la fermeture du navigateur. Gardé un an, il
  // faisait ouvrir le calendrier ou la production du lendemain sur un seul
  // client sans qu'on s'en souvienne.
  if (clientId) jar.set(SCOPE_COOKIE, clientId, { path: "/", sameSite: "lax", httpOnly: true });
  else jar.delete(SCOPE_COOKIE);
}
