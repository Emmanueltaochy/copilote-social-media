"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { activity, clients, db, directoryEntries, directoryEvents } from "@/db";
import { canSeeMoney, requireStaff } from "@/lib/auth";
import { ACTIVITES, KINDS, SOURCES, STATUTS, cleEmail, cleNomVille } from "@/lib/annuaire";

export type FicheState = { error?: string; ok?: string };

const vide = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const texte = (max: number) => z.preprocess(vide, z.string().trim().max(max).optional());

const ficheSchema = z.object({
  name: z.string().trim().min(1, "Le nom est obligatoire.").max(200),
  contactName: texte(200),
  kind: z.enum(Object.keys(KINDS) as [string, ...string[]]).default("prospect"),
  source: z.enum(Object.keys(SOURCES) as [string, ...string[]]).default("agence"),
  activity: z.enum(Object.keys(ACTIVITES) as [string, ...string[]]).default("agence"),
  status: z.preprocess(vide, z.enum(Object.keys(STATUTS) as [string, ...string[]]).optional()),
  email: z.preprocess(vide, z.string().trim().email("E-mail invalide.").max(200).optional()),
  phone: texte(60),
  website: texte(300),
  city: texte(120),
  country: texte(120),
  sector: texte(120),
  nextAction: texte(1000),
  nextActionOn: z.preprocess(vide, z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide.").optional()),
  note: texte(4000),
  tags: texte(400),
});

const etiquettes = (s?: string) =>
  (s ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 12);

/** Une fiche qui existe déjà sous cet e-mail ou ce nom et cette ville. */
async function doublon(email: string | null, nomVille: string | null, sauf?: string) {
  if (email) {
    const [f] = await db
      .select({ id: directoryEntries.id, clientId: directoryEntries.clientId, name: directoryEntries.name })
      .from(directoryEntries)
      .where(and(eq(directoryEntries.emailKey, email), sauf ? ne(directoryEntries.id, sauf) : undefined))
      .limit(1);
    if (f) return f;
  }
  if (nomVille) {
    const [f] = await db
      .select({ id: directoryEntries.id, clientId: directoryEntries.clientId, name: directoryEntries.name })
      .from(directoryEntries)
      .where(and(eq(directoryEntries.nameKey, nomVille), sauf ? ne(directoryEntries.id, sauf) : undefined))
      .limit(1);
    if (f) return f;
  }
  return null;
}

/** Nouvelle fiche : un prospect rencontré, un contact Swap'Îles, un partenaire. */
export async function creerFiche(_prev: FicheState, formData: FormData): Promise<FicheState> {
  await requireStaff();
  const parsed = ficheSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Formulaire incomplet." };
  const v = parsed.data;
  // « Client » et « ancien client » se lisent sur un compte : une fiche créée
  // ici est un prospect, un partenaire ou un contact.
  const kind = v.kind === "client" || v.kind === "ancien_client" ? "prospect" : v.kind;
  const email = cleEmail(v.email);
  const nomVille = cleNomVille(v.name, v.city);
  const existe = await doublon(email, nomVille);
  if (existe) return { error: `Une fiche existe déjà : ${existe.name}. Ouvrez-la plutôt que d'en créer une seconde.` };

  const [row] = await db
    .insert(directoryEntries)
    .values({
      name: v.name,
      contactName: v.contactName ?? null,
      kind,
      // Une fiche Swap'Îles a Swap'Îles pour activité, quelle que soit sa source.
      source: v.source,
      activity: v.source === "swapiles" ? "swapiles" : v.activity,
      status: v.status ?? null,
      email: v.email ?? null,
      phone: v.phone ?? null,
      website: v.website ?? null,
      city: v.city ?? null,
      country: v.country ?? null,
      sector: v.sector ?? null,
      nextAction: v.nextAction ?? null,
      nextActionOn: v.nextActionOn ?? null,
      note: v.note ?? null,
      tags: etiquettes(v.tags),
      emailKey: email,
      nameKey: nomVille,
      lastActivityAt: new Date(),
    })
    .returning({ id: directoryEntries.id });
  revalidatePath("/contacts");
  redirect(`/contacts/${row.id}`);
}

/**
 * La fiche d'un client se crée à sa première modification : tant qu'on n'a
 * rien ajouté, le compte client suffit.
 */
async function ficheDuClient(clientId: string) {
  const [existante] = await db.select().from(directoryEntries).where(eq(directoryEntries.clientId, clientId)).limit(1);
  if (existante) return existante;
  const [client] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
  if (!client) return null;
  const [cree] = await db
    .insert(directoryEntries)
    .values({ clientId, name: client.name, kind: "client", source: "agence", activity: "agence", nameKey: cleNomVille(client.name, null) })
    .onConflictDoNothing()
    .returning();
  if (cree) return cree;
  const [apres] = await db.select().from(directoryEntries).where(eq(directoryEntries.clientId, clientId)).limit(1);
  return apres ?? null;
}

export async function majFiche(_prev: FicheState, formData: FormData): Promise<FicheState> {
  const user = await requireStaff();
  const entryId = String(formData.get("entryId") ?? "");
  const clientId = String(formData.get("clientId") ?? "");

  const fiche = clientId
    ? await ficheDuClient(clientId)
    : (await db.select().from(directoryEntries).where(eq(directoryEntries.id, entryId)).limit(1))[0];
  if (!fiche) return { error: "Fiche introuvable." };

  // Le nom d'un client se modifie sur son compte, pas ici.
  const brut = Object.fromEntries(formData);
  const parsed = ficheSchema.safeParse({ ...brut, name: clientId ? fiche.name : brut.name });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Formulaire incomplet." };
  const v = parsed.data;
  const email = cleEmail(v.email);
  const nomVille = cleNomVille(v.name, v.city);
  if (!clientId) {
    const existe = await doublon(email, nomVille, fiche.id);
    if (existe) return { error: `Une autre fiche porte déjà cet e-mail ou ce nom dans cette ville : ${existe.name}.` };
  }
  // Pour un client, seul « partenaire » peut se poser à la main : le reste se
  // lit sur son compte (actif ou archivé).
  const kind = clientId ? (v.kind === "partenaire" ? "partenaire" : "client") : v.kind === "client" || v.kind === "ancien_client" ? fiche.kind : v.kind;

  await db
    .update(directoryEntries)
    .set({
      name: v.name,
      contactName: v.contactName ?? null,
      kind,
      source: v.source,
      activity: v.activity,
      status: v.status ?? null,
      email: v.email ?? null,
      phone: v.phone ?? null,
      website: v.website ?? null,
      city: v.city ?? null,
      country: v.country ?? null,
      sector: v.sector ?? null,
      nextAction: v.nextAction ?? null,
      nextActionOn: v.nextActionOn ?? null,
      note: v.note ?? null,
      tags: etiquettes(v.tags),
      emailKey: email,
      nameKey: nomVille,
      lastActivityAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(directoryEntries.id, fiche.id));

  if (fiche.clientId) {
    await db.insert(activity).values({ clientId: fiche.clientId, actorId: user.id, text: "a mis à jour la fiche contact" });
  }
  const adresse = `/contacts/${fiche.clientId ?? fiche.id}`;
  revalidatePath(adresse);
  revalidatePath("/contacts");
  revalidatePath("/");
  return { ok: "Fiche enregistrée." };
}

/** Relie la fiche (ou le client) à un client Abby, pour en lire les factures. */
export async function relierAbby(formData: FormData): Promise<void> {
  const user = await requireStaff();
  if (!canSeeMoney(user)) return;
  const abbyId = String(formData.get("abbyId") ?? "").trim() || null;
  const clientId = String(formData.get("clientId") ?? "");
  const entryId = String(formData.get("entryId") ?? "");
  if (clientId) {
    await db.update(clients).set({ abbyCustomerId: abbyId }).where(eq(clients.id, clientId));
    revalidatePath(`/contacts/${clientId}`);
  } else if (entryId) {
    await db.update(directoryEntries).set({ abbyCustomerId: abbyId, updatedAt: new Date() }).where(eq(directoryEntries.id, entryId));
    revalidatePath(`/contacts/${entryId}`);
  }
  revalidatePath("/");
}

/**
 * Un prospect devenu client : sa fiche rejoint le compte, avec tout son
 * historique. Si le client avait déjà une fiche, les deux fusionnent.
 */
export async function relierAuClient(formData: FormData): Promise<void> {
  const user = await requireStaff();
  const entryId = String(formData.get("entryId") ?? "");
  const clientId = String(formData.get("clientId") ?? "");
  const [fiche] = await db.select().from(directoryEntries).where(eq(directoryEntries.id, entryId)).limit(1);
  const [client] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
  if (!fiche || !client || fiche.clientId) return;

  const [dejaLa] = await db.select().from(directoryEntries).where(eq(directoryEntries.clientId, clientId)).limit(1);
  if (!dejaLa) {
    await db
      .update(directoryEntries)
      .set({ clientId, kind: "client", name: client.name, updatedAt: new Date() })
      .where(eq(directoryEntries.id, entryId));
  } else {
    await db.transaction(async (tx) => {
      // La frise suit ; les doublons d'un même événement sont ignorés.
      const evts = await tx.select().from(directoryEvents).where(eq(directoryEvents.entryId, entryId));
      if (evts.length) {
        await tx
          .insert(directoryEvents)
          .values(
            evts.map((e) => ({
              entryId: dejaLa.id,
              source: e.source,
              kind: e.kind,
              externalId: e.externalId,
              occurredAt: e.occurredAt,
              title: e.title,
              body: e.body,
              awaitingReply: e.awaitingReply,
              dueOn: e.dueOn,
              doneAt: e.doneAt,
              meta: e.meta,
            })),
          )
          .onConflictDoNothing();
      }
      // Supprimée avant la mise à jour : son identifiant d'origine (unique)
      // passe à la fiche du client.
      await tx.delete(directoryEntries).where(eq(directoryEntries.id, entryId));
      await tx
        .update(directoryEntries)
        .set({
          contactName: dejaLa.contactName ?? fiche.contactName,
          email: dejaLa.email ?? fiche.email,
          emailKey: dejaLa.emailKey ?? fiche.emailKey,
          phone: dejaLa.phone ?? fiche.phone,
          website: dejaLa.website ?? fiche.website,
          city: dejaLa.city ?? fiche.city,
          country: dejaLa.country ?? fiche.country,
          sector: dejaLa.sector ?? fiche.sector,
          source: dejaLa.source === "agence" ? fiche.source : dejaLa.source,
          note: [dejaLa.note, fiche.note].filter(Boolean).join("\n\n") || null,
          abbyCustomerId: dejaLa.abbyCustomerId ?? fiche.abbyCustomerId,
          externalSource: dejaLa.externalSource ?? fiche.externalSource,
          externalId: dejaLa.externalSource ? dejaLa.externalId : fiche.externalId,
          data: { ...fiche.data, ...dejaLa.data },
          updatedAt: new Date(),
        })
        .where(eq(directoryEntries.id, dejaLa.id));
    });
  }
  await db.insert(activity).values({ clientId, actorId: user.id, text: `a relié la fiche prospect « ${fiche.name} » à ce client` });
  revalidatePath("/contacts");
  redirect(`/contacts/${clientId}`);
}
