"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, desc } from "drizzle-orm";
import { z } from "zod";
import { db, activity, assets, assetUsages, comments, contents, contentVersions } from "@/db";
import { requireStaff } from "@/lib/auth";
import { CONTENT_STAGES } from "@/data/content";

const STAGES = CONTENT_STAGES as readonly string[];

const contentSchema = z.object({
  clientId: z.string().uuid("Choisis un client."),
  title: z.string().trim().min(1, "Le titre est obligatoire."),
  kind: z.enum(["feed", "story", "reel", "carrousel", "autre"]),
  network: z.enum(["instagram", "facebook", "linkedin", "tiktok", "google"]),
  scheduledAt: z.string().optional(),
  caption: z.string().optional(),
  ownerId: z.string().uuid().optional().or(z.literal("")),
});

export type ContentFormState = { error?: string };

/** Rafraîchit tous les écrans qui comptent les contenus. */
function revalidateAll(id?: string) {
  for (const p of ["/", "/calendrier", "/production", "/a-publier", "/approbations", "/avancement", "/rapports"]) {
    revalidatePath(p);
  }
  if (id) revalidatePath(`/contenu/${id}`);
}

export async function createContent(
  _prev: ContentFormState,
  formData: FormData,
): Promise<ContentFormState> {
  const user = await requireStaff();

  const parsed = contentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Formulaire incomplet." };
  }
  const v = parsed.data;

  const [content] = await db
    .insert(contents)
    .values({
      clientId: v.clientId,
      title: v.title,
      kind: v.kind,
      network: v.network,
      status: "idee",
      caption: v.caption || null,
      // Une date vide est légitime : une idée n'a pas encore de créneau.
      scheduledAt: v.scheduledAt ? new Date(v.scheduledAt) : null,
      // Sans responsable désigné, le contenu revient à toute l'équipe. Le
      // rattacher d'office à celui qui l'a saisi laisserait croire qu'il s'en
      // occupe, alors que saisir une idée n'est pas la prendre en charge.
      ownerId: v.ownerId || null,
    })
    .returning();

  // Un contenu naît en V1. Sans cette version initiale, le premier refus
  // créerait une « V1 » alors qu'il rejette en réalité la proposition
  // d'origine : le compte des allers-retours serait décalé d'un cran.
  await db.insert(contentVersions).values({
    contentId: content.id,
    number: 1,
    note: "Première proposition",
    createdById: user.id,
  });

  await db.insert(activity).values({
    clientId: v.clientId,
    contentId: content.id,
    actorId: user.id,
    text: `Contenu « ${v.title} » créé`,
  });

  revalidateAll(content.id);
  redirect(`/contenu/${content.id}`);
}

export async function updateContent(
  _prev: ContentFormState,
  formData: FormData,
): Promise<ContentFormState> {
  await requireStaff();
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Contenu introuvable." };

  const parsed = contentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Formulaire incomplet." };
  }
  const v = parsed.data;

  await db
    .update(contents)
    .set({
      title: v.title,
      kind: v.kind,
      network: v.network,
      caption: v.caption || null,
      scheduledAt: v.scheduledAt ? new Date(v.scheduledAt) : null,
      ownerId: v.ownerId || null,
      updatedAt: new Date(),
    })
    .where(eq(contents.id, id));

  revalidateAll(id);
  return {};
}

/**
 * Déplace un contenu d'une étape à l'autre.
 *
 * Deux dates sont posées au passage, parce qu'elles ne peuvent pas être
 * reconstituées après coup : le moment où le client a été sollicité, qui
 * détermine son délai d'attente, et le moment de la publication.
 */
export async function moveStage(formData: FormData): Promise<void> {
  const user = await requireStaff();
  const id = String(formData.get("id") ?? "");
  const stage = String(formData.get("stage") ?? "");
  if (!id || !STAGES.includes(stage)) return;

  const [before] = await db.select().from(contents).where(eq(contents.id, id)).limit(1);
  if (!before) return;

  const patch: Record<string, unknown> = {
    status: stage,
    updatedAt: new Date(),
  };
  if (stage === "validation" && !before.submittedAt) patch.submittedAt = new Date();
  // Revenir en arrière remet le compteur d'attente à zéro : le client n'attend
  // plus quelque chose qu'on a repris en main.
  if (stage !== "validation") patch.submittedAt = null;

  await db.update(contents).set(patch).where(eq(contents.id, id));

  await db.insert(activity).values({
    clientId: before.clientId,
    contentId: id,
    actorId: user.id,
    text: `« ${before.title} » déplacé vers ${stage}`,
  });

  revalidateAll(id);
}

/**
 * Marque un contenu comme publié.
 *
 * Le lien est exigé : sans lui, « publié » n'est qu'une déclaration. C'est
 * cette date qui alimente le compteur d'engagement du mois, donc elle doit
 * correspondre à quelque chose de vérifiable.
 */
export async function markPublished(formData: FormData): Promise<void> {
  const user = await requireStaff();
  const id = String(formData.get("id") ?? "");
  const url = String(formData.get("url") ?? "").trim();
  if (!id || !url) return;

  const [before] = await db.select().from(contents).where(eq(contents.id, id)).limit(1);
  if (!before) return;

  await db
    .update(contents)
    .set({
      status: "publie",
      publishedAt: new Date(),
      publishedUrl: url,
      publishedById: user.id,
      updatedAt: new Date(),
    })
    .where(eq(contents.id, id));

  await db.insert(activity).values({
    clientId: before.clientId,
    contentId: id,
    actorId: user.id,
    text: `« ${before.title} » publié`,
  });

  revalidateAll(id);
}

/** Annule une publication saisie par erreur. */
export async function unmarkPublished(formData: FormData): Promise<void> {
  await requireStaff();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await db
    .update(contents)
    .set({ status: "pret", publishedAt: null, publishedUrl: null, publishedById: null })
    .where(eq(contents.id, id));
  revalidateAll(id);
}

/** Valide : le contenu passe de la validation à « prêt à publier ». */
export async function approveContent(formData: FormData): Promise<void> {
  const user = await requireStaff();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const [before] = await db.select().from(contents).where(eq(contents.id, id)).limit(1);
  if (!before) return;

  await db
    .update(contents)
    .set({ status: "pret", submittedAt: null, updatedAt: new Date() })
    .where(eq(contents.id, id));

  const [version] = await db
    .select()
    .from(contentVersions)
    .where(eq(contentVersions.contentId, id))
    .orderBy(desc(contentVersions.number))
    .limit(1);
  if (version) {
    await db
      .update(contentVersions)
      .set({ approvedAt: new Date() })
      .where(eq(contentVersions.id, version.id));
  }

  await db.insert(activity).values({
    clientId: before.clientId,
    contentId: id,
    actorId: user.id,
    text: `« ${before.title} » validé`,
  });

  revalidateAll(id);
}

/**
 * Demande une modification. Le motif est enregistré : c'est en les comptant
 * qu'on voit ce qui fait vraiment repasser les contenus.
 */
export async function requestChange(formData: FormData): Promise<void> {
  const user = await requireStaff();
  const id = String(formData.get("id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  if (!id) return;

  const [before] = await db.select().from(contents).where(eq(contents.id, id)).limit(1);
  if (!before) return;

  await db
    .update(contents)
    .set({ status: "creation", submittedAt: null, updatedAt: new Date() })
    .where(eq(contents.id, id));

  const [version] = await db
    .select()
    .from(contentVersions)
    .where(eq(contentVersions.contentId, id))
    .orderBy(desc(contentVersions.number))
    .limit(1);

  // Une nouvelle version marque le nouvel aller-retour : sans elle, on perdrait
  // le compte des reprises, qui est ce qui coûte cher.
  await db.insert(contentVersions).values({
    contentId: id,
    number: (version?.number ?? 0) + 1,
    note: reason || null,
    createdById: user.id,
  });
  if (version) {
    await db
      .update(contentVersions)
      .set({ rejectedAt: new Date(), rejectionReason: reason || null })
      .where(eq(contentVersions.id, version.id));
  }

  if (note) {
    await db.insert(comments).values({ contentId: id, authorId: user.id, body: note });
  }

  await db.insert(activity).values({
    clientId: before.clientId,
    contentId: id,
    actorId: user.id,
    text: `Modification demandée sur « ${before.title} »${reason ? ` · ${reason}` : ""}`,
  });

  revalidateAll(id);
}

export async function addComment(formData: FormData): Promise<void> {
  const user = await requireStaff();
  const id = String(formData.get("id") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!id || !body) return;
  await db.insert(comments).values({ contentId: id, authorId: user.id, body });
  revalidatePath(`/contenu/${id}`);
}

export async function deleteContent(formData: FormData): Promise<void> {
  await requireStaff();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const [before] = await db.select().from(contents).where(eq(contents.id, id)).limit(1);
  await db.delete(contents).where(and(eq(contents.id, id)));
  revalidateAll();
  redirect(before ? "/production" : "/production");
}

/* ------------------------------------------------------ visuel du contenu -- */

/**
 * Rattache un média déjà importé à un contenu.
 *
 * Le média n'est pas recopié : c'est le même fichier que dans la
 * bibliothèque. Une photo de tournage sert souvent à plusieurs publications,
 * et la dupliquer ferait diverger les droits d'image attachés à l'une et pas
 * à l'autre.
 */
export async function attachAsset(formData: FormData): Promise<void> {
  await requireStaff();
  const contentId = String(formData.get("contentId") ?? "");
  const assetId = String(formData.get("assetId") ?? "");
  if (!contentId || !assetId) return;

  const [content] = await db.select().from(contents).where(eq(contents.id, contentId)).limit(1);
  const [asset] = await db.select().from(assets).where(eq(assets.id, assetId)).limit(1);
  // Un média appartient à une marque : le rattacher au contenu d'une autre
  // le ferait apparaître dans le mauvais portail client.
  if (!content || !asset || asset.clientId !== content.clientId) return;

  await db.insert(assetUsages).values({ contentId, assetId }).onConflictDoNothing();
  revalidateAll(contentId);
}

export async function detachAsset(formData: FormData): Promise<void> {
  await requireStaff();
  const contentId = String(formData.get("contentId") ?? "");
  const assetId = String(formData.get("assetId") ?? "");
  if (!contentId || !assetId) return;
  // Seul le lien disparaît : le média reste dans la bibliothèque.
  await db
    .delete(assetUsages)
    .where(and(eq(assetUsages.contentId, contentId), eq(assetUsages.assetId, assetId)));
  revalidateAll(contentId);
}

/**
 * Assigne un contenu, ou le remet à toute l'équipe.
 *
 * L'absence de responsable veut dire « toute l'équipe », pas « oublié » :
 * beaucoup de contenus se traitent à plusieurs et n'ont personne à nommer.
 * C'est l'étape du pipeline qui dit ce qui reste à faire, pas le nom.
 */
export async function assignContent(formData: FormData): Promise<void> {
  await requireStaff();
  const id = String(formData.get("id") ?? "");
  const ownerId = String(formData.get("ownerId") ?? "");
  if (!id) return;

  await db
    .update(contents)
    .set({ ownerId: ownerId || null, updatedAt: new Date() })
    .where(eq(contents.id, id));

  revalidateAll(id);
}
