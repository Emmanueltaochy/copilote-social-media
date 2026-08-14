"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { and, eq, sql as raw } from "drizzle-orm";
import {
  db,
  briefFields,
  briefs,
  users,
  webDeliverables,
  webMilestones,
  webProjects,
} from "@/db";
import { requireDepartment } from "@/lib/auth";
import { sendMail } from "@/lib/mail";
import { notify } from "@/lib/notify";
import { jalonsParDefaut, modeleBrief, PROJECT_TYPES, WEB_PHASES } from "@/data/web";

export type WebFormState = { error?: string; ok?: string };

function refresh(projectId?: string) {
  revalidatePath("/web");
  revalidatePath("/web/briefs");
  revalidatePath("/portail");
  if (projectId) revalidatePath(`/web/${projectId}`);
}

/* ------------------------------------------------------------- projets -- */

/**
 * Crée un projet, avec ses jalons.
 *
 * Les jalons du type choisi sont posés d'emblée : un projet qui démarre avec
 * une liste vide démarre sans plan, et personne ne revient l'écrire après.
 * Ils restent modifiables — c'est une proposition, pas une méthode imposée.
 */
export async function createProject(
  _prev: WebFormState,
  formData: FormData,
): Promise<WebFormState> {
  await requireDepartment("web");

  const clientId = String(formData.get("clientId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const type = String(formData.get("type") ?? "vitrine");
  const dueAt = String(formData.get("dueAt") ?? "");
  const price = Number(formData.get("price") ?? 0);

  if (!clientId) return { error: "Choisis un client." };
  if (name.length < 2) return { error: "Donne un nom au projet." };
  if (!PROJECT_TYPES.includes(type)) return { error: "Type de projet inconnu." };

  const [projet] = await db
    .insert(webProjects)
    .values({
      clientId,
      name,
      type: type as "vitrine",
      dueAt: dueAt ? new Date(dueAt) : null,
      priceCents: Number.isFinite(price) && price > 0 ? Math.round(price * 100) : 0,
    })
    .returning();

  const jalons = jalonsParDefaut(type);
  await db.insert(webMilestones).values(
    jalons.map((j, i) => ({
      projectId: projet.id,
      label: j.label,
      waitingClient: j.attendClient,
      position: i,
    })),
  );

  refresh(projet.id);
  redirect(`/web/${projet.id}`);
}

export async function updateProject(formData: FormData): Promise<void> {
  await requireDepartment("web");
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const phase = String(formData.get("phase") ?? "");
  const owner = String(formData.get("ownerId") ?? "");
  const dueAt = String(formData.get("dueAt") ?? "");
  const price = Number(formData.get("price") ?? NaN);

  await db
    .update(webProjects)
    .set({
      ...(WEB_PHASES.includes(phase) ? { phase: phase as "cadrage" } : {}),
      ...(formData.has("ownerId") ? { ownerId: owner || null } : {}),
      ...(formData.has("dueAt") ? { dueAt: dueAt ? new Date(dueAt) : null } : {}),
      ...(formData.has("price") && Number.isFinite(price)
        ? { priceCents: Math.max(0, Math.round(price * 100)) }
        : {}),
      ...(formData.has("domain") ? { domain: String(formData.get("domain") ?? "").trim() || null } : {}),
      ...(formData.has("hosting") ? { hosting: String(formData.get("hosting") ?? "").trim() || null } : {}),
      ...(formData.has("stack") ? { stack: String(formData.get("stack") ?? "").trim() || null } : {}),
      ...(formData.has("note") ? { note: String(formData.get("note") ?? "").trim() || null } : {}),
      // La mise en ligne est datée le jour où on y arrive : c'est elle qu'on
      // ressortira pour dire quand le site est parti.
      ...(phase === "en_ligne" ? { launchedAt: new Date() } : {}),
      updatedAt: new Date(),
    })
    .where(eq(webProjects.id, id));

  refresh(id);
}

export async function deleteProject(formData: FormData): Promise<void> {
  await requireDepartment("web");
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await db.delete(webProjects).where(eq(webProjects.id, id));
  refresh();
  redirect("/web");
}

/* -------------------------------------------------------------- jalons -- */

export async function addMilestone(formData: FormData): Promise<void> {
  await requireDepartment("web");
  const projectId = String(formData.get("projectId") ?? "");
  const label = String(formData.get("label") ?? "").trim();
  if (!projectId || !label) return;

  const [{ n }] = await db
    .select({ n: raw<number>`count(*)::int` })
    .from(webMilestones)
    .where(eq(webMilestones.projectId, projectId));

  await db.insert(webMilestones).values({
    projectId,
    label,
    waitingClient: formData.get("waitingClient") === "on",
    position: Number(n ?? 0),
  });
  refresh(projectId);
}

export async function toggleMilestone(formData: FormData): Promise<void> {
  await requireDepartment("web");
  const id = String(formData.get("id") ?? "");
  const projectId = String(formData.get("projectId") ?? "");
  if (!id) return;

  const [jalon] = await db.select().from(webMilestones).where(eq(webMilestones.id, id)).limit(1);
  if (!jalon) return;

  await db
    .update(webMilestones)
    .set({ done: !jalon.done, doneAt: jalon.done ? null : new Date() })
    .where(eq(webMilestones.id, id));
  refresh(projectId);
}

export async function removeMilestone(formData: FormData): Promise<void> {
  await requireDepartment("web");
  const id = String(formData.get("id") ?? "");
  const projectId = String(formData.get("projectId") ?? "");
  if (!id) return;
  await db.delete(webMilestones).where(eq(webMilestones.id, id));
  refresh(projectId);
}

/* -------------------------------------------------------------- briefs -- */

/**
 * Crée un brief à partir du modèle du type de projet.
 *
 * Les questions sont recopiées dans le brief plutôt que référencées : un
 * modèle qui évolue ne doit pas réécrire les briefs déjà envoyés, sans quoi
 * une question posée hier changerait de sens demain.
 */
export async function createBrief(
  _prev: WebFormState,
  formData: FormData,
): Promise<WebFormState> {
  const user = await requireDepartment("web");

  const clientId = String(formData.get("clientId") ?? "");
  const projectId = String(formData.get("projectId") ?? "");
  const type = String(formData.get("type") ?? "vitrine");
  const titre = String(formData.get("title") ?? "").trim();

  if (!clientId) return { error: "Choisis un client." };

  const [brief] = await db
    .insert(briefs)
    .values({
      clientId,
      projectId: projectId || null,
      title: titre || "Brief de projet web",
      intro:
        String(formData.get("intro") ?? "").trim() ||
        "Quelques questions pour cadrer votre projet. Répondez à votre rythme : tout est enregistré au fur et à mesure.",
      createdById: user.id,
    })
    .returning();

  const modèle = modeleBrief(type);
  await db.insert(briefFields).values(
    modèle.map((c, i) => ({
      briefId: brief.id,
      section: c.section,
      label: c.label,
      help: c.help ?? null,
      kind: c.kind,
      options: c.options ?? [],
      required: c.required ?? false,
      position: i,
    })),
  );

  refresh(projectId || undefined);
  redirect(`/web/briefs/${brief.id}`);
}

/** Enregistre une réponse. Côté agence : on remplit ce que le client a laissé. */
export async function answerField(formData: FormData): Promise<void> {
  const user = await requireDepartment("web");
  const id = String(formData.get("id") ?? "");
  const briefId = String(formData.get("briefId") ?? "");
  if (!id) return;

  const valeur = String(formData.get("answer") ?? "").trim();
  await db
    .update(briefFields)
    .set({
      answer: valeur || null,
      answeredAt: valeur ? new Date() : null,
      answeredById: valeur ? user.id : null,
    })
    .where(eq(briefFields.id, id));

  await majStatutBrief(briefId);
  revalidatePath(`/web/briefs/${briefId}`);
}

/**
 * Suit l'avancement d'un brief après chaque réponse.
 *
 * L'avancement se déduit — combien de réponses, combien d'obligatoires
 * manquantes — mais « complet » ne se déduit pas : c'est le client qui le
 * déclare, en bas de son questionnaire. Sans ce geste, personne ne sait si un
 * champ vide est une question oubliée ou une question à laquelle il n'y a rien
 * à répondre, et l'agence attendrait une suite qui ne viendra jamais.
 *
 * Un brief déjà déclaré terminé ne redescend pas : le client peut encore
 * préciser une réponse sans annuler ce qu'il a dit.
 */
export async function majStatutBrief(briefId: string): Promise<void> {
  if (!briefId) return;

  const [brief] = await db.select().from(briefs).where(eq(briefs.id, briefId)).limit(1);
  if (!brief || brief.status === "brouillon" || brief.status === "complete") return;

  const [état] = await db
    .select({
      remplis: raw<number>`count(*) filter (where coalesce(${briefFields.answer}, '') <> '')::int`,
    })
    .from(briefFields)
    .where(eq(briefFields.briefId, briefId));

  const nouveau = Number(état?.remplis ?? 0) > 0 ? "en_cours" : "envoye";
  if (nouveau !== brief.status) {
    await db.update(briefs).set({ status: nouveau }).where(eq(briefs.id, briefId));
  }
}

/** L'adresse publique du site, pour que les liens des courriels mènent quelque part. */
async function origine(): Promise<string> {
  try {
    const head = await headers();
    const host = head.get("x-forwarded-host") ?? head.get("host") ?? "";
    if (!host) return "";
    const scheme =
      head.get("x-forwarded-proto") ??
      (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
    return `${scheme}://${host}`;
  } catch {
    return "";
  }
}

/**
 * Envoie le brief au client.
 *
 * Le courriel part de la boîte du pôle web et ne contient pas le questionnaire :
 * il contient un lien vers le portail. Un brief rempli dans un e-mail revient en
 * texte libre qu'il faut recopier, et la version recopiée devient fausse à la
 * première précision.
 */
export async function sendBrief(_prev: WebFormState, formData: FormData): Promise<WebFormState> {
  await requireDepartment("web");
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Brief introuvable." };

  const [brief] = await db.select().from(briefs).where(eq(briefs.id, id)).limit(1);
  if (!brief) return { error: "Brief introuvable." };

  const contacts = await db
    .select({ id: users.id, email: users.email, name: users.name })
    .from(users)
    .where(
      and(eq(users.role, "client"), eq(users.clientId, brief.clientId), eq(users.active, true)),
    );

  if (contacts.length === 0) {
    return {
      error:
        "Ce client n'a pas encore d'accès au portail. Ouvre sa fiche et crée l'accès d'un contact : c'est ce compte qui recevra le brief.",
    };
  }

  const base = await origine();
  const lien = `${base}/portail/brief/${brief.id}`;

  const résultats = await Promise.all(
    contacts.map((c) =>
      sendMail({
        pole: "web",
        to: c.email,
        subject: brief.title,
        text:
          `Bonjour ${c.name},\n\n` +
          (brief.intro ?? "") +
          "\n\nLe questionnaire s'ouvre dans votre espace client. Vos réponses sont enregistrées au fur et à mesure : vous pouvez le remplir en plusieurs fois.",
        actionUrl: lien,
        actionLabel: "Remplir le brief",
      }),
    ),
  );

  const échecs = résultats.filter((r) => r.error);

  await db
    .update(briefs)
    .set({ status: brief.status === "brouillon" ? "envoye" : brief.status, sentAt: new Date() })
    .where(eq(briefs.id, id));

  await notify({
    kind: "message",
    title: `Brief à remplir : ${brief.title}`,
    body: "Un questionnaire vous attend dans votre espace.",
    href: `/portail/brief/${brief.id}`,
    clientId: brief.clientId,
    audience: "client",
    email: false,
  });

  refresh(brief.projectId ?? undefined);
  revalidatePath(`/web/briefs/${id}`);

  if (échecs.length === résultats.length) {
    return { error: `Envoi impossible : ${échecs[0].error}` };
  }
  return {
    ok:
      `Brief envoyé à ${contacts.map((c) => c.email).join(", ")}.` +
      (échecs.length > 0 ? ` ${échecs.length} envoi(s) en échec.` : ""),
  };
}

export async function deleteBrief(formData: FormData): Promise<void> {
  await requireDepartment("web");
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await db.delete(briefs).where(eq(briefs.id, id));
  refresh();
  redirect("/web/briefs");
}

/* ----------------------------------------------------------- livrables -- */

/**
 * Soumet une maquette au client.
 *
 * Deux formes et pas une : un lien — Figma, préproduction, Drive — ou un
 * fichier déjà déposé dans le dossier du client. Obliger l'un ou l'autre ferait
 * bricoler l'équipe, qui collerait l'adresse d'un PDF dans un champ prévu pour
 * autre chose.
 */
export async function addDeliverable(formData: FormData): Promise<void> {
  const user = await requireDepartment("web");
  const projectId = String(formData.get("projectId") ?? "");
  const label = String(formData.get("label") ?? "").trim();
  const url = String(formData.get("url") ?? "").trim();
  const fileId = String(formData.get("fileId") ?? "").trim();
  if (!projectId || !label) return;
  if (!url && !fileId) return;

  const [{ n }] = await db
    .select({ n: raw<number>`count(*)::int` })
    .from(webDeliverables)
    .where(eq(webDeliverables.projectId, projectId));

  const [projet] = await db
    .select({ clientId: webProjects.clientId, name: webProjects.name })
    .from(webProjects)
    .where(eq(webProjects.id, projectId))
    .limit(1);

  await db.insert(webDeliverables).values({
    projectId,
    label,
    note: String(formData.get("note") ?? "").trim() || null,
    url: url || null,
    fileId: fileId || null,
    position: Number(n ?? 0),
    createdById: user.id,
  });

  if (projet) {
    await notify({
      kind: "validation_attendue",
      title: `À valider : ${label}`,
      body: `Un livrable du projet ${projet.name} attend votre retour dans votre espace.`,
      href: "/portail#projets",
      clientId: projet.clientId,
      audience: "client",
    });
  }

  refresh(projectId);
}

export async function removeDeliverable(formData: FormData): Promise<void> {
  await requireDepartment("web");
  const id = String(formData.get("id") ?? "");
  const projectId = String(formData.get("projectId") ?? "");
  if (!id) return;
  await db.delete(webDeliverables).where(eq(webDeliverables.id, id));
  refresh(projectId);
}

/** Remet un livrable en attente après correction : on resoumet la même chose. */
export async function resubmitDeliverable(formData: FormData): Promise<void> {
  await requireDepartment("web");
  const id = String(formData.get("id") ?? "");
  const projectId = String(formData.get("projectId") ?? "");
  if (!id) return;

  const [livrable] = await db
    .select()
    .from(webDeliverables)
    .where(eq(webDeliverables.id, id))
    .limit(1);
  if (!livrable) return;

  await db
    .update(webDeliverables)
    .set({
      status: "en_attente",
      // La remarque du client est effacée en même temps que la reprise : la
      // garder ferait croire qu'un reproche traité est toujours en cours.
      clientNote: null,
      respondedAt: null,
      url: String(formData.get("url") ?? "").trim() || livrable.url,
    })
    .where(eq(webDeliverables.id, id));

  const [projet] = await db
    .select({ clientId: webProjects.clientId, name: webProjects.name })
    .from(webProjects)
    .where(eq(webProjects.id, livrable.projectId))
    .limit(1);

  if (projet) {
    await notify({
      kind: "validation_attendue",
      title: `Corrigé, à revoir : ${livrable.label}`,
      body: `Le livrable a été repris et attend de nouveau votre retour.`,
      href: "/portail#projets",
      clientId: projet.clientId,
      audience: "client",
    });
  }

  refresh(projectId);
}
