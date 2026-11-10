"use server";

import { cookies } from "next/headers";
import { requireStaff } from "@/lib/auth";
import { SCOPE_COOKIE } from "@/lib/scope";

/** Mémorise le client choisi dans le sélecteur (null = tous les clients). */
export async function choisirClient(clientId: string | null): Promise<void> {
  await requireStaff();
  const jar = await cookies();
  if (clientId) jar.set(SCOPE_COOKIE, clientId, { path: "/", sameSite: "lax", httpOnly: true, maxAge: 60 * 60 * 24 * 365 });
  else jar.delete(SCOPE_COOKIE);
}
