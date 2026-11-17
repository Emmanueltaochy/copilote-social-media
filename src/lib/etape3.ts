import "server-only";

import { releverAgenda } from "@/lib/agenda";
import { releverGoCardless } from "@/lib/gocardless";
import type { ServiceEtape3 } from "@/lib/releves";
import { releverTrello } from "@/lib/trello";

/*
 * Le relevé de Trello, GoCardless et Google Agenda, toutes les 15 minutes
 * (src/instrumentation.ts), au même endroit que Gmail et Metricool.
 *
 * Jamais deux relevés d'un même service en même temps : dans ce processus,
 * un second appel rejoint celui qui tourne ; entre processus, un bail en base
 * (table `releves`) refuse le second. Chaque relevé est borné (DUREE_MAX_MS,
 * délai de 20 à 30 s par requête). Un service non relié ne fait rien.
 */

type Resultat = Awaited<ReturnType<typeof releverTrello>> | Awaited<ReturnType<typeof releverGoCardless>> | Awaited<ReturnType<typeof releverAgenda>>;

const enCours = new Map<ServiceEtape3, Promise<Resultat>>();
const RELEVES: Record<ServiceEtape3, () => Promise<Resultat>> = { trello: releverTrello, gocardless: releverGoCardless, agenda: releverAgenda };

export function synchroniser(service: ServiceEtape3): Promise<Resultat> {
  let p = enCours.get(service);
  if (!p) {
    p = RELEVES[service]().finally(() => enCours.delete(service));
    enCours.set(service, p);
  }
  return p;
}

/** Toutes les 15 minutes : les trois services, l'un après l'autre. */
export async function releveEtape3() {
  for (const s of ["trello", "gocardless", "agenda"] as const) {
    const r = await synchroniser(s).catch((e) => ({ etat: "erreur" as const, erreur: (e as Error).message }));
    if (r.etat === "erreur") console.warn(`[pilot] relevé ${s} :`, r.erreur);
  }
}
