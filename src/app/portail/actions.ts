"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq } from "drizzle-orm";
import { db, activity, comments, contents, contentVersions } from "@/db";
import { requireUser } from "@/lib/auth";

export type PortalFormState = { error?: string; ok?: string };

/**
 * Validation par le client, depuis son portail.
 *
 * Ces actions doublent celles de l'agence au lieu de les réutiliser, et c'est
 * délibéré : celles-ci vérifient à chaque appel que le contenu appartient bien
 * à la marque du compte connecté, et qu'il attend effectivement une réponse.
 * Un compte client ne doit pas pouvoir agir sur le contenu d'un autre en
 * changeant un identifiant dans le formulaire.
 */
async function ownContentAwaiting(id: string) {
  const user = await requireUser();
  if (user.role !== "client" || !user.clientId) return null;

  const [row] = await db
    .select()
    .from(contents)
    .where(and(eq(contents.id, id), eq(contents.clientId, user.clientId)))
    .limit(1);

  // Hors de l'état « en validation », il n'y a rien à répondre : le contenu est
  // soit encore en fabrication, soit déjà tranché.
  if (!row || row.status !== "validation") return null;
  return { user, content: row };
}

export async function clientApprove(
  _prev: PortalFormState,
  formData: FormData,
): Promise<PortalFormState> {
  const found = await ownContentAwaiting(String(formData.get("id") ?? ""));
  if (!found) return { error: "Ce contenu n'attend plus votre réponse." };
  const { user, content } = found;

  await db
    .update(contents)
    .set({ status: "pret", submittedAt: null, updatedAt: new Date() })
    .where(eq(contents.id, content.id));

  const [version] = await db
    .select()
    .from(contentVersions)
    .where(eq(contentVersions.contentId, content.id))
    .orderBy(desc(contentVersions.number))
    .limit(1);
  if (version) {
    await db
      .update(contentVersions)
      .set({ approvedAt: new Date() })
      .where(eq(contentVersions.id, version.id));
  }

  await db.insert(activity).values({
    clientId: content.clientId,
    contentId: content.id,
    actorId: user.id,
    text: `« ${content.title} » validé par le client`,
  });

  refresh(content.id);
  return { ok: `« ${content.title} » est validé. Nous programmons la publication.` };
}

export async function clientRequestChange(
  _prev: PortalFormState,
  formData: FormData,
): Promise<PortalFormState> {
  const note = String(formData.get("note") ?? "").trim();
  // Un refus sans motif fait repartir la fabrication à l'aveugle : le
  // commentaire est ce qui évite un deuxième aller-retour pour la même raison.
  if (!note) return { error: "Dites en un mot ce qui doit changer." };

  const found = await ownContentAwaiting(String(formData.get("id") ?? ""));
  if (!found) return { error: "Ce contenu n'attend plus votre réponse." };
  const { user, content } = found;

  await db
    .update(contents)
    .set({ status: "creation", submittedAt: null, updatedAt: new Date() })
    .where(eq(contents.id, content.id));

  const [version] = await db
    .select()
    .from(contentVersions)
    .where(eq(contentVersions.contentId, content.id))
    .orderBy(desc(contentVersions.number))
    .limit(1);

  await db.insert(contentVersions).values({
    contentId: content.id,
    number: (version?.number ?? 0) + 1,
    note,
    createdById: user.id,
  });
  if (version) {
    await db
      .update(contentVersions)
      .set({ rejectedAt: new Date(), rejectionReason: note })
      .where(eq(contentVersions.id, version.id));
  }

  await db.insert(comments).values({ contentId: content.id, authorId: user.id, body: note });

  await db.insert(activity).values({
    clientId: content.clientId,
    contentId: content.id,
    actorId: user.id,
    text: `Modification demandée par le client sur « ${content.title} » · ${note}`,
  });

  refresh(content.id);
  return { ok: "C'est noté, nous reprenons ce contenu." };
}

function refresh(contentId: string) {
  revalidatePath("/portail");
  for (const p of ["/", "/approbations", "/production", "/a-publier", "/avancement"]) {
    revalidatePath(p);
  }
  revalidatePath(`/contenu/${contentId}`);
}
