import "server-only";

import { and, eq, gte, inArray, isNotNull, isNull, lte } from "drizzle-orm";
import { activity, clients, contents, db } from "@/db";
import { listContentMedia } from "@/db/queries";
import { networksOf } from "@/data/content";
import {
  deleteSchedulerPost,
  listBrands,
  listSchedulerPosts,
  metricoolConfig,
  schedulePost,
  SCHEDULABLE,
} from "@/lib/metricool";
import { signedMediaUrl } from "@/lib/media-sign";
import { notify } from "@/lib/notify";
import { firstBlocker, publicationChecks, realInstant, wallNow, type NetworkState } from "@/lib/publication";

/*
 * Publier depuis Pilot, par Metricool : un seul chemin pour le bouton de la
 * fiche, la page « À publier », l'assistant IA et la programmation
 * automatique après validation du client.
 *
 * La règle de validation du client est vérifiée ICI, pas dans l'appelant :
 * un client « validation » ne voit jamais partir un contenu qu'il n'a pas
 * validé, quel que soit celui qui appuie sur le bouton (personne ou IA).
 *
 * Un contenu n'a qu'une publication chez Metricool : renvoyer un contenu déjà
 * programmé retire d'abord l'ancienne (sinon le post partirait deux fois).
 */

/** « 2026-11-12T18:00:00 » dans le fuseau donné, comme Metricool l'attend. */
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
type Actor = { userId?: string | null; label?: string | null };

async function load(id: string) {
  const [row] = await db
    .select({ content: contents, brandId: clients.metricoolBrandId, publishMode: clients.publishMode })
    .from(contents)
    .innerJoin(clients, eq(clients.id, contents.clientId))
    .where(eq(contents.id, id))
    .limit(1);
  return row ?? null;
}

/** Retire l'ancienne publication chez Metricool ; « déjà absente » n'est pas une erreur. */
async function dropRemote(brandId: string, postId: string) {
  try {
    await deleteSchedulerPost(brandId, postId);
  } catch (e) {
    if (!/ 404 /.test((e as Error).message)) throw e;
  }
}

export async function scheduleContent(id: string, actor: Actor, opts: { now?: boolean } = {}): Promise<ScheduleResult> {
  const row = await load(id);
  if (!row) return { ok: false, error: "Contenu introuvable." };
  const { content, brandId, publishMode } = row;
  if (content.publishedAt || content.status === "publie") return { ok: false, error: "Ce contenu est déjà publié." };
  if (content.metricoolState === "partiel") {
    return { ok: false, error: "Une partie est déjà en ligne : renvoyer publierait ces réseaux une seconde fois. Corrigez dans Metricool." };
  }

  const media = await listContentMedia(id);
  const blocker = firstBlocker(
    publicationChecks(
      {
        ...content,
        publishMode,
        brandId,
        mediaCount: media.length,
        metricoolConnected: Boolean(await metricoolConfig()),
      },
      opts,
    ),
  );
  if (blocker) return { ok: false, error: `À régler d'abord : ${blocker.label.toLowerCase()}. ${blocker.hint ?? ""}`.trim() };

  const networks = networksOf(content).filter((n) => (SCHEDULABLE as readonly string[]).includes(n));
  try {
    const brand = (await listBrands()).find((b) => b.id === brandId);
    if (!brand) return { ok: false, error: `Marque Metricool ${brandId} introuvable sur le compte.` };
    const missing = networks.filter((n) => !brand.networks.includes(n));
    const targets = networks.filter((n) => brand.networks.includes(n));
    if (!targets.length) return { ok: false, error: `La marque « ${brand.label} » n'a aucun de ces réseaux connectés dans Metricool.` };

    // Maintenant : dans 3 minutes (Metricool refuse une heure déjà passée).
    const when = opts.now
      ? localDateTime(new Date(Date.now() + 3 * 60_000), brand.timezone)
      : // Heure murale de La Réunion, annoncée dans le fuseau de la marque.
        localDateTime(content.scheduledAt!, "UTC");
    const until = opts.now ? Date.now() : realInstant(content.scheduledAt!).getTime();
    // Le lien vit jusqu'à quelques jours après la publication prévue.
    const days = Math.max(7, Math.ceil((until - Date.now()) / 86_400_000) + 3);
    const mediaUrls = await Promise.all(media.map((m) => signedMediaUrl(m.asset.id, days)));
    const draft = process.env.METRICOOL_DRAFT_ONLY === "1";

    const replacing = content.metricoolPostId && content.metricoolPostId !== "envoyé";
    if (replacing) await dropRemote(brandId!, content.metricoolPostId!);

    const postId = await schedulePost({
      brandId: brandId!,
      timezone: brand.timezone,
      localDateTime: when,
      text: content.caption!.trim(),
      networks: targets,
      mediaUrls,
      kind: content.kind,
      draft,
    });

    const sentAt = new Date();
    await db
      .update(contents)
      .set({
        metricoolPostId: postId,
        metricoolSentAt: sentAt,
        metricoolState: draft ? "brouillon" : "programme",
        metricoolNetworks: targets.map((network) => ({ network, status: "PENDING" })),
        metricoolCheckedAt: null,
        publishBlocker: null,
        // « Publier maintenant » : le calendrier montre l'heure réelle.
        ...(opts.now ? { scheduledAt: new Date(Date.now() + 3 * 60_000 + 4 * 3_600_000) } : {}),
        updatedAt: sentAt,
      })
      .where(eq(contents.id, id));
    const verb = draft ? "envoyé en brouillon" : opts.now ? "envoyé pour publication immédiate" : replacing ? "reprogrammé (mis à jour)" : "programmé";
    await db.insert(activity).values({
      clientId: content.clientId,
      contentId: id,
      actorId: actor.userId ?? null,
      actorLabel: actor.label ?? null,
      text: `« ${content.title} » ${verb} dans Metricool`,
    });
    const skipped = missing.length ? ` (${missing.join(", ")} non connecté chez Metricool, ignoré)` : "";
    return {
      ok: true,
      postId,
      message: draft
        ? `Envoyé en BROUILLON dans Metricool (préversion : rien ne sera publié)${skipped}.`
        : opts.now
          ? `Envoyé : Metricool publie dans les minutes qui viennent sur ${targets.join(", ")}${skipped}.`
          : `${replacing ? "Mis à jour" : "Programmé"} sur ${targets.join(", ")}${skipped}. La publication partira toute seule à l'heure prévue.`,
    };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Annule la programmation : la publication est retirée de Metricool, le contenu reste « prêt ». */
export async function cancelSchedule(id: string, actor: Actor): Promise<ScheduleResult> {
  const row = await load(id);
  if (!row) return { ok: false, error: "Contenu introuvable." };
  const { content, brandId } = row;
  if (!content.metricoolPostId) return { ok: false, error: "Rien n'est programmé pour ce contenu." };
  if (content.publishedAt) return { ok: false, error: "Déjà publié : à retirer directement sur le réseau." };
  try {
    if (brandId && content.metricoolPostId !== "envoyé") await dropRemote(brandId, content.metricoolPostId);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  await db
    .update(contents)
    .set({
      metricoolPostId: null,
      metricoolSentAt: null,
      metricoolState: null,
      metricoolNetworks: [],
      metricoolCheckedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(contents.id, id));
  await db.insert(activity).values({
    clientId: content.clientId,
    contentId: id,
    actorId: actor.userId ?? null,
    actorLabel: actor.label ?? null,
    text: `Programmation de « ${content.title} » annulée`,
  });
  return { ok: true, postId: "", message: "Programmation annulée : la publication est retirée de Metricool." };
}

/**
 * Après une validation (client ou agence) : la publication part chez
 * Metricool à la date prévue, sans qu'on ait à y penser.
 *
 * Si quelque chose manque (date passée, légende vide, média absent…), rien ne
 * part — jamais de publication en retard sans qu'un humain l'ait décidé — et
 * le responsable du contenu est prévenu, avec la raison.
 *
 * Renvoie null quand le client n'est pas relié à Metricool (il publie à la main).
 */
export async function autoScheduleAfterApproval(id: string): Promise<ScheduleResult | null> {
  const row = await load(id);
  if (!row || !row.brandId || row.content.publishedAt) return null;
  const r = await scheduleContent(id, { label: "Programmation automatique" });
  if (r.ok) return r;

  await db.update(contents).set({ publishBlocker: r.error }).where(eq(contents.id, id));
  await notify({
    kind: "publication_bloquee",
    title: `À programmer à la main : ${row.content.title}`,
    body: `Le contenu est validé, mais il n'a pas pu partir tout seul chez Metricool.\nRaison : ${r.error}`,
    href: `/contenu/${id}`,
    clientId: row.content.clientId,
    contentId: id,
    audience: "owner",
    ownerId: row.content.ownerId,
  });
  return r;
}

/* ---------------------------------------------- suivi chez Metricool -- */

async function markPublishedFromMetricool(c: typeof contents.$inferSelect, nets: NetworkState[], state = "publie") {
  const url = nets.find((n) => n.network === "instagram" && n.url)?.url ?? nets.find((n) => n.url)?.url ?? null;
  await db
    .update(contents)
    .set({
      status: "publie",
      publishedAt: new Date(),
      publishedUrl: url,
      metricoolState: state,
      metricoolNetworks: nets,
      metricoolCheckedAt: new Date(),
      publishBlocker: null,
      updatedAt: new Date(),
    })
    .where(eq(contents.id, c.id));
  await db.insert(activity).values({
    clientId: c.clientId,
    contentId: c.id,
    actorLabel: "Metricool",
    text: `« ${c.title} » publié sur ${nets.filter((n) => n.status === "PUBLISHED").map((n) => n.network).join(", ")}`,
  });
  const lien = url ? `\n${url}` : "";
  await notify({
    kind: "publie",
    title: `Publié : ${c.title}`,
    body: `Le contenu est en ligne.${lien}`,
    href: `/contenu/${c.id}`,
    clientId: c.clientId,
    contentId: c.id,
    audience: "equipe",
  });
  await notify({
    kind: "publie",
    title: `Publié : ${c.title}`,
    body: `Votre contenu est en ligne.${lien}`,
    href: "/portail",
    clientId: c.clientId,
    contentId: c.id,
    audience: "client",
  });
}

/**
 * Relève chez Metricool l'état des publications programmées dont l'heure est
 * passée (ou toute proche) : publiées → le contenu passe « publié » avec son
 * lien, et l'équipe comme le client sont prévenus ; en échec → l'équipe voit
 * le problème dans « À publier » et le responsable reçoit une alerte.
 */
export async function syncPublications(opts: { contentIds?: string[] } = {}) {
  if (!(await metricoolConfig())) return { checked: 0, published: 0, errors: 0 };
  const now = wallNow();
  const rows = await db
    .select({ content: contents, brandId: clients.metricoolBrandId })
    .from(contents)
    .innerJoin(clients, eq(clients.id, contents.clientId))
    .where(
      and(
        isNotNull(contents.metricoolPostId),
        isNull(contents.publishedAt),
        isNotNull(clients.metricoolBrandId),
        inArray(contents.metricoolState, ["programme", "partiel", "erreur", "introuvable"]),
        opts.contentIds?.length
          ? inArray(contents.id, opts.contentIds)
          : and(
              gte(contents.scheduledAt, new Date(now.getTime() - 10 * 86_400_000)),
              lte(contents.scheduledAt, new Date(now.getTime() + 15 * 60_000)),
            ),
      ),
    );
  if (!rows.length) return { checked: 0, published: 0, errors: 0 };

  const brands = new Map((await listBrands()).map((b) => [b.id, b]));
  const byBrand = new Map<string, typeof rows>();
  for (const r of rows) byBrand.set(r.brandId!, [...(byBrand.get(r.brandId!) ?? []), r]);

  let published = 0;
  let errors = 0;
  for (const [brandId, list] of byBrand) {
    const brand = brands.get(brandId);
    if (!brand) continue;
    const times = list.map((r) => r.content.scheduledAt?.getTime() ?? now.getTime());
    const start = localDateTime(new Date(Math.min(...times) - 2 * 86_400_000), "UTC");
    const end = localDateTime(new Date(Math.max(...times, now.getTime()) + 2 * 86_400_000), "UTC");
    let posts;
    try {
      posts = new Map((await listSchedulerPosts(brandId, start, end, brand.timezone)).map((p) => [p.id, p]));
    } catch (e) {
      console.warn("[pilot] suivi Metricool", brand.label, (e as Error).message);
      continue;
    }

    for (const { content: c } of list) {
      const post = posts.get(c.metricoolPostId!);
      if (!post) {
        if (c.metricoolState !== "introuvable") {
          await db
            .update(contents)
            .set({ metricoolState: "introuvable", metricoolCheckedAt: new Date() })
            .where(eq(contents.id, c.id));
        }
        continue;
      }
      const nets: NetworkState[] = post.providers.map((p) => ({
        network: p.network,
        status: p.status,
        url: p.publicUrl ?? null,
        detail: p.detailedStatus ?? null,
      }));
      const done = nets.filter((n) => n.status === "PUBLISHED").length;
      const failed = nets.filter((n) => n.status === "ERROR");
      const pending = nets.filter((n) => n.status !== "PUBLISHED" && n.status !== "ERROR").length;
      const state = failed.length ? (done ? "partiel" : "erreur") : "programme";
      if (nets.length && done > 0 && pending === 0) {
        // En ligne sur au moins un réseau : c'est une publication, elle compte
        // dans l'engagement du mois. Un réseau en échec reste signalé (« partiel »).
        await markPublishedFromMetricool(c, nets, failed.length ? "partiel" : "publie");
        published++;
      } else {
        await db
          .update(contents)
          .set({ metricoolState: state, metricoolNetworks: nets, metricoolCheckedAt: new Date() })
          .where(eq(contents.id, c.id));
      }
      if (failed.length && c.metricoolState !== state) {
        errors++;
        await notify({
          kind: "publication_bloquee",
          title: `Échec de publication : ${c.title}`,
          body: `Metricool n'a pas pu publier sur ${failed.map((f) => f.network).join(", ")}.\n${failed
            .map((f) => f.detail)
            .filter(Boolean)
            .join("\n")}`.trim(),
          href: `/contenu/${c.id}`,
          clientId: c.clientId,
          contentId: c.id,
          audience: "owner",
          ownerId: c.ownerId,
        });
      }
    }
  }
  return { checked: rows.length, published, errors };
}
