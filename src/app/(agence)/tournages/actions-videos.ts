"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { activity, contents, db, shoots, shootVideoComments, shootVideos } from "@/db";
import { requireDepartment } from "@/lib/auth";
import { creerContenu } from "@/lib/contenu-creation";
import { notify } from "@/lib/notify";
import {
  ajouterVideo,
  prevenirClientPublication,
  prevenirClientVideos,
  referencesDepuis,
  videoDepuisContenu,
} from "@/lib/tournages";
import { FORMATS_VIDEO, lireLiens, lirePreparation, PAROLES, STATUTS_VIDEO } from "@/lib/tournages-regles";

/*
 * Les vidéos prévues d'un tournage, côté agence. Mêmes droits que la fiche
 * du tournage : un compte de l'agence du pôle social (direction comprise).
 */

export type VideoState = { ok?: string; error?: string };

function refresh(shootId: string) {
  revalidatePath(`/tournages/${shootId}`);
  revalidatePath("/tournages");
  revalidatePath("/");
  revalidatePath("/portail", "layout");
}

const videoSchema = z.object({
  shootId: z.string().uuid(),
  id: z.string().uuid().optional().or(z.literal("")),
  title: z.string().trim().min(1, "Donnez un titre à la vidéo.").max(160),
  description: z.string().trim().max(4000).optional(),
  references: z.string().max(4000).optional(),
  script: z.string().trim().max(8000).optional(),
  speaker: z.string().optional(),
  prep: z.string().max(4000).optional(),
  duration: z.string().optional(),
  format: z.string().optional(),
  status: z.string().optional(),
});

/** Crée ou modifie une vidéo prévue (formulaire de la fiche). */
export async function enregistrerVideo(_prev: VideoState, formData: FormData): Promise<VideoState> {
  const user = await requireDepartment("social");
  const parsed = videoSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Formulaire incomplet." };
  const v = parsed.data;
  const visible = formData.get("visible") === "on";

  const [shoot] = await db.select().from(shoots).where(eq(shoots.id, v.shootId)).limit(1);
  if (!shoot) return { error: "Tournage introuvable." };

  const urls = lireLiens(v.references ?? "");
  if ((v.references ?? "").trim() && urls.length === 0) {
    return { error: "Le lien de référence doit commencer par https://" };
  }
  const duree = Number(String(v.duration ?? "").replace(",", "."));
  const champs = {
    title: v.title,
    description: v.description || null,
    script: v.script || null,
    speaker: v.speaker && PAROLES.includes(v.speaker) ? v.speaker : null,
    durationSec: Number.isFinite(duree) && duree > 0 ? Math.round(duree) : null,
    format: v.format && FORMATS_VIDEO.includes(v.format) ? v.format : null,
    visibleToClient: visible,
  };

  if (v.id) {
    const [avant] = await db
      .select()
      .from(shootVideos)
      .where(and(eq(shootVideos.id, v.id), eq(shootVideos.shootId, v.shootId)))
      .limit(1);
    if (!avant) return { error: "Cette vidéo n'existe plus : rechargez la page." };
    await db
      .update(shootVideos)
      .set({
        ...champs,
        status: v.status && STATUTS_VIDEO.includes(v.status) ? v.status : avant.status,
        references: await referencesDepuis(urls, avant.references),
        prep: lirePreparation(v.prep ?? "", avant.prep, randomUUID),
        updatedAt: new Date(),
      })
      .where(eq(shootVideos.id, avant.id));
    // Une vidéo qui sort de l'ombre sur un tournage publié est, pour le
    // client, une vidéo ajoutée.
    if (visible && !avant.visibleToClient && shoot.publishedAt) await prevenirClientVideos(shoot, [v.title]);
    refresh(v.shootId);
    return { ok: "Vidéo enregistrée." };
  }

  await ajouterVideo({
    shootId: v.shootId,
    ...champs,
    references: await referencesDepuis(urls),
    prep: lirePreparation(v.prep ?? "", [], randomUUID),
    auteurId: user.id,
  });
  refresh(v.shootId);
  return { ok: "Vidéo ajoutée." };
}

export async function supprimerVideo(formData: FormData): Promise<void> {
  await requireDepartment("social");
  const id = String(formData.get("id") ?? "");
  const shootId = String(formData.get("shootId") ?? "");
  if (!id || !shootId) return;
  await db.delete(shootVideos).where(and(eq(shootVideos.id, id), eq(shootVideos.shootId, shootId)));
  refresh(shootId);
}

/** Monte ou descend une vidéo d'un cran : l'ordre est celui du tournage. */
export async function deplacerVideo(formData: FormData): Promise<void> {
  await requireDepartment("social");
  const id = String(formData.get("id") ?? "");
  const shootId = String(formData.get("shootId") ?? "");
  const sens = formData.get("sens") === "haut" ? -1 : 1;
  if (!id || !shootId) return;
  const liste = await db
    .select({ id: shootVideos.id })
    .from(shootVideos)
    .where(eq(shootVideos.shootId, shootId))
    .orderBy(asc(shootVideos.position), asc(shootVideos.createdAt));
  const i = liste.findIndex((x) => x.id === id);
  const j = i + sens;
  if (i < 0 || j < 0 || j >= liste.length) return;
  [liste[i], liste[j]] = [liste[j], liste[i]];
  // Les positions sont réécrites de 0 à n : deux vidéos ne partagent jamais un rang.
  for (const [k, x] of liste.entries()) {
    await db.update(shootVideos).set({ position: k }).where(eq(shootVideos.id, x.id));
  }
  refresh(shootId);
}

export async function changerStatutVideo(formData: FormData): Promise<void> {
  await requireDepartment("social");
  const id = String(formData.get("id") ?? "");
  const shootId = String(formData.get("shootId") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!id || !shootId || !STATUTS_VIDEO.includes(status)) return;
  await db
    .update(shootVideos)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(shootVideos.id, id), eq(shootVideos.shootId, shootId)));
  refresh(shootId);
}

/* ------------------------------------------------- publication au client -- */

/** Publie le tournage au client : il apparaît dans son portail, et il est prévenu. */
export async function publierTournage(formData: FormData): Promise<void> {
  const user = await requireDepartment("social");
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const [shoot] = await db
    .update(shoots)
    .set({ publishedAt: new Date() })
    .where(and(eq(shoots.id, id), isNull(shoots.publishedAt)))
    .returning();
  // Déjà publié (double clic, deux onglets) : rien à refaire, personne à re-prévenir.
  if (!shoot) return refresh(id);
  const visibles = await db
    .select({ id: shootVideos.id })
    .from(shootVideos)
    .where(and(eq(shootVideos.shootId, id), eq(shootVideos.visibleToClient, true)));
  await db.insert(activity).values({ clientId: shoot.clientId, actorId: user.id, text: `Tournage « ${shoot.title} » publié au client` });
  await prevenirClientPublication(shoot, visibles.length);
  refresh(id);
}

/** Repasse le tournage en brouillon interne : il disparaît du portail. */
export async function depublierTournage(formData: FormData): Promise<void> {
  const user = await requireDepartment("social");
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const [shoot] = await db.update(shoots).set({ publishedAt: null }).where(eq(shoots.id, id)).returning();
  if (shoot) {
    await db.insert(activity).values({ clientId: shoot.clientId, actorId: user.id, text: `Tournage « ${shoot.title} » repassé en brouillon interne` });
  }
  refresh(id);
}

/* ------------------------------------------------ liens avec les contenus -- */

/** « Partir d'une idée ou d'un contenu » : la vidéo reprend son titre, son format et ses liens de référence. */
export async function ajouterDepuisContenu(_prev: VideoState, formData: FormData): Promise<VideoState> {
  const user = await requireDepartment("social");
  const shootId = String(formData.get("shootId") ?? "");
  const contentId = String(formData.get("contentId") ?? "");
  if (!shootId || !contentId) return { error: "Choisissez un tournage et un contenu." };
  try {
    const { shoot } = await videoDepuisContenu(shootId, contentId, user.id);
    refresh(shootId);
    revalidatePath(`/contenu/${contentId}`);
    return { ok: `Ajoutée au tournage « ${shoot.title} ».` };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/** Relie une vidéo prévue à un contenu existant du client (ou la délie). */
export async function relierContenu(formData: FormData): Promise<void> {
  await requireDepartment("social");
  const id = String(formData.get("id") ?? "");
  const shootId = String(formData.get("shootId") ?? "");
  const contentId = String(formData.get("contentId") ?? "");
  if (!id || !shootId) return;
  const [shoot] = await db.select().from(shoots).where(eq(shoots.id, shootId)).limit(1);
  if (!shoot) return;
  if (contentId) {
    const [c] = await db
      .select({ id: contents.id })
      .from(contents)
      .where(and(eq(contents.id, contentId), eq(contents.clientId, shoot.clientId)))
      .limit(1);
    if (!c) return;
    await db.update(contents).set({ shootId }).where(eq(contents.id, c.id));
  }
  await db
    .update(shootVideos)
    .set({ contentId: contentId || null, updatedAt: new Date() })
    .where(and(eq(shootVideos.id, id), eq(shootVideos.shootId, shootId)));
  refresh(shootId);
}

/**
 * Crée le contenu que la vidéo deviendra : une idée dans la production, avec
 * le titre, le format, les liens de référence et, en consigne interne, la
 * description et le script.
 */
export async function creerContenuDepuisVideo(formData: FormData): Promise<void> {
  const user = await requireDepartment("social");
  const id = String(formData.get("id") ?? "");
  const shootId = String(formData.get("shootId") ?? "");
  const [ligne] = await db
    .select({ video: shootVideos, shoot: shoots })
    .from(shootVideos)
    .innerJoin(shoots, eq(shoots.id, shootVideos.shootId))
    .where(and(eq(shootVideos.id, id), eq(shootVideos.shootId, shootId)))
    .limit(1);
  if (!ligne || ligne.video.contentId) return;
  const { video, shoot } = ligne;
  const kind = (video.format && FORMATS_VIDEO.includes(video.format) ? video.format : "reel") as "reel";
  const consignes = [
    `Vidéo prévue au tournage « ${shoot.title} ».`,
    video.description ? `\n${video.description}` : null,
    video.script ? `\nScript :\n${video.script}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  const contenu = await creerContenu({
    clientId: shoot.clientId,
    title: video.title,
    kind,
    networks: ["instagram"],
    instructions: consignes,
    auteurId: user.id,
    journal: `Contenu « ${video.title} » créé depuis le tournage « ${shoot.title} »`,
    liens: video.references.map((r) => ({ url: r.url, label: "Référence du tournage" })),
  });
  await db.update(contents).set({ shootId }).where(eq(contents.id, contenu.id));
  await db.update(shootVideos).set({ contentId: contenu.id, updatedAt: new Date() }).where(eq(shootVideos.id, video.id));
  refresh(shootId);
  revalidatePath("/production");
}

/* ----------------------------------------------------- réponse au client -- */

/** L'équipe répond à une question du client sur une vidéo : le client la lit dans son portail. */
export async function repondreVideo(formData: FormData): Promise<void> {
  const user = await requireDepartment("social");
  const id = String(formData.get("id") ?? "");
  const shootId = String(formData.get("shootId") ?? "");
  const body = String(formData.get("body") ?? "").trim().slice(0, 2000);
  if (!id || !shootId || !body) return;
  const [v] = await db
    .select({ id: shootVideos.id, title: shootVideos.title, visible: shootVideos.visibleToClient, shoot: shoots })
    .from(shootVideos)
    .innerJoin(shoots, eq(shoots.id, shootVideos.shootId))
    .where(and(eq(shootVideos.id, id), eq(shootVideos.shootId, shootId)))
    .limit(1);
  if (!v) return;
  await db.insert(shootVideoComments).values({ videoId: v.id, authorId: user.id, body });
  // Le client lit la réponse dans son portail ; pas de courriel pour une
  // réponse : seuls la publication du tournage et les vidéos ajoutées en
  // envoient.
  if (v.visible && v.shoot.publishedAt) {
    await notify({
      kind: "tournage",
      title: `Réponse de l'équipe sur « ${v.title} »`,
      body: body.slice(0, 300),
      href: "/portail/tournages",
      clientId: v.shoot.clientId,
      audience: "client",
      email: false,
    });
  }
  refresh(shootId);
}
