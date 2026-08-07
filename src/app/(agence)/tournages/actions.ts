"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  gearPresets,
  shootCrew,
  shootDeliverables,
  shootGear,
  shootRights,
  shoots,
  shots,
} from "@/db";
import { requireStaff } from "@/lib/auth";
import { SHOOT_STATUSES } from "@/data/shoot";

export type ShootFormState = { error?: string };

function refresh(id?: string) {
  revalidatePath("/tournages");
  revalidatePath("/");
  if (id) revalidatePath(`/tournages/${id}`);
}

const shootSchema = z.object({
  clientId: z.string().uuid("Choisis un client."),
  title: z.string().trim().min(1, "Donne un titre au tournage."),
  place: z.string().trim().optional(),
  startsAt: z.string().min(1, "Le créneau de départ est obligatoire."),
  endsAt: z.string().optional(),
});

export async function createShoot(
  _prev: ShootFormState,
  formData: FormData,
): Promise<ShootFormState> {
  await requireStaff();

  const parsed = shootSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Formulaire incomplet." };
  const v = parsed.data;

  const startsAt = new Date(v.startsAt);
  const endsAt = v.endsAt ? new Date(v.endsAt) : null;
  // Une fin avant le début produirait une durée négative affichée partout :
  // on refuse ici plutôt que de laisser la donnée entrer.
  if (endsAt && endsAt <= startsAt) {
    return { error: "La fin du tournage doit être après le début." };
  }

  const [shoot] = await db
    .insert(shoots)
    .values({
      clientId: v.clientId,
      title: v.title,
      place: v.place || null,
      startsAt,
      endsAt,
      status: "preparation",
    })
    .returning();

  refresh(shoot.id);
  redirect(`/tournages/${shoot.id}`);
}

export async function updateShoot(formData: FormData): Promise<void> {
  await requireStaff();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const status = String(formData.get("status") ?? "");
  const place = String(formData.get("place") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();

  await db
    .update(shoots)
    .set({
      ...(SHOOT_STATUSES.includes(status as never) ? { status: status as never } : {}),
      place: place || null,
      note: note || null,
    })
    .where(eq(shoots.id, id));

  refresh(id);
}

export async function deleteShoot(formData: FormData): Promise<void> {
  await requireStaff();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await db.delete(shoots).where(eq(shoots.id, id));
  revalidatePath("/tournages");
  redirect("/tournages");
}

/* ------------------------------------------------------------- shotlist -- */

/** Position suivante dans une liste du tournage : les entrées gardent leur ordre de saisie. */
async function nextPosition(table: typeof shots | typeof shootGear | typeof shootRights | typeof shootDeliverables, shootId: string) {
  const [row] = await db
    .select({ n: sql<number>`coalesce(max(${table.position}), -1)::int` })
    .from(table)
    .where(eq(table.shootId, shootId));
  return (row?.n ?? -1) + 1;
}

export async function addShot(formData: FormData): Promise<void> {
  await requireStaff();
  const shootId = String(formData.get("shootId") ?? "");
  const label = String(formData.get("label") ?? "").trim();
  const kind = String(formData.get("kind") ?? "").trim();
  if (!shootId || !label) return;
  await db.insert(shots).values({
    shootId,
    label,
    kind: kind || null,
    position: await nextPosition(shots, shootId),
  });
  refresh(shootId);
}

/**
 * Coche ou décoche un plan. La bascule est calculée par la base : deux
 * personnes qui cochent en même temps depuis le terrain ne doivent pas
 * s'annuler l'une l'autre à cause d'un état lu quelques secondes plus tôt.
 */
export async function toggleShot(formData: FormData): Promise<void> {
  await requireStaff();
  const id = String(formData.get("id") ?? "");
  const shootId = String(formData.get("shootId") ?? "");
  if (!id) return;
  await db.update(shots).set({ done: sql`not ${shots.done}` }).where(eq(shots.id, id));
  refresh(shootId);
}

export async function removeShot(formData: FormData): Promise<void> {
  await requireStaff();
  const id = String(formData.get("id") ?? "");
  const shootId = String(formData.get("shootId") ?? "");
  if (!id) return;
  await db.delete(shots).where(eq(shots.id, id));
  refresh(shootId);
}

/* -------------------------------------------------------------- matériel -- */

export async function addGear(formData: FormData): Promise<void> {
  await requireStaff();
  const shootId = String(formData.get("shootId") ?? "");
  const label = String(formData.get("label") ?? "").trim();
  if (!shootId || !label) return;
  await db.insert(shootGear).values({
    shootId,
    label,
    state: "Non réservé",
    position: await nextPosition(shootGear, shootId),
  });
  refresh(shootId);
}

export async function toggleGear(formData: FormData): Promise<void> {
  await requireStaff();
  const id = String(formData.get("id") ?? "");
  const shootId = String(formData.get("shootId") ?? "");
  if (!id) return;
  await db
    .update(shootGear)
    .set({
      reserved: sql`not ${shootGear.reserved}`,
      state: sql`case when ${shootGear.reserved} then 'Non réservé' else 'Réservé' end`,
    })
    .where(eq(shootGear.id, id));
  refresh(shootId);
}

export async function removeGear(formData: FormData): Promise<void> {
  await requireStaff();
  const id = String(formData.get("id") ?? "");
  const shootId = String(formData.get("shootId") ?? "");
  if (!id) return;
  await db.delete(shootGear).where(eq(shootGear.id, id));
  refresh(shootId);
}

/* -------------------------------------------------------- droit à l'image -- */

export async function addRight(formData: FormData): Promise<void> {
  await requireStaff();
  const shootId = String(formData.get("shootId") ?? "");
  const person = String(formData.get("person") ?? "").trim();
  if (!shootId || !person) return;
  await db.insert(shootRights).values({
    shootId,
    person,
    state: "Non envoyée",
    position: await nextPosition(shootRights, shootId),
  });
  refresh(shootId);
}

export async function toggleRight(formData: FormData): Promise<void> {
  await requireStaff();
  const id = String(formData.get("id") ?? "");
  const shootId = String(formData.get("shootId") ?? "");
  if (!id) return;
  await db
    .update(shootRights)
    .set({
      signed: sql`not ${shootRights.signed}`,
      state: sql`case when ${shootRights.signed} then 'Non envoyée' else 'Signée' end`,
    })
    .where(eq(shootRights.id, id));
  refresh(shootId);
}

export async function removeRight(formData: FormData): Promise<void> {
  await requireStaff();
  const id = String(formData.get("id") ?? "");
  const shootId = String(formData.get("shootId") ?? "");
  if (!id) return;
  await db.delete(shootRights).where(eq(shootRights.id, id));
  refresh(shootId);
}

/* ------------------------------------------------------------- livrables -- */

export async function addDeliverable(formData: FormData): Promise<void> {
  await requireStaff();
  const shootId = String(formData.get("shootId") ?? "");
  const label = String(formData.get("label") ?? "").trim();
  const dueOn = String(formData.get("dueOn") ?? "").trim();
  if (!shootId || !label) return;
  await db.insert(shootDeliverables).values({
    shootId,
    label,
    dueOn: dueOn || null,
    position: await nextPosition(shootDeliverables, shootId),
  });
  refresh(shootId);
}

export async function toggleDeliverable(formData: FormData): Promise<void> {
  await requireStaff();
  const id = String(formData.get("id") ?? "");
  const shootId = String(formData.get("shootId") ?? "");
  if (!id) return;
  await db
    .update(shootDeliverables)
    .set({ delivered: sql`not ${shootDeliverables.delivered}` })
    .where(eq(shootDeliverables.id, id));
  refresh(shootId);
}

export async function removeDeliverable(formData: FormData): Promise<void> {
  await requireStaff();
  const id = String(formData.get("id") ?? "");
  const shootId = String(formData.get("shootId") ?? "");
  if (!id) return;
  await db.delete(shootDeliverables).where(eq(shootDeliverables.id, id));
  refresh(shootId);
}

/* ---------------------------------------------------------------- équipe -- */

export async function addCrew(formData: FormData): Promise<void> {
  await requireStaff();
  const shootId = String(formData.get("shootId") ?? "");
  const userId = String(formData.get("userId") ?? "");
  const roleLabel = String(formData.get("roleLabel") ?? "").trim();
  if (!shootId || !userId) return;
  // Assigner deux fois la même personne n'est pas une erreur à signaler :
  // c'est un double clic, et le résultat voulu est déjà là.
  await db
    .insert(shootCrew)
    .values({ shootId, userId, roleLabel: roleLabel || null, state: "À confirmer" })
    .onConflictDoNothing();
  refresh(shootId);
}

export async function toggleCrew(formData: FormData): Promise<void> {
  await requireStaff();
  const shootId = String(formData.get("shootId") ?? "");
  const userId = String(formData.get("userId") ?? "");
  if (!shootId || !userId) return;
  await db
    .update(shootCrew)
    .set({ state: sql`case when ${shootCrew.state} = 'Confirmé' then 'À confirmer' else 'Confirmé' end` })
    .where(and(eq(shootCrew.shootId, shootId), eq(shootCrew.userId, userId)));
  refresh(shootId);
}

export async function removeCrew(formData: FormData): Promise<void> {
  await requireStaff();
  const shootId = String(formData.get("shootId") ?? "");
  const userId = String(formData.get("userId") ?? "");
  if (!shootId || !userId) return;
  await db.delete(shootCrew).where(and(eq(shootCrew.shootId, shootId), eq(shootCrew.userId, userId)));
  refresh(shootId);
}

/* ----------------------------------------------- matériel personnel -- */

/**
 * Ajoute une ligne à sa propre liste de matériel.
 *
 * La liste appartient à la personne, jamais à l'agence : le sac d'un cadreur
 * n'est pas celui d'un photographe, et une liste commune obligerait chacun à
 * trier ce qui ne le concerne pas.
 */
export async function addGearPreset(formData: FormData): Promise<void> {
  const user = await requireStaff();
  const label = String(formData.get("label") ?? "").trim();
  const shootId = String(formData.get("shootId") ?? "");
  if (!label) return;

  const [row] = await db
    .select({ n: sql<number>`coalesce(max(${gearPresets.position}), -1)::int` })
    .from(gearPresets)
    .where(eq(gearPresets.userId, user.id));

  await db
    .insert(gearPresets)
    .values({ userId: user.id, label, position: (row?.n ?? -1) + 1 });

  refresh(shootId);
}

export async function removeGearPreset(formData: FormData): Promise<void> {
  const user = await requireStaff();
  const id = String(formData.get("id") ?? "");
  const shootId = String(formData.get("shootId") ?? "");
  if (!id) return;
  // La condition sur le propriétaire est dans la requête : aucun chemin
  // d'appel ne peut l'oublier, et personne n'efface la liste d'un autre.
  await db.delete(gearPresets).where(and(eq(gearPresets.id, id), eq(gearPresets.userId, user.id)));
  refresh(shootId);
}

/**
 * Verse le matériel coché de sa liste dans la fiche du tournage.
 *
 * Les lignes déjà présentes sont ignorées plutôt que dupliquées : cocher deux
 * fois le même boîtier est un geste courant, et se retrouver avec deux
 * « Boîtier A7 IV » à réserver séparément n'aiderait personne.
 */
export async function addGearFromPresets(formData: FormData): Promise<void> {
  await requireStaff();
  const shootId = String(formData.get("shootId") ?? "");
  const ids = formData.getAll("presetIds").map(String).filter(Boolean);
  if (!shootId || ids.length === 0) return;

  const chosen = await db
    .select({ label: gearPresets.label })
    .from(gearPresets)
    .where(inArray(gearPresets.id, ids));

  const existing = await db
    .select({ label: shootGear.label, position: shootGear.position })
    .from(shootGear)
    .where(eq(shootGear.shootId, shootId));

  const known = new Set(existing.map((g) => g.label));
  let position = existing.reduce((max, g) => Math.max(max, g.position), -1);

  const nouveaux = chosen
    .filter((c) => !known.has(c.label))
    .map((c) => ({ shootId, label: c.label, state: "Non réservé", position: ++position }));

  if (nouveaux.length > 0) await db.insert(shootGear).values(nouveaux);
  refresh(shootId);
}
