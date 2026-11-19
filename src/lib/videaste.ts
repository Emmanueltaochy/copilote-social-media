import "server-only";

import { and, asc, desc, eq, inArray } from "drizzle-orm";
import {
  clients,
  db,
  shootCrew,
  shootGear,
  shootRights,
  shoots,
  shots,
  shootVideoComments,
  shootVideoNotes,
  shootVideos,
  users,
} from "@/db";

/*
 * L'espace du vidéaste : les tournages où il est dans l'équipe, et rien
 * d'autre. Chaque requête porte la condition « il est dans shoot_crew » : un
 * identifiant de tournage changé dans l'adresse ne donne accès à rien.
 *
 * Ce qui n'est jamais lu ici : l'argent (forfaits, devis, factures), les
 * contacts de l'annuaire, les e-mails, les réglages, les autres clients.
 */

/** Ses tournages, du plus ancien au plus récent (la page sépare à venir et passés). */
export async function mesTournages(userId: string) {
  const liste = await db
    .select({
      id: shoots.id,
      title: shoots.title,
      place: shoots.place,
      startsAt: shoots.startsAt,
      endsAt: shoots.endsAt,
      status: shoots.status,
      client: clients.shortName,
      roleLabel: shootCrew.roleLabel,
    })
    .from(shootCrew)
    .innerJoin(shoots, eq(shoots.id, shootCrew.shootId))
    .innerJoin(clients, eq(clients.id, shoots.clientId))
    .where(eq(shootCrew.userId, userId))
    .orderBy(asc(shoots.startsAt));
  const ids = liste.map((s) => s.id);
  const videos = ids.length
    ? await db
        .select({ shootId: shootVideos.shootId, status: shootVideos.status })
        .from(shootVideos)
        .where(inArray(shootVideos.shootId, ids))
    : [];
  return liste.map((s) => {
    const v = videos.filter((x) => x.shootId === s.id);
    return { ...s, videos: v.length, tournees: v.filter((x) => x.status === "tourne").length };
  });
}

/** Est-il dans l'équipe de ce tournage ? */
export async function estDansLEquipe(userId: string, shootId: string): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/i.test(shootId)) return false;
  const [m] = await db
    .select({ id: shootCrew.userId })
    .from(shootCrew)
    .where(and(eq(shootCrew.shootId, shootId), eq(shootCrew.userId, userId)))
    .limit(1);
  return Boolean(m);
}

/** La fiche complète d'un tournage, pour un membre de son équipe. Null sinon. */
export async function tournageDuVideaste(userId: string, shootId: string) {
  if (!(await estDansLEquipe(userId, shootId))) return null;
  const [ligne] = await db
    .select({ shoot: shoots, client: clients.shortName, clientNom: clients.name })
    .from(shoots)
    .innerJoin(clients, eq(clients.id, shoots.clientId))
    .where(eq(shoots.id, shootId))
    .limit(1);
  if (!ligne) return null;

  const [equipe, materiel, droits, plans, videos] = await Promise.all([
    db
      .select({ userId: shootCrew.userId, name: users.name, roleLabel: shootCrew.roleLabel, state: shootCrew.state, role: users.role })
      .from(shootCrew)
      .innerJoin(users, eq(users.id, shootCrew.userId))
      .where(eq(shootCrew.shootId, shootId))
      .orderBy(asc(users.name)),
    db.select().from(shootGear).where(eq(shootGear.shootId, shootId)).orderBy(asc(shootGear.position)),
    db.select().from(shootRights).where(eq(shootRights.shootId, shootId)).orderBy(asc(shootRights.position)),
    db.select().from(shots).where(eq(shots.shootId, shootId)).orderBy(asc(shots.position)),
    db
      .select()
      .from(shootVideos)
      .where(eq(shootVideos.shootId, shootId))
      .orderBy(asc(shootVideos.position), asc(shootVideos.createdAt)),
  ]);
  const ids = videos.map((v) => v.id);
  const [echanges, notes] = ids.length
    ? await Promise.all([
        db
          .select({ id: shootVideoComments.id, videoId: shootVideoComments.videoId, body: shootVideoComments.body, createdAt: shootVideoComments.createdAt, auteur: users.name, role: users.role })
          .from(shootVideoComments)
          .leftJoin(users, eq(users.id, shootVideoComments.authorId))
          .where(inArray(shootVideoComments.videoId, ids))
          .orderBy(asc(shootVideoComments.createdAt)),
        db
          .select({ id: shootVideoNotes.id, videoId: shootVideoNotes.videoId, body: shootVideoNotes.body, createdAt: shootVideoNotes.createdAt, auteur: users.name })
          .from(shootVideoNotes)
          .leftJoin(users, eq(users.id, shootVideoNotes.authorId))
          .where(inArray(shootVideoNotes.videoId, ids))
          .orderBy(desc(shootVideoNotes.createdAt)),
      ])
    : [[], []];

  return {
    shoot: ligne.shoot,
    client: ligne.client,
    clientNom: ligne.clientNom,
    equipe,
    materiel,
    droits,
    plans,
    videos: videos.map((v) => ({
      ...v,
      echanges: echanges.filter((e) => e.videoId === v.id),
      notes: notes.filter((n) => n.videoId === v.id),
    })),
  };
}
