"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { activity, db, notifications, shootCrew, shoots, shootVideoNotes, shootVideos, users } from "@/db";
import { requireVideaste } from "@/lib/auth";
import { notify } from "@/lib/notify";
import { estDansLEquipe } from "@/lib/videaste";

/*
 * Les trois gestes du vidéaste : marquer une vidéo « tournée », laisser une
 * note de tournage, indiquer où sont les rushes. Chaque action vérifie qu'il
 * est dans l'équipe du tournage concerné, dans la requête même.
 */

export type VideasteState = { ok?: string; error?: string };

function refresh(shootId: string) {
  revalidatePath("/videaste", "layout");
  revalidatePath(`/tournages/${shootId}`);
  revalidatePath("/tournages");
}

/** La vidéo, si elle appartient à un tournage dont il fait partie. */
async function maVideo(userId: string, videoId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(videoId)) return null;
  const [row] = await db
    .select({ video: shootVideos, shoot: shoots })
    .from(shootVideos)
    .innerJoin(shoots, eq(shoots.id, shootVideos.shootId))
    .innerJoin(shootCrew, and(eq(shootCrew.shootId, shoots.id), eq(shootCrew.userId, userId)))
    .where(eq(shootVideos.id, videoId))
    .limit(1);
  return row ?? null;
}

/** « Tournée » : la vidéo est dans la boîte (ou ne l'est plus, s'il s'est trompé). */
export async function basculerTournee(_prev: VideasteState, formData: FormData): Promise<VideasteState> {
  const user = await requireVideaste();
  const t = await maVideo(user.id, String(formData.get("videoId") ?? ""));
  if (!t) return { error: "Cette vidéo n'est plus disponible : rechargez la page." };
  const tournee = t.video.status !== "tourne";
  await db
    .update(shootVideos)
    .set(
      tournee
        ? { status: "tourne", shotAt: new Date(), shotById: user.id, updatedAt: new Date() }
        : { status: "pret", shotAt: null, shotById: null, updatedAt: new Date() },
    )
    .where(eq(shootVideos.id, t.video.id));
  await db.insert(activity).values({
    clientId: t.shoot.clientId,
    actorId: user.id,
    text: tournee ? `Vidéo « ${t.video.title} » tournée (${user.name})` : `Vidéo « ${t.video.title} » repassée à tourner (${user.name})`,
  });
  refresh(t.shoot.id);
  return { ok: tournee ? "Marquée tournée." : "Repassée à tourner." };
}

/** Une note de tournage : « prise 3 la meilleure », « manque un plan produit ». Interne à l'équipe. */
export async function noterTournage(_prev: VideasteState, formData: FormData): Promise<VideasteState> {
  const user = await requireVideaste();
  const body = String(formData.get("body") ?? "").trim().slice(0, 2000);
  if (!body) return { error: "Écrivez votre note." };
  const t = await maVideo(user.id, String(formData.get("videoId") ?? ""));
  if (!t) return { error: "Cette vidéo n'est plus disponible : rechargez la page." };
  await db.insert(shootVideoNotes).values({ videoId: t.video.id, authorId: user.id, body });
  refresh(t.shoot.id);
  return { ok: "Note enregistrée : l'équipe la voit sur la fiche du tournage." };
}

/** Où sont les rushes : le lien du dossier (Drive, WeTransfer…). L'équipe interne est prévenue. */
export async function indiquerRushes(_prev: VideasteState, formData: FormData): Promise<VideasteState> {
  const user = await requireVideaste();
  const shootId = String(formData.get("shootId") ?? "");
  const url = String(formData.get("url") ?? "").trim();
  if (!(await estDansLEquipe(user.id, shootId))) return { error: "Ce tournage n'est plus disponible : rechargez la page." };
  let lien: string;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error();
    lien = u.toString().slice(0, 1000);
  } catch {
    return { error: "Collez le lien complet du dossier (il commence par https://)." };
  }
  const [shoot] = await db
    .update(shoots)
    .set({ rushesUrl: lien, rushesAt: new Date(), rushesById: user.id })
    .where(eq(shoots.id, shootId))
    .returning();
  await db.insert(activity).values({ clientId: shoot.clientId, actorId: user.id, text: `Rushes du tournage « ${shoot.title} » déposés par ${user.name}` });
  // L'équipe interne du tournage (ou toute l'équipe si personne n'y est) :
  // une notification, sans courriel.
  const internes = await db
    .select({ id: users.id })
    .from(shootCrew)
    .innerJoin(users, eq(users.id, shootCrew.userId))
    .where(and(eq(shootCrew.shootId, shootId), inArray(users.role, ["direction", "equipe"])));
  await notify({
    kind: "tournage",
    title: `Rushes déposés : ${shoot.title}`,
    body: `${user.name} a indiqué où sont les rushes.\n${lien}`,
    href: `/tournages/${shootId}`,
    clientId: shoot.clientId,
    ...(internes.length ? { userIds: internes.map((i) => i.id) } : { audience: "equipe" as const }),
    email: false,
  });
  refresh(shootId);
  return { ok: "Lien des rushes enregistré : l'équipe est prévenue." };
}

/** Les notifications vues en ouvrant « Mes tournages ». */
export async function marquerVuesVideaste(): Promise<void> {
  const user = await requireVideaste();
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, user.id), isNull(notifications.readAt)));
}
