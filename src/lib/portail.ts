import "server-only";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, clients } from "@/db";
import { requireUser } from "@/lib/auth";
import { reglages } from "@/db/web-queries";

/**
 * Le contexte commun à tous les écrans du portail.
 *
 * Chaque page en a besoin — le client dont c'est l'espace, les couleurs de
 * l'agence — et chacune doit refaire le contrôle : une mise en page ne protège
 * rien, elle s'exécute autour du rendu et non à sa place.
 */
export async function contextePortail() {
  const user = await requireUser();
  // Un compte interne n'a pas de portail à lui : on le renvoie à son outil.
  if (user.role !== "client" || !user.clientId) redirect("/");

  const [client] = await db.select().from(clients).where(eq(clients.id, user.clientId)).limit(1);
  if (!client) redirect("/connexion");

  const config = await reglages();
  return { user, client, config };
}
