"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { activity, clients, contents, db } from "@/db";
import { requireStaff } from "@/lib/auth";
import { listContentMedia } from "@/db/queries";
import { networksOf } from "@/data/content";
import { listBrands, schedulePost, SCHEDULABLE } from "@/lib/metricool";
import { signedMediaUrl } from "@/lib/media-sign";

export type ProgState = { ok?: string; error?: string };

/** « 2026-11-12T18:00:00 » dans le fuseau du client, comme Metricool l'attend. */
function localDateTime(d: Date, timeZone: string) {
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

/**
 * Programme le contenu chez Metricool : texte, réseaux, date et médias dans
 * l'ordre du carrousel. La préversion n'envoie que des brouillons
 * (METRICOOL_DRAFT_ONLY=1) : un essai ne doit jamais partir chez le client.
 */
export async function programmerMetricool(_prev: ProgState, formData: FormData): Promise<ProgState> {
  const user = await requireStaff();
  const id = String(formData.get("id") ?? "");
  const [row] = await db
    .select({ content: contents, brandId: clients.metricoolBrandId })
    .from(contents)
    .innerJoin(clients, eq(clients.id, contents.clientId))
    .where(eq(contents.id, id))
    .limit(1);
  if (!row) return { error: "Contenu introuvable." };
  const { content, brandId } = row;
  if (!brandId) return { error: "Ce client n'est relié à aucune marque Metricool (Réglages → Metricool)." };
  if (!content.scheduledAt) return { error: "Donnez d'abord une date de publication au contenu." };
  if (content.scheduledAt.getTime() < Date.now() + 5 * 60_000) return { error: "La date de publication doit être dans le futur." };
  const text = (content.caption ?? "").trim();
  if (!text) return { error: "La légende est vide : Metricool a besoin du texte de la publication." };

  const networks = networksOf(content).filter((n) => (SCHEDULABLE as readonly string[]).includes(n));
  if (!networks.length) return { error: "Aucun des réseaux de ce contenu ne se programme via Metricool." };

  try {
    const brand = (await listBrands()).find((b) => b.id === brandId);
    if (!brand) return { error: `Marque Metricool ${brandId} introuvable sur le compte.` };
    const missing = networks.filter((n) => !brand.networks.includes(n));
    if (missing.length === networks.length) return { error: `La marque « ${brand.label} » n'a aucun de ces réseaux connectés.` };
    const targets = networks.filter((n) => brand.networks.includes(n));

    const media = await listContentMedia(id);
    // Le lien vit jusqu'à quelques jours après la publication prévue.
    const days = Math.max(7, Math.ceil((content.scheduledAt.getTime() - Date.now()) / 86_400_000) + 3);
    const mediaUrls = await Promise.all(media.map((m) => signedMediaUrl(m.asset.id, days)));
    const draft = process.env.METRICOOL_DRAFT_ONLY === "1";

    const postId = await schedulePost({
      brandId,
      timezone: brand.timezone,
      localDateTime: localDateTime(content.scheduledAt, brand.timezone),
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
      actorId: user.id,
      text: `« ${content.title} » ${draft ? "envoyé en brouillon" : "programmé"} dans Metricool`,
    });
    revalidatePath(`/contenu/${id}`);
    const skipped = missing.length ? ` (${missing.join(", ")} non connecté chez Metricool, ignoré)` : "";
    return {
      ok: draft
        ? `Envoyé en BROUILLON dans Metricool (préversion : rien ne sera publié)${skipped}.`
        : `Programmé dans Metricool sur ${targets.join(", ")}${skipped}. Metricool publiera à l'heure prévue.`,
    };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
