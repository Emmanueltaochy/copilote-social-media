import "server-only";

import { eq } from "drizzle-orm";
import { activity, clients, contents, db } from "@/db";
import { listContentMedia } from "@/db/queries";
import { networksOf } from "@/data/content";
import { listBrands, metricoolConfig, schedulePost, SCHEDULABLE } from "@/lib/metricool";
import { signedMediaUrl } from "@/lib/media-sign";

/*
 * Programmer un contenu chez Metricool : un seul chemin pour le bouton de la
 * fiche, l'assistant IA et la programmation automatique après validation.
 *
 * La règle de validation du client est vérifiée ICI, pas dans l'appelant :
 * un client « validation » ne voit jamais partir un contenu qu'il n'a pas
 * validé, quel que soit celui qui appuie sur le bouton (personne ou IA).
 */

/** « 2026-11-12T18:00:00 » dans le fuseau du client, comme Metricool l'attend. */
export function localDateTime(d: Date, timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:00`;
}

export type ScheduleResult = { ok: true; message: string; postId: string } | { ok: false; error: string };

export async function scheduleContent(
  id: string,
  actor: { userId?: string | null; label?: string | null },
): Promise<ScheduleResult> {
  const [row] = await db
    .select({ content: contents, brandId: clients.metricoolBrandId, publishMode: clients.publishMode })
    .from(contents)
    .innerJoin(clients, eq(clients.id, contents.clientId))
    .where(eq(contents.id, id))
    .limit(1);
  if (!row) return { ok: false, error: "Contenu introuvable." };
  const { content, brandId, publishMode } = row;
  if (content.publishedAt) return { ok: false, error: "Ce contenu est déjà publié." };
  if (!brandId) return { ok: false, error: "Ce client n'est relié à aucune marque Metricool (Réglages → Metricool)." };
  if (publishMode !== "confiance" && content.status !== "pret") {
    return {
      ok: false,
      error:
        "Ce client valide ses publications : le contenu doit d'abord être validé dans son portail (statut « prêt »). Envoyez-le en validation.",
    };
  }
  if (!content.scheduledAt) return { ok: false, error: "Donnez d'abord une date de publication au contenu." };
  // Pilot garde l'heure de La Réunion telle quelle (« 18:00 » est enregistré
  // 18:00 UTC) : l'instant réel est 4 h plus tôt.
  if (content.scheduledAt.getTime() - 4 * 3_600_000 < Date.now() + 5 * 60_000) {
    return { ok: false, error: "La date de publication doit être dans le futur." };
  }
  const text = (content.caption ?? "").trim();
  if (!text) return { ok: false, error: "La légende est vide : Metricool a besoin du texte de la publication." };
  if (!(await metricoolConfig())) return { ok: false, error: "Metricool n'est pas raccordé (Réglages → Metricool)." };

  const networks = networksOf(content).filter((n) => (SCHEDULABLE as readonly string[]).includes(n));
  if (!networks.length) return { ok: false, error: "Aucun des réseaux de ce contenu ne se programme via Metricool." };

  try {
    const brand = (await listBrands()).find((b) => b.id === brandId);
    if (!brand) return { ok: false, error: `Marque Metricool ${brandId} introuvable sur le compte.` };
    const missing = networks.filter((n) => !brand.networks.includes(n));
    const targets = networks.filter((n) => brand.networks.includes(n));
    if (!targets.length) return { ok: false, error: `La marque « ${brand.label} » n'a aucun de ces réseaux connectés.` };

    const media = await listContentMedia(id);
    if (!media.length && content.kind !== "autre") {
      return { ok: false, error: "Aucun visuel ni vidéo joint : ajoutez le média avant de programmer." };
    }
    // Le lien vit jusqu'à quelques jours après la publication prévue.
    const days = Math.max(7, Math.ceil((content.scheduledAt.getTime() - Date.now()) / 86_400_000) + 3);
    const mediaUrls = await Promise.all(media.map((m) => signedMediaUrl(m.asset.id, days)));
    const draft = process.env.METRICOOL_DRAFT_ONLY === "1";

    const postId = await schedulePost({
      brandId,
      timezone: brand.timezone,
      // Heure murale de La Réunion (voir plus haut), annoncée dans le fuseau de la marque.
      localDateTime: localDateTime(content.scheduledAt, "UTC"),
      text,
      networks: targets,
      mediaUrls,
      kind: content.kind,
      draft,
    });

    await db
      .update(contents)
      .set({ metricoolPostId: postId, metricoolSentAt: new Date(), updatedAt: new Date() })
      .where(eq(contents.id, id));
    await db.insert(activity).values({
      clientId: content.clientId,
      contentId: id,
      actorId: actor.userId ?? null,
      actorLabel: actor.label ?? null,
      text: `« ${content.title} » ${draft ? "envoyé en brouillon" : "programmé"} dans Metricool`,
    });
    const skipped = missing.length ? ` (${missing.join(", ")} non connecté chez Metricool, ignoré)` : "";
    return {
      ok: true,
      postId,
      message: draft
        ? `Envoyé en BROUILLON dans Metricool (préversion : rien ne sera publié)${skipped}.`
        : `Programmé dans Metricool sur ${targets.join(", ")}${skipped}. Metricool publiera à l'heure prévue.`,
    };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/**
 * Après une validation (client ou agence) : si tout est prêt — marque reliée,
 * date future, légende, média — la publication part chez Metricool sans
 * qu'on ait à y penser. Sinon, rien ne se passe : le contenu reste « prêt ».
 */
export async function autoScheduleAfterApproval(id: string) {
  const [row] = await db
    .select({ sent: contents.metricoolSentAt, brandId: clients.metricoolBrandId })
    .from(contents)
    .innerJoin(clients, eq(clients.id, contents.clientId))
    .where(eq(contents.id, id))
    .limit(1);
  if (!row || row.sent || !row.brandId) return null;
  const r = await scheduleContent(id, { label: "Programmation automatique" });
  return r.ok ? r.message : null;
}
