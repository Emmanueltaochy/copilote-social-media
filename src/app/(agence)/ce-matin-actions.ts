"use server";

import { inArray, sql } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { ceMatinArchives, db } from "@/db";
import { currentUser, hasDepartment } from "@/lib/auth";
import { ceMatin, colonneDe, libelle, type ColonneMatin } from "@/lib/ce-matin";

/*
 * « Traité » et « Rétablir » sur le bloc « Ce matin » de l'accueil.
 *
 * Le navigateur n'envoie que des clés. Tout le reste (l'empreinte enregistrée,
 * le libellé, le droit d'y toucher) est relu côté serveur avec les mêmes
 * requêtes que l'affichage : une clé que cette personne ne voit pas à l'écran
 * est ignorée, comme si elle n'existait pas.
 */

export type ResultatTraite = { ok: true; n: number } | { ok: false; erreur: string };

const Cles = z.array(z.string().min(3).max(200)).min(1).max(500);

/** Un compte de l'agence qui voit l'accueil (pôle social). Jamais un client du portail. */
async function membreAutorise() {
  const user = await currentUser();
  if (!user || user.role === "client" || !hasDepartment(user, "social")) return null;
  return user;
}

type Prepare =
  | { ok: false; erreur: string }
  | { ok: true; user: NonNullable<Awaited<ReturnType<typeof membreAutorise>>>; keys: string[]; vue: Awaited<ReturnType<typeof ceMatin>> };

async function preparer(cles: unknown): Promise<Prepare> {
  const user = await membreAutorise();
  if (!user) return { ok: false, erreur: "Accès refusé." };
  const parse = Cles.safeParse(cles);
  if (!parse.success) return { ok: false, erreur: "Demande invalide." };
  const keys = [...new Set(parse.data)];
  const colonnes = [...new Set(keys.map(colonneDe).filter((c): c is ColonneMatin => c !== null))];
  if (colonnes.length === 0) return { ok: false, erreur: "Demande invalide." };
  // Pas de filtre client ici : le sélecteur réduit l'écran, pas les droits.
  const vue = await ceMatin(user, new Date(), undefined, colonnes);
  return { ok: true, user, keys, vue };
}

/** Archive des lignes visibles (« Traité », ou « Tout marquer traité »). */
export async function marquerTraite(cles: string[]): Promise<ResultatTraite> {
  const p = await preparer(cles);
  if (!p.ok) return { ok: false, erreur: p.erreur };
  const { user, keys, vue } = p;

  const visibles = new Map(
    [...vue.repondre.lignes, ...(vue.argent?.lignes ?? []), ...vue.actions.lignes].map((l) => [l.key, l]),
  );
  const lignes = keys.map((k) => visibles.get(k)).filter((l) => l !== undefined);
  if (lignes.length === 0) return { ok: false, erreur: "Cette ligne n'est plus à traiter." };

  const now = new Date();
  await db
    .insert(ceMatinArchives)
    .values(
      lignes.map((l) => ({
        key: l.key,
        column: colonneDe(l.key)!,
        state: l.etat,
        label: libelle(l),
        archivedBy: user.id,
        archivedAt: now,
      })),
    )
    .onConflictDoUpdate({
      target: ceMatinArchives.key,
      set: {
        column: sql`excluded.column`,
        state: sql`excluded.state`,
        label: sql`excluded.label`,
        archivedBy: sql`excluded.archived_by`,
        archivedAt: sql`excluded.archived_at`,
      },
    });

  refresh();
  return { ok: true, n: lignes.length };
}

/** Rétablit des lignes archivées (« Rétablir », ou « Annuler » juste après). */
export async function retablir(cles: string[]): Promise<ResultatTraite> {
  const p = await preparer(cles);
  if (!p.ok) return { ok: false, erreur: p.erreur };
  const { keys, vue } = p;

  const archivees = new Set(
    [...vue.repondre.archivees, ...(vue.argent?.archivees ?? []), ...vue.actions.archivees].map((l) => l.key),
  );
  const aRetablir = keys.filter((k) => archivees.has(k));
  if (aRetablir.length === 0) return { ok: false, erreur: "Rien à rétablir." };

  await db.delete(ceMatinArchives).where(inArray(ceMatinArchives.key, aRetablir));

  refresh();
  return { ok: true, n: aRetablir.length };
}
