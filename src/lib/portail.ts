import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { db, clients, users } from "@/db";
import { requireUser } from "@/lib/auth";
import { reglages } from "@/db/web-queries";

/** Le client dont l'agence regarde le portail, en lecture seule. */
export const APERCU_COOKIE = "pilot-apercu";

/**
 * Le contexte commun à tous les écrans du portail.
 *
 * Chaque page en a besoin — le client dont c'est l'espace, les couleurs de
 * l'agence — et chacune doit refaire le contrôle : une mise en page ne protège
 * rien, elle s'exécute autour du rendu et non à sa place.
 *
 * Aperçu : un compte interne qui a choisi « Voir comme mon client » voit le
 * portail de ce client. `user` est alors le compte portail du client (ou, à
 * défaut, un nom d'affichage) — il sert à l'affichage seulement. Les actions
 * du portail relisent la vraie session et refusent tout compte non client :
 * l'aperçu ne permet jamais de valider à la place du client.
 */
export async function contextePortail() {
  const real = await requireUser();
  let clientId: string | null = null;
  let apercu = false;

  if (real.role === "client") {
    clientId = real.clientId;
  } else {
    const jar = await cookies();
    clientId = jar.get(APERCU_COOKIE)?.value ?? null;
    apercu = Boolean(clientId);
  }
  // Un compte interne n'a pas de portail à lui : on le renvoie à son outil.
  if (!clientId) redirect("/");

  const [client] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
  if (!client) redirect(apercu ? "/" : "/connexion");

  let user = real;
  if (apercu) {
    // Le portail tel que le client le voit : avec son nom à lui.
    const [portalUser] = await db
      .select()
      .from(users)
      .where(and(eq(users.clientId, client.id), eq(users.role, "client"), eq(users.active, true)))
      .orderBy(asc(users.createdAt))
      .limit(1);
    user = portalUser ?? { ...real, id: "apercu", name: client.shortName, initials: client.shortName.slice(0, 2).toUpperCase() };
  }

  const config = await reglages();
  return { user, client, config, apercu };
}

/** Vrai si la session courante regarde un portail en aperçu (compte interne). */
export async function enApercu(): Promise<boolean> {
  const real = await requireUser();
  if (real.role === "client") return false;
  const jar = await cookies();
  return Boolean(jar.get(APERCU_COOKIE)?.value);
}
