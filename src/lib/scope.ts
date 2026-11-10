import "server-only";

import { cookies } from "next/headers";

/*
 * Le client sélectionné en haut à droite (« Tous les clients » / un client).
 *
 * Il est mémorisé dans un cookie : chaque écran le relit côté serveur et ne
 * montre que les données de ce client. Un `?client=` dans l'adresse (lien
 * partagé, raccourci) passe devant le cookie pour cette page.
 */

export const SCOPE_COOKIE = "pilot-client";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** L'identifiant du client filtré, ou `undefined` pour tous les clients. */
export async function scopeClientId(param?: string | null): Promise<string | undefined> {
  if (param === "all") return undefined;
  if (param && UUID.test(param)) return param;
  const v = (await cookies()).get(SCOPE_COOKIE)?.value;
  return v && UUID.test(v) ? v : undefined;
}
