"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql as raw } from "drizzle-orm";
import { db, brands, briefFields, briefs, clientFiles, webDeliverables, webProjects } from "@/db";
import { requireUser } from "@/lib/auth";
import { majStatutBrief } from "@/app/(agence)/web/actions";
import { removeStored } from "@/lib/storage";
import { notify } from "@/lib/notify";

/**
 * Ce que le client peut écrire lui-même.
 *
 * Chaque action revérifie que l'objet touché appartient bien à son client :
 * un identifiant se devine, et un portail qui fait confiance à un champ caché
 * est un portail qui donne accès aux dossiers des autres.
 */

export type PortailWebState = { ok?: string; error?: string };

/** Répond à une question de son brief. */
export async function repondreAuBrief(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (user.role !== "client" || !user.clientId) return;

  const fieldId = String(formData.get("id") ?? "");
  const briefId = String(formData.get("briefId") ?? "");
  if (!fieldId || !briefId) return;

  const [brief] = await db.select().from(briefs).where(eq(briefs.id, briefId)).limit(1);
  if (!brief || brief.clientId !== user.clientId) return;
  // Un brouillon n'a pas été envoyé : le client n'est pas censé le connaître.
  if (brief.status === "brouillon") return;

  const [champ] = await db
    .select({ id: briefFields.id })
    .from(briefFields)
    .where(and(eq(briefFields.id, fieldId), eq(briefFields.briefId, briefId)))
    .limit(1);
  if (!champ) return;

  const valeur = String(formData.get("answer") ?? "").trim();
  await db
    .update(briefFields)
    .set({
      answer: valeur || null,
      answeredAt: valeur ? new Date() : null,
      // Vide : la réponse vient du client, pas d'un compte interne.
      answeredById: null,
    })
    .where(eq(briefFields.id, fieldId));

  await majStatutBrief(briefId);
  revalidatePath(`/portail/brief/${briefId}`);
  revalidatePath("/portail");
}

/**
 * Met à jour la charte graphique.
 *
 * Le même écran des deux côtés : le client écrit ses couleurs et ses polices,
 * l'agence complète. Deux documents séparés divergent en une semaine.
 */
export async function majCharte(formData: FormData): Promise<void> {
  const user = await requireUser();
  const clientId =
    user.role === "client" ? user.clientId : String(formData.get("clientId") ?? "");
  if (!clientId) return;
  if (user.role === "client" && user.clientId !== clientId) return;

  const couleurs = String(formData.get("palette") ?? "")
    .split(/[\s,;]+/)
    .map((c) => c.trim())
    .filter((c) => /^#?[0-9a-fA-F]{3,8}$/.test(c))
    .map((c) => (c.startsWith("#") ? c : `#${c}`))
    .slice(0, 12);

  const valeurs = {
    fonts: String(formData.get("fonts") ?? "").trim() || null,
    voice: String(formData.get("voice") ?? "").trim() || null,
    palette: couleurs,
  };

  await db
    .insert(brands)
    .values({ clientId, ...valeurs })
    .onConflictDoUpdate({ target: brands.clientId, set: valeurs });

  revalidatePath("/portail");
  revalidatePath(`/clients/${clientId}`);
}

/** Retire un fichier qu'on a soi-même déposé. */
export async function retirerFichier(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (user.role !== "client" || !user.clientId) return;

  const id = String(formData.get("id") ?? "");
  const [fichier] = await db.select().from(clientFiles).where(eq(clientFiles.id, id)).limit(1);
  if (!fichier || fichier.clientId !== user.clientId) return;
  // On ne retire que ce qu'on a déposé soi-même : les documents laissés par
  // l'agence sont dans le dossier du client sans lui appartenir.
  if (fichier.uploadedById !== user.id) return;

  await db.delete(clientFiles).where(eq(clientFiles.id, id));
  await removeStored(fichier.storagePath).catch(() => {});
  revalidatePath("/portail");
}

/**
 * Le client déclare son brief terminé.
 *
 * L'agence lit les réponses au fil de l'eau — rien n'attend ce bouton pour
 * arriver. Ce que le bouton ajoute, c'est la seule chose qu'on ne peut pas
 * deviner : la différence entre une question oubliée et une question à laquelle
 * il n'y avait rien à répondre. Sans lui, on attend une suite qui ne viendra
 * jamais.
 */
export async function terminerBrief(_prev: PortailWebState, formData: FormData): Promise<PortailWebState> {
  const user = await requireUser();
  if (user.role !== "client" || !user.clientId) return { error: "Non autorisé." };

  const briefId = String(formData.get("id") ?? "");
  const [brief] = await db.select().from(briefs).where(eq(briefs.id, briefId)).limit(1);
  if (!brief || brief.clientId !== user.clientId) return { error: "Brief introuvable." };
  if (brief.status === "brouillon") return { error: "Brief introuvable." };

  const [état] = await db
    .select({
      manquants: raw<number>`count(*) filter (where ${briefFields.required} and coalesce(${briefFields.answer}, '') = '')::int`,
    })
    .from(briefFields)
    .where(eq(briefFields.briefId, briefId));

  if (Number(état?.manquants ?? 0) > 0) {
    return {
      error: `Il reste ${état.manquants} question${Number(état.manquants) > 1 ? "s" : ""} obligatoire${Number(état.manquants) > 1 ? "s" : ""} sans réponse. Elles sont marquées d'une étoile.`,
    };
  }

  await db
    .update(briefs)
    .set({ status: "complete", completedAt: new Date() })
    .where(eq(briefs.id, briefId));

  await notify({
    kind: "message",
    title: `Brief terminé : ${brief.title}`,
    body: `${user.name} a déclaré le brief complet. Vous pouvez enchaîner.`,
    href: `/web/briefs/${brief.id}`,
    clientId: brief.clientId,
    audience: "equipe",
  });

  revalidatePath(`/portail/brief/${briefId}`);
  revalidatePath("/portail");
  revalidatePath("/web/briefs");
  return { ok: "Merci, c'est noté. Nous prenons la suite." };
}

/**
 * La réponse du client sur un livrable : valider, ou dire ce qui doit changer.
 *
 * Le motif est exigé sur un refus. Sans lui, la reprise repart à l'aveugle et
 * le même aller-retour se reproduit — c'est vrai d'un post comme d'une
 * maquette.
 */
export async function repondreAuLivrable(
  _prev: PortailWebState,
  formData: FormData,
): Promise<PortailWebState> {
  const user = await requireUser();
  if (user.role !== "client" || !user.clientId) return { error: "Non autorisé." };

  const id = String(formData.get("id") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const note = String(formData.get("note") ?? "").trim();

  const rows = await db
    .select({ livrable: webDeliverables, clientId: webProjects.clientId, projet: webProjects.name })
    .from(webDeliverables)
    .innerJoin(webProjects, eq(webProjects.id, webDeliverables.projectId))
    .where(eq(webDeliverables.id, id))
    .limit(1);
  const row = rows[0];
  if (!row || row.clientId !== user.clientId) return { error: "Livrable introuvable." };

  if (decision === "modifications" && !note) {
    return { error: "Dites en un mot ce qui doit changer : sans motif, la reprise repart à l'aveugle." };
  }

  await db
    .update(webDeliverables)
    .set({
      status: decision === "valide" ? "valide" : "modifications",
      clientNote: decision === "modifications" ? note : null,
      respondedAt: new Date(),
    })
    .where(eq(webDeliverables.id, id));

  await notify({
    kind: decision === "valide" ? "valide" : "modification_demandee",
    title:
      decision === "valide"
        ? `Validé par le client : ${row.livrable.label}`
        : `Modification demandée : ${row.livrable.label}`,
    body:
      decision === "valide"
        ? `Projet ${row.projet}.`
        : `Projet ${row.projet} — « ${note} »`,
    href: `/web/${row.livrable.projectId}`,
    clientId: row.clientId,
    audience: "equipe",
  });

  revalidatePath("/portail");
  revalidatePath(`/web/${row.livrable.projectId}`);
  return {
    ok:
      decision === "valide"
        ? "Validé, merci. Nous enchaînons."
        : "C'est noté, nous reprenons et vous revenons dessus.",
  };
}
