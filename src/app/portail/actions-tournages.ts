"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNotNull, isNull, ne } from "drizzle-orm";
import { activity, db, notifications, shoots, shootVideoComments, shootVideos } from "@/db";
import { requireUser } from "@/lib/auth";
import { enApercu } from "@/lib/portail";
import { prevenirEquipe } from "@/lib/tournages";

const LECTURE_SEULE =
  "Aperçu : vous regardez le portail de votre client en lecture seule. Seul le client peut répondre.";

export type TournageClientState = { ok?: string; error?: string };

/**
 * Les gestes du client sur ses tournages : « Je suis prêt », cocher ce qu'il
 * a préparé, poser une question. Il ne modifie jamais la description ni le
 * script.
 *
 * Chaque action relit la vraie session et vérifie, dans la requête même, que
 * la vidéo appartient à un tournage publié de SON client et qu'elle lui est
 * visible : changer un identifiant dans le formulaire ne donne accès à rien.
 * L'aperçu de l'agence (« voir comme mon client ») est en lecture seule.
 */
async function maVideo(id: string) {
  const user = await requireUser();
  if (user.role !== "client" || !user.clientId || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [row] = await db
    .select({ video: shootVideos, shoot: shoots })
    .from(shootVideos)
    .innerJoin(shoots, eq(shoots.id, shootVideos.shootId))
    .where(
      and(
        eq(shootVideos.id, id),
        eq(shootVideos.visibleToClient, true),
        eq(shoots.clientId, user.clientId),
        isNotNull(shoots.publishedAt),
        ne(shoots.status, "annule"),
      ),
    )
    .limit(1);
  return row ? { user, ...row } : null;
}

function refresh(shootId: string) {
  revalidatePath("/portail", "layout");
  revalidatePath(`/tournages/${shootId}`);
  revalidatePath("/");
}

/** « Je suis prêt » pour une vidéo, ou l'inverse (le client s'est trompé). */
export async function basculerPret(_prev: TournageClientState, formData: FormData): Promise<TournageClientState> {
  if (await enApercu()) return { error: LECTURE_SEULE };
  const t = await maVideo(String(formData.get("videoId") ?? ""));
  if (!t) return { error: "Cette vidéo n'est plus disponible : rechargez la page." };
  const { user, video, shoot } = t;
  const pret = !video.clientReadyAt;
  await db
    .update(shootVideos)
    .set(pret ? { clientReadyAt: new Date(), clientReadyById: user.id } : { clientReadyAt: null, clientReadyById: null })
    .where(eq(shootVideos.id, video.id));
  if (pret) {
    await db.insert(activity).values({
      clientId: shoot.clientId,
      actorId: user.id,
      text: `Prêt pour la vidéo « ${video.title} » : confirmé par le client`,
    });
    // Une bonne nouvelle n'a pas besoin d'un courriel : la cloche suffit.
    await prevenirEquipe(shoot, {
      title: `Client prêt : ${video.title}`,
      body: `${user.name} est prêt pour la vidéo « ${video.title} » (tournage « ${shoot.title} »).`,
      email: false,
    });
  }
  refresh(shoot.id);
  return { ok: pret ? "C'est noté : vous êtes prêt pour cette vidéo." : "C'est noté : vous n'êtes plus marqué prêt." };
}

/** Coche ou décoche une chose à préparer. */
export async function cocherPreparation(_prev: TournageClientState, formData: FormData): Promise<TournageClientState> {
  if (await enApercu()) return { error: LECTURE_SEULE };
  const t = await maVideo(String(formData.get("videoId") ?? ""));
  if (!t) return { error: "Cette vidéo n'est plus disponible : rechargez la page." };
  const item = String(formData.get("item") ?? "");
  if (!t.video.prep.some((p) => p.id === item)) return { error: "Cet élément a changé : rechargez la page." };
  const faits = new Set(t.video.prepDone);
  if (faits.has(item)) faits.delete(item);
  else faits.add(item);
  // Seuls les identifiants encore dans la liste sont gardés.
  const prepDone = t.video.prep.map((p) => p.id).filter((id) => faits.has(id));
  await db.update(shootVideos).set({ prepDone }).where(eq(shootVideos.id, t.video.id));
  refresh(t.shoot.id);
  return { ok: faits.has(item) ? "Coché." : "Décoché." };
}

/** Une question ou une remarque sur une vidéo : l'équipe est prévenue, et répond ici. */
export async function commenterVideo(_prev: TournageClientState, formData: FormData): Promise<TournageClientState> {
  if (await enApercu()) return { error: LECTURE_SEULE };
  const body = String(formData.get("body") ?? "").trim().slice(0, 2000);
  if (!body) return { error: "Écrivez votre question ou votre remarque." };
  const t = await maVideo(String(formData.get("videoId") ?? ""));
  if (!t) return { error: "Cette vidéo n'est plus disponible : rechargez la page." };
  const { user, video, shoot } = t;
  await db.insert(shootVideoComments).values({ videoId: video.id, authorId: user.id, body });
  await db.insert(activity).values({
    clientId: shoot.clientId,
    actorId: user.id,
    text: `Question posée par le client sur la vidéo « ${video.title} » · ${body.slice(0, 200)}`,
  });
  // Comme un commentaire sur un contenu : l'équipe concernée est prévenue,
  // avec le courriel qui l'accompagne d'habitude.
  await prevenirEquipe(shoot, {
    title: `Question du client : ${video.title}`,
    body: `${user.name} a écrit à propos de la vidéo « ${video.title} » (tournage « ${shoot.title} ») :\n\n« ${body} »`,
    email: true,
  });
  refresh(shoot.id);
  return { ok: "Message envoyé à l'équipe. La réponse s'affichera ici." };
}

/** Les nouveautés « tournage » ont été vues : elles ne sont plus signalées. */
export async function marquerTournagesVus(): Promise<void> {
  if (await enApercu()) return;
  const user = await requireUser();
  if (user.role !== "client") return;
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, user.id), eq(notifications.kind, "tournage"), isNull(notifications.readAt)));
}
