"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, clients } from "@/db";
import { requireStaff } from "@/lib/auth";
import { APERCU_COOKIE } from "@/lib/portail";

/**
 * « Voir comme mon client » : réservé aux comptes internes. Le cookie ne
 * change que ce que le portail AFFICHE ; les actions du portail continuent de
 * lire la vraie session et refusent tout compte qui n'est pas client.
 */
export async function entrerApercu(formData: FormData): Promise<void> {
  await requireStaff();
  const id = String(formData.get("clientId") ?? "");
  const [client] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.id, id), eq(clients.active, true)))
    .limit(1);
  if (!client) return;
  const jar = await cookies();
  jar.set(APERCU_COOKIE, client.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    // Un aperçu oublié ne doit pas durer : deux heures suffisent.
    maxAge: 2 * 3600,
  });
  redirect("/portail");
}

export async function quitterApercu(): Promise<void> {
  await requireStaff();
  const jar = await cookies();
  jar.delete(APERCU_COOKIE);
  redirect("/");
}
