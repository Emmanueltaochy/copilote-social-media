"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { eq } from "drizzle-orm";
import { db, directoryEntries } from "@/db";
import { currentDirection } from "@/lib/auth";
import { synchroniser } from "@/lib/etape3";
import { ficheDe } from "@/lib/releves";

/*
 * Les liens manuels de la fiche avec Trello, GoCardless et l'agenda
 * (direction seulement). Ils sont enregistrés dans `links` de la fiche, puis
 * le relevé du service est relancé pour que la fiche se mette à jour. Rien
 * n'est écrit chez Trello, GoCardless ni dans l'agenda.
 *
 * Formulaires simples (FormData) : la fiche est rendue côté serveur.
 */

const ID = /^[0-9a-f-]{36}$/i;
const EXTERNE = /^[A-Za-z0-9_-]{1,64}$/;

/** La fiche visée par le formulaire : celle d'un prospect, ou celle d'un client (créée si besoin). */
async function fiche(formData: FormData) {
  const entryId = String(formData.get("entryId") ?? "");
  const clientId = String(formData.get("clientId") ?? "");
  if (entryId && ID.test(entryId)) return entryId;
  if (clientId && ID.test(clientId)) return ficheDe({ entryId: null, clientId });
  return null;
}

async function majLiens(id: string, f: (l: NonNullable<(typeof directoryEntries.$inferSelect)["links"]>) => typeof l) {
  await db.transaction(async (tx) => {
    const [e] = await tx.select({ links: directoryEntries.links }).from(directoryEntries).where(eq(directoryEntries.id, id)).for("update");
    if (!e) return;
    await tx.update(directoryEntries).set({ links: f({ ...(e.links ?? {}) }), updatedAt: new Date() }).where(eq(directoryEntries.id, id));
  });
}

const chemin = (formData: FormData) => {
  const c = String(formData.get("chemin") ?? "");
  return /^\/contacts\/[0-9a-f-]{36}$/i.test(c) ? c : "/contacts";
};

export async function relierCarteTrello(formData: FormData): Promise<void> {
  if (!(await currentDirection())) return;
  const carte = String(formData.get("carte") ?? "");
  const id = await fiche(formData);
  if (!id || !EXTERNE.test(carte)) return;
  // Une carte n'a qu'une fiche : retirée des liens manuels des autres.
  const autres = await db.select({ id: directoryEntries.id, links: directoryEntries.links }).from(directoryEntries);
  for (const a of autres) if (a.id !== id && a.links?.trelloCartes?.includes(carte)) await majLiens(a.id, (l) => ({ ...l, trelloCartes: (l.trelloCartes ?? []).filter((x) => x !== carte) }));
  await majLiens(id, (l) => ({ ...l, trelloCartes: [...new Set([...(l.trelloCartes ?? []), carte])], trelloExclues: (l.trelloExclues ?? []).filter((x) => x !== carte) }));
  after(() => synchroniser("trello").catch(() => undefined));
  revalidatePath(chemin(formData));
}

export async function delierCarteTrello(formData: FormData): Promise<void> {
  if (!(await currentDirection())) return;
  const carte = String(formData.get("carte") ?? "");
  const id = await fiche(formData);
  if (!id || !EXTERNE.test(carte)) return;
  await majLiens(id, (l) => ({ ...l, trelloCartes: (l.trelloCartes ?? []).filter((x) => x !== carte), trelloExclues: [...new Set([...(l.trelloExclues ?? []), carte])] }));
  after(() => synchroniser("trello").catch(() => undefined));
  revalidatePath(chemin(formData));
}

export async function relierClientGoCardless(formData: FormData): Promise<void> {
  if (!(await currentDirection())) return;
  const client = String(formData.get("client") ?? "");
  const id = await fiche(formData);
  if (!id || !EXTERNE.test(client)) return;
  await majLiens(id, (l) => ({ ...l, gocardlessCustomerId: client, gocardlessExclus: (l.gocardlessExclus ?? []).filter((x) => x !== client) }));
  after(() => synchroniser("gocardless").catch(() => undefined));
  revalidatePath(chemin(formData));
}

export async function delierClientGoCardless(formData: FormData): Promise<void> {
  if (!(await currentDirection())) return;
  const client = String(formData.get("client") ?? "");
  const id = await fiche(formData);
  if (!id || !EXTERNE.test(client)) return;
  await majLiens(id, (l) => {
    const { gocardlessCustomerId, ...reste } = l;
    return { ...reste, ...(gocardlessCustomerId && gocardlessCustomerId !== client ? { gocardlessCustomerId } : {}), gocardlessExclus: [...new Set([...(l.gocardlessExclus ?? []), client])] };
  });
  after(() => synchroniser("gocardless").catch(() => undefined));
  revalidatePath(chemin(formData));
}

export async function enregistrerMotsAgenda(formData: FormData): Promise<void> {
  if (!(await currentDirection())) return;
  const mots = String(formData.get("mots") ?? "")
    .split(",")
    .map((m) => m.trim())
    .filter((m) => m.length >= 3)
    .slice(0, 8)
    .join(", ")
    .slice(0, 300);
  const id = await fiche(formData);
  if (!id) return;
  await majLiens(id, (l) => ({ ...l, calendarQuery: mots || undefined }));
  after(() => synchroniser("agenda").catch(() => undefined));
  revalidatePath(chemin(formData));
}
