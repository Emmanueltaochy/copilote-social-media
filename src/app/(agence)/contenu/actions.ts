"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, desc, sql } from "drizzle-orm";
import { z } from "zod";
import { db, activity, assets, assetUsages, comments, contentLinks, contents, contentVersions } from "@/db";
import { requireStaff } from "@/lib/auth";
import { CONTENT_STAGES } from "@/data/content";
import { notify } from "@/lib/notify";

const STAGES = CONTENT_STAGES as readonly string[];

const contentSchema = z.object({
  clientId: z.string().uuid("Choisis un client."),
  title: z.string().trim().min(1, "Le titre est obligatoire."),
  kind: z.enum(["feed", "story", "reel", "carrousel", "autre"]),
  scheduledAt: z.string().optional(),
  caption: z.string().optional(),
  instructions: z.string().optional(),
  ownerId: z.string().uuid().optional().or(z.literal("")),
});

export type ContentFormState = { error?: string };

const RESEAUX = ["instagram", "facebook", "linkedin", "tiktok", "google"] as const;
type Reseau = (typeof RESEAUX)[number];

/**
 * Les réseaux cochés, dans l'ordre du formulaire.
 *
 * Lus à part du reste : « Object.fromEntries » ne garde qu'une valeur par
 * champ, et un contenu coché sur Instagram *et* Facebook n'en garderait qu'un
 * sans qu'on s'en aperçoive. Aucun coché retombe sur Instagram : un contenu
 * sans réseau n'a nulle part où partir.
 */
function reseauxDe(formData: FormData): Reseau[] {
  const cochés = formData
    .getAll("networks")
    .map(String)
    .filter((n): n is Reseau => (RESEAUX as readonly string[]).includes(n));
  return cochés.length > 0 ? cochés : ["instagram"];
}

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
  const reseaux = reseauxDe(formData);

  const [content] = await db
    .insert(contents)
    .values({
      clientId: v.clientId,
      title: v.title,
      kind: v.kind,
      network: reseaux[0],
      networks: reseaux,
      status: "idee",
      caption: v.caption || null,
      instructions: v.instructions || null,
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
  const reseaux = reseauxDe(formData);

  await db
    .update(contents)
    .set({
      title: v.title,
      kind: v.kind,
      network: reseaux[0],
      networks: reseaux,
      caption: v.caption || null,
      instructions: v.instructions || null,
      scheduledAt: v.scheduledAt ? new Date(v.scheduledAt) : null,
      // Le responsable n'est pas dans ce formulaire : il se choisit depuis la
      // carte du pipeline. L'écrire ici remettrait à zéro, à chaque
      // enregistrement de la fiche, une assignation faite ailleurs.
      ...(formData.has("ownerId") ? { ownerId: v.ownerId || null } : {}),
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

  // C'est le passage en validation qui demande une action à quelqu'un
  // d'extérieur : les autres étapes se voient sur le pipeline, et prévenir à
  // chacune ferait de la cloche un bruit de fond.
  if (stage === "validation" && before.status !== "validation") {
    await notify({
      kind: "validation_attendue",
      title: `À valider : ${before.title}`,
      body: "Un contenu attend votre validation dans votre espace.",
      href: "/portail",
      clientId: before.clientId,
      contentId: id,
      audience: "client",
    });
  }

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

  // Une publication engage l'agence vis-à-vis du client : l'équipe et le
  // client sont prévenus tous les deux, avec le lien du post en ligne.
  await notify({
    kind: "publie",
    title: `Publié : ${before.title}`,
    body: `Le contenu est en ligne.\n${url}`,
    href: `/contenu/${id}`,
    clientId: before.clientId,
    contentId: id,
    audience: "equipe",
    exceptUserId: user.id,
  });
  await notify({
    kind: "publie",
    title: `Publié : ${before.title}`,
    body: `Votre contenu est en ligne.\n${url}`,
    href: "/portail",
    clientId: before.clientId,
    contentId: id,
    audience: "client",
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

  await notify({
    kind: "valide",
    title: `Validé : ${before.title}`,
    body: "Le contenu passe en « prêt à publier ».",
    href: `/contenu/${id}`,
    clientId: before.clientId,
    contentId: id,
    audience: "owner",
    ownerId: before.ownerId,
    exceptUserId: user.id,
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

  await notify({
    kind: "modification_demandee",
    title: `À reprendre : ${before.title}`,
    body: [reason && `Motif : ${reason}`, note].filter(Boolean).join("\n\n") || undefined,
    href: `/contenu/${id}`,
    clientId: before.clientId,
    contentId: id,
    audience: "owner",
    ownerId: before.ownerId,
    exceptUserId: user.id,
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

  // La nouvelle vue se place en dernier : dans un carrousel, l'ordre est
  // celui du récit, et l'ordre d'ajout en est la première approximation.
  const [last] = await db
    .select({ n: sql<number>`coalesce(max(${assetUsages.position}), -1)::int` })
    .from(assetUsages)
    .where(eq(assetUsages.contentId, contentId));

  await db
    .insert(assetUsages)
    .values({ contentId, assetId, position: (last?.n ?? -1) + 1 })
    .onConflictDoNothing();
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
  const user = await requireStaff();
  const id = String(formData.get("id") ?? "");
  const ownerId = String(formData.get("ownerId") ?? "");
  if (!id) return;

  const [before] = await db.select().from(contents).where(eq(contents.id, id)).limit(1);
  if (!before) return;

  await db
    .update(contents)
    .set({ ownerId: ownerId || null, updatedAt: new Date() })
    .where(eq(contents.id, id));

  // On ne prévient qu'au changement, et jamais soi-même : réassigner deux
  // fois de suite ne doit pas envoyer deux messages identiques.
  if (ownerId && ownerId !== before.ownerId) {
    await notify({
      kind: "assignation",
      title: `Assigné : ${before.title}`,
      body: "Ce contenu vous revient.",
      href: `/contenu/${id}`,
      clientId: before.clientId,
      contentId: id,
      userIds: [ownerId],
      exceptUserId: user.id,
    });
  }

  revalidateAll(id);
}

/**
 * Déplace une vue dans l'ordre du carrousel.
 *
 * L'échange se fait avec la voisine plutôt que par une position absolue :
 * deux personnes qui réordonnent en même temps produiraient sinon des trous
 * ou des doublons dans la numérotation.
 */
export async function moveAsset(formData: FormData): Promise<void> {
  await requireStaff();
  const contentId = String(formData.get("contentId") ?? "");
  const assetId = String(formData.get("assetId") ?? "");
  const direction = String(formData.get("direction") ?? "");
  if (!contentId || !assetId || !["up", "down"].includes(direction)) return;

  const rows = await db
    .select({ assetId: assetUsages.assetId, position: assetUsages.position })
    .from(assetUsages)
    .where(eq(assetUsages.contentId, contentId))
    .orderBy(assetUsages.position);

  const i = rows.findIndex((r) => r.assetId === assetId);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= rows.length) return;

  // Les positions sont réécrites en entier : quelques vues par contenu, et
  // une numérotation repartie de zéro reste juste même après des suppressions.
  const reordered = [...rows];
  [reordered[i], reordered[j]] = [reordered[j], reordered[i]];

  for (const [position, row] of reordered.entries()) {
    await db
      .update(assetUsages)
      .set({ position })
      .where(and(eq(assetUsages.contentId, contentId), eq(assetUsages.assetId, row.assetId)));
  }

  revalidateAll(contentId);
}

/* --------------------------------------------------------- lien externe -- */

/**
 * Ajoute un lien vers un fichier hébergé ailleurs.
 *
 * Un montage de plusieurs gigaoctets rendu par un prestataire est déjà stocké
 * quelque part : le recopier ici ne ferait qu'une seconde copie à tenir à
 * jour. Le lien dit où regarder, et c'est tout ce dont l'équipe a besoin.
 */
export async function addLink(formData: FormData): Promise<void> {
  const user = await requireStaff();
  const contentId = String(formData.get("contentId") ?? "");
  const url = String(formData.get("url") ?? "").trim();
  const label = String(formData.get("label") ?? "").trim();
  if (!contentId || !url) return;

  // Seuls http et https : un lien « javascript: » collé dans un champ
  // deviendrait exécutable au clic pour la personne suivante.
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return;

  await db.insert(contentLinks).values({
    contentId,
    url: parsed.toString(),
    label: label || null,
    addedById: user.id,
  });
  revalidateAll(contentId);
}

export async function removeLink(formData: FormData): Promise<void> {
  await requireStaff();
  const id = String(formData.get("id") ?? "");
  const contentId = String(formData.get("contentId") ?? "");
  if (!id) return;
  await db.delete(contentLinks).where(eq(contentLinks.id, id));
  revalidateAll(contentId);
}
