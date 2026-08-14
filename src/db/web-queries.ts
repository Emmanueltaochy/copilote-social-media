import "server-only";

import { and, asc, count, desc, eq, isNull, sql as raw } from "drizzle-orm";
import { db } from "./index";
import {
  briefFields,
  briefs,
  clientFiles,
  clients,
  settings,
  users,
  webMilestones,
  webProjects,
} from "./schema";

/* ------------------------------------------------------------- projets -- */

/**
 * Tous les projets, avec ce qui se lit d'un coup d'œil sur une carte.
 *
 * Les compteurs de jalons sont des sous-requêtes plutôt qu'un appel par
 * projet : le tableau doit rester lisible avec trente projets, et c'est
 * l'avancement qu'on vient y chercher.
 */
export async function listWebProjects(clientId?: string) {
  return db
    .select({
      project: webProjects,
      clientName: clients.shortName,
      ownerName: users.name,
      jalons: raw<number>`(select count(*)::int from web_milestones m where m.project_id = ${webProjects.id})`,
      jalonsFaits: raw<number>`(select count(*)::int from web_milestones m where m.project_id = ${webProjects.id} and m.done)`,
      attenteClient: raw<number>`(select count(*)::int from web_milestones m where m.project_id = ${webProjects.id} and not m.done and m.waiting_client)`,
      briefComplet: raw<boolean>`exists (select 1 from briefs b where b.project_id = ${webProjects.id} and b.status = 'complete')`,
      briefEnCours: raw<boolean>`exists (select 1 from briefs b where b.project_id = ${webProjects.id} and b.status <> 'complete')`,
    })
    .from(webProjects)
    .innerJoin(clients, eq(clients.id, webProjects.clientId))
    .leftJoin(users, eq(users.id, webProjects.ownerId))
    .where(clientId ? eq(webProjects.clientId, clientId) : undefined)
    .orderBy(asc(webProjects.dueAt), asc(webProjects.name));
}

export async function getWebProject(id: string) {
  const rows = await db
    .select({ project: webProjects, clientName: clients.shortName, ownerName: users.name })
    .from(webProjects)
    .innerJoin(clients, eq(clients.id, webProjects.clientId))
    .leftJoin(users, eq(users.id, webProjects.ownerId))
    .where(eq(webProjects.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function listMilestones(projectId: string) {
  return db
    .select()
    .from(webMilestones)
    .where(eq(webMilestones.projectId, projectId))
    .orderBy(asc(webMilestones.position));
}

/* --------------------------------------------------------------- briefs -- */

export async function listBriefs(opts: { clientId?: string; projectId?: string } = {}) {
  return db
    .select({
      brief: briefs,
      clientName: clients.shortName,
      projectName: webProjects.name,
      total: raw<number>`(select count(*)::int from brief_fields f where f.brief_id = ${briefs.id})`,
      remplis: raw<number>`(select count(*)::int from brief_fields f where f.brief_id = ${briefs.id} and coalesce(f.answer, '') <> '')`,
      manquantsObligatoires: raw<number>`(select count(*)::int from brief_fields f where f.brief_id = ${briefs.id} and f.required and coalesce(f.answer, '') = '')`,
    })
    .from(briefs)
    .innerJoin(clients, eq(clients.id, briefs.clientId))
    .leftJoin(webProjects, eq(webProjects.id, briefs.projectId))
    .where(
      and(
        opts.clientId ? eq(briefs.clientId, opts.clientId) : undefined,
        opts.projectId ? eq(briefs.projectId, opts.projectId) : undefined,
      ),
    )
    .orderBy(desc(briefs.createdAt));
}

export async function getBrief(id: string) {
  const rows = await db
    .select({ brief: briefs, clientName: clients.shortName, projectName: webProjects.name })
    .from(briefs)
    .innerJoin(clients, eq(clients.id, briefs.clientId))
    .leftJoin(webProjects, eq(webProjects.id, briefs.projectId))
    .where(eq(briefs.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function listBriefFields(briefId: string) {
  return db
    .select({ field: briefFields, answeredByName: users.name })
    .from(briefFields)
    .leftJoin(users, eq(users.id, briefFields.answeredById))
    .where(eq(briefFields.briefId, briefId))
    .orderBy(asc(briefFields.position));
}

/** L'avancement d'un brief, pour les pastilles et les listes. */
export async function briefProgress(briefId: string) {
  const [row] = await db
    .select({
      total: count(),
      remplis: raw<number>`count(*) filter (where coalesce(${briefFields.answer}, '') <> '')::int`,
      manquants: raw<number>`count(*) filter (where ${briefFields.required} and coalesce(${briefFields.answer}, '') = '')::int`,
    })
    .from(briefFields)
    .where(eq(briefFields.briefId, briefId));
  return {
    total: row?.total ?? 0,
    remplis: Number(row?.remplis ?? 0),
    manquants: Number(row?.manquants ?? 0),
  };
}

/* ------------------------------------------------------------- réglages -- */

export type Reglages = typeof settings.$inferSelect;

/**
 * Les réglages de l'agence, créés au premier appel.
 *
 * Renvoyer des valeurs par défaut sans les écrire laisserait l'écran de
 * réglages afficher des champs vides qu'on croirait perdus au premier
 * enregistrement.
 */
export async function reglages(): Promise<Reglages> {
  const rows = await db.select().from(settings).where(eq(settings.id, "agence")).limit(1);
  if (rows[0]) return rows[0];
  const [créé] = await db.insert(settings).values({ id: "agence" }).returning();
  return créé;
}

/* --------------------------------------------- ce qui attend le client -- */

export type ActionClient = {
  id: string;
  titre: string;
  detail: string;
  href: string;
  urgent: boolean;
};

/**
 * Ce que le portail doit demander au client.
 *
 * Une liste calculée, jamais stockée : une tâche enregistrée quelque part
 * finirait par survivre à ce qu'elle demandait, et le client verrait « remplir
 * le brief » des semaines après l'avoir rempli.
 */
export async function actionsDuClient(clientId: string): Promise<ActionClient[]> {
  const [briefsOuverts, jalons] = await Promise.all([
    db
      .select({
        id: briefs.id,
        title: briefs.title,
        manquants: raw<number>`(select count(*)::int from brief_fields f where f.brief_id = ${briefs.id} and f.required and coalesce(f.answer, '') = '')`,
      })
      .from(briefs)
      .where(and(eq(briefs.clientId, clientId), raw`${briefs.status} <> 'complete'`, raw`${briefs.status} <> 'brouillon'`)),
    db
      .select({ id: webMilestones.id, label: webMilestones.label, projet: webProjects.name })
      .from(webMilestones)
      .innerJoin(webProjects, eq(webProjects.id, webMilestones.projectId))
      .where(
        and(
          eq(webProjects.clientId, clientId),
          eq(webMilestones.waitingClient, true),
          eq(webMilestones.done, false),
        ),
      )
      .orderBy(asc(webMilestones.position)),
  ]);

  const actions: ActionClient[] = [];

  for (const b of briefsOuverts) {
    actions.push({
      id: `brief-${b.id}`,
      titre: b.title,
      detail:
        Number(b.manquants) > 0
          ? `${b.manquants} question${Number(b.manquants) > 1 ? "s" : ""} obligatoire${Number(b.manquants) > 1 ? "s" : ""} sans réponse`
          : "À relire et valider",
      href: `/portail/brief/${b.id}`,
      urgent: Number(b.manquants) > 0,
    });
  }

  // Deux jalons par projet, pas davantage.
  //
  // Au démarrage, tous les points « côté client » sont en attente à la fois :
  // en afficher huit à la suite, tous formulés pareil, apprend à ne plus les
  // lire. On montre le prochain et le suivant, et on dit combien viendront
  // après — la liste complète reste dans la section du projet.
  const parProjet = new Map<string, typeof jalons>();
  for (const j of jalons) parProjet.set(j.projet, [...(parProjet.get(j.projet) ?? []), j]);

  for (const [projet, liste] of parProjet) {
    for (const j of liste.slice(0, 2)) {
      actions.push({
        id: `jalon-${j.id}`,
        titre: j.label,
        detail: `Projet ${projet} — nous attendons votre retour`,
        href: "/portail#projets",
        urgent: false,
      });
    }
    if (liste.length > 2) {
      actions.push({
        id: `reste-${projet}`,
        titre: `${liste.length - 2} autre${liste.length - 2 > 1 ? "s" : ""} point${liste.length - 2 > 1 ? "s" : ""} à venir sur ${projet}`,
        detail: "Ils arriveront à leur tour, inutile de tout traiter aujourd'hui",
        href: "/portail#projets",
        urgent: false,
      });
    }
  }

  return actions;
}

/** Les projets web d'un client, tels que le portail les montre. */
export async function projetsDuClient(clientId: string) {
  return db
    .select({
      project: webProjects,
      jalons: raw<number>`(select count(*)::int from web_milestones m where m.project_id = ${webProjects.id} and m.client_visible)`,
      jalonsFaits: raw<number>`(select count(*)::int from web_milestones m where m.project_id = ${webProjects.id} and m.client_visible and m.done)`,
    })
    .from(webProjects)
    .where(eq(webProjects.clientId, clientId))
    .orderBy(asc(webProjects.dueAt));
}

/** Les jalons visibles par le client, pour un projet. */
export async function jalonsVisibles(projectId: string) {
  return db
    .select()
    .from(webMilestones)
    .where(and(eq(webMilestones.projectId, projectId), eq(webMilestones.clientVisible, true)))
    .orderBy(asc(webMilestones.position));
}

/** Les pièces jointes d'un client, déposées de part et d'autre. */
export async function fichiersDuClient(clientId: string) {
  return db
    .select({ file: clientFiles, auteur: users.name })
    .from(clientFiles)
    .leftJoin(users, eq(users.id, clientFiles.uploadedById))
    .where(eq(clientFiles.clientId, clientId))
    .orderBy(desc(clientFiles.createdAt));
}

/** Briefs qu'on attend encore, tous clients confondus. */
export async function briefsEnAttente() {
  return db
    .select({
      brief: briefs,
      clientName: clients.shortName,
      manquants: raw<number>`(select count(*)::int from brief_fields f where f.brief_id = ${briefs.id} and f.required and coalesce(f.answer, '') = '')`,
    })
    .from(briefs)
    .innerJoin(clients, eq(clients.id, briefs.clientId))
    .where(and(raw`${briefs.status} in ('envoye','en_cours')`, isNull(briefs.completedAt)))
    .orderBy(asc(briefs.sentAt));
}
