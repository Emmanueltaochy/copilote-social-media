import "server-only";

import { activity, contentLinks, contents, contentVersions, db } from "@/db";

type Kind = "feed" | "story" | "reel" | "carrousel" | "autre";
type Reseau = "instagram" | "facebook" | "linkedin" | "tiktok" | "google";

/**
 * La création d'un contenu, commune au formulaire « Nouveau contenu » et à la
 * veille : la ligne, sa version initiale (un contenu naît en V1, sinon le
 * premier refus créerait une « V1 » qui rejette en réalité la proposition
 * d'origine), les liens de référence éventuels et la ligne du fil d'activité.
 * Les droits sont vérifiés par l'appelant.
 */
export async function creerContenu(v: {
  clientId: string;
  title: string;
  kind: Kind;
  networks: Reseau[];
  status?: "idee";
  caption?: string | null;
  instructions?: string | null;
  scheduledAt?: Date | null;
  ownerId?: string | null;
  auteurId: string;
  /** Texte du fil d'activité (par défaut « Contenu « … » créé »). */
  journal?: string;
  liens?: { url: string; label: string | null }[];
}) {
  const reseaux = v.networks.length ? v.networks : (["instagram"] as Reseau[]);
  const [content] = await db
    .insert(contents)
    .values({
      clientId: v.clientId,
      title: v.title,
      kind: v.kind,
      network: reseaux[0],
      networks: reseaux,
      status: v.status ?? "idee",
      caption: v.caption || null,
      instructions: v.instructions || null,
      scheduledAt: v.scheduledAt ?? null,
      ownerId: v.ownerId || null,
    })
    .returning();
  await db.insert(contentVersions).values({ contentId: content.id, number: 1, note: "Première proposition", createdById: v.auteurId });
  for (const l of v.liens ?? []) {
    await db.insert(contentLinks).values({ contentId: content.id, url: l.url, label: l.label, addedById: v.auteurId });
  }
  await db.insert(activity).values({ clientId: v.clientId, contentId: content.id, actorId: v.auteurId, text: v.journal ?? `Contenu « ${v.title} » créé` });
  return content;
}
