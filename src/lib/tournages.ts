import "server-only";

import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm";
import {
  activity,
  contentLinks,
  contents,
  db,
  notifications,
  shootCrew,
  shoots,
  shootVideoComments,
  shootVideoNotes,
  shootVideos,
  users,
  type ShootVideo,
} from "@/db";
import { notify } from "@/lib/notify";
import { wallNow } from "@/lib/publication";
import {
  estReseauSocial,
  FORMATS_VIDEO,
  jourLong,
  heureDite,
  plateformeDe,
  prenom,
  youtubeId,
} from "@/lib/tournages-regles";

/*
 * Les vidéos prévues d'un tournage : ce qui est partagé par la fiche agence,
 * la veille, la fiche d'un contenu et le portail client. Les droits sont
 * vérifiés par l'appelant (pages et actions).
 */

export type Reference = ShootVideo["references"][number];

/* ------------------------------------------------------- aperçu d'un lien -- */

/**
 * La vignette d'une vidéo de référence, quand on peut l'avoir sans clé :
 * YouTube (adresse d'image publique), TikTok et Vimeo (oEmbed public).
 * Instagram et Facebook exigent un jeton pour leur oEmbed : on garde une carte
 * avec la plateforme et le lien. Une réponse lente ou en erreur ne bloque
 * jamais l'enregistrement : 3 secondes, puis la carte.
 */
export async function apercuReference(url: string): Promise<Reference> {
  const plateforme = plateformeDe(url);
  const ref: Reference = { url, plateforme, vignette: null, auteur: null };
  if (plateforme === "youtube") {
    const id = youtubeId(url);
    if (id) ref.vignette = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
    return ref;
  }
  const oembed =
    plateforme === "tiktok"
      ? `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`
      : plateforme === "vimeo"
        ? `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`
        : null;
  if (!oembed) return ref;
  try {
    const r = await fetch(oembed, { signal: AbortSignal.timeout(3000), headers: { Accept: "application/json" } });
    if (!r.ok) return ref;
    const j = (await r.json()) as { thumbnail_url?: string; author_name?: string };
    if (j.thumbnail_url && /^https:\/\//.test(j.thumbnail_url)) ref.vignette = j.thumbnail_url;
    if (j.author_name) ref.auteur = String(j.author_name).slice(0, 80);
  } catch {
    // Pas d'aperçu : la carte suffit.
  }
  return ref;
}

/** Les références d'une liste de liens, en gardant l'aperçu déjà relevé d'un lien inchangé. */
export async function referencesDepuis(urls: string[], existantes: Reference[] = []): Promise<Reference[]> {
  const connues = new Map(existantes.map((r) => [r.url, r]));
  return Promise.all(urls.map((u) => connues.get(u) ?? apercuReference(u)));
}

/* ---------------------------------------------------- ajout d'une vidéo -- */

/** Le prochain tournage d'un client : à venir, ni annulé ni réalisé. */
export async function prochainTournage(clientId: string) {
  const [s] = await db
    .select()
    .from(shoots)
    .where(
      and(
        eq(shoots.clientId, clientId),
        gte(shoots.startsAt, wallNow()),
        ne(shoots.status, "annule"),
        ne(shoots.status, "realise"),
      ),
    )
    .orderBy(asc(shoots.startsAt))
    .limit(1);
  return s ?? null;
}

/** Les tournages à venir d'un client, pour un choix dans une liste. */
export async function tournagesAVenir(clientId: string) {
  return db
    .select({ id: shoots.id, title: shoots.title, startsAt: shoots.startsAt, publishedAt: shoots.publishedAt })
    .from(shoots)
    .where(
      and(
        eq(shoots.clientId, clientId),
        gte(shoots.startsAt, new Date(wallNow().getTime() - 12 * 3_600_000)),
        ne(shoots.status, "annule"),
        ne(shoots.status, "realise"),
      ),
    )
    .orderBy(asc(shoots.startsAt));
}

/**
 * Ajoute une vidéo en fin de liste, journalise, et prévient le client si le
 * tournage lui est déjà publié et la vidéo visible.
 */
export async function ajouterVideo(v: {
  shootId: string;
  title: string;
  description?: string | null;
  references?: Reference[];
  script?: string | null;
  speaker?: string | null;
  prep?: { id: string; label: string }[];
  durationSec?: number | null;
  format?: string | null;
  visibleToClient?: boolean;
  contentId?: string | null;
  auteurId: string;
  /** Pour le fil d'activité : « depuis la veille », « depuis le contenu … ». */
  origine?: string;
}) {
  const [shoot] = await db.select().from(shoots).where(eq(shoots.id, v.shootId)).limit(1);
  if (!shoot) throw new Error("Tournage introuvable.");
  const [pos] = await db
    .select({ n: sql<number>`coalesce(max(${shootVideos.position}), -1)::int` })
    .from(shootVideos)
    .where(eq(shootVideos.shootId, v.shootId));
  const [video] = await db
    .insert(shootVideos)
    .values({
      shootId: v.shootId,
      position: (pos?.n ?? -1) + 1,
      title: v.title.slice(0, 160),
      description: v.description || null,
      references: v.references ?? [],
      script: v.script || null,
      speaker: v.speaker || null,
      prep: v.prep ?? [],
      durationSec: v.durationSec ?? null,
      format: v.format && FORMATS_VIDEO.includes(v.format) ? v.format : null,
      visibleToClient: v.visibleToClient ?? true,
      contentId: v.contentId ?? null,
    })
    .returning();
  if (v.contentId) {
    // Le contenu sait de quel tournage il sort : la production le montre.
    await db.update(contents).set({ shootId: v.shootId }).where(and(eq(contents.id, v.contentId), eq(contents.clientId, shoot.clientId)));
  }
  await db.insert(activity).values({
    clientId: shoot.clientId,
    contentId: v.contentId ?? null,
    actorId: v.auteurId,
    text: `Vidéo « ${video.title} » prévue pour le tournage « ${shoot.title} »${v.origine ? ` (${v.origine})` : ""}`,
  });
  if (video.visibleToClient && shoot.publishedAt) await prevenirClientVideos(shoot, [video.title]);
  return { video, shoot };
}

/** Une vidéo à partir d'une idée ou d'un contenu existant du même client. */
export async function videoDepuisContenu(shootId: string, contentId: string, auteurId: string) {
  const [shoot] = await db.select().from(shoots).where(eq(shoots.id, shootId)).limit(1);
  if (!shoot) throw new Error("Tournage introuvable.");
  const [c] = await db
    .select()
    .from(contents)
    .where(and(eq(contents.id, contentId), eq(contents.clientId, shoot.clientId)))
    .limit(1);
  if (!c) throw new Error("Ce contenu n'appartient pas au client du tournage.");
  const [deja] = await db
    .select({ id: shootVideos.id })
    .from(shootVideos)
    .where(and(eq(shootVideos.shootId, shootId), eq(shootVideos.contentId, contentId)))
    .limit(1);
  if (deja) throw new Error("Ce contenu est déjà prévu dans ce tournage.");
  // Seuls les liens de réseaux sociaux deviennent des références : un dossier
  // Drive de rushs ou un WeTransfer reste interne. Les consignes de
  // fabrication aussi : elles ne sont pas écrites pour le client.
  const liens = await db.select({ url: contentLinks.url }).from(contentLinks).where(eq(contentLinks.contentId, contentId));
  const references = await referencesDepuis(liens.map((l) => l.url).filter(estReseauSocial).slice(0, 5));
  return ajouterVideo({
    shootId,
    title: c.title,
    references,
    format: c.kind,
    contentId: c.id,
    auteurId,
    origine: `depuis le contenu « ${c.title} »`,
  });
}

/* ------------------------------------------------------ prévenir le client -- */

/**
 * Le client est prévenu par le mécanisme existant (`notify`, audience
 * « client ») : une notification, et le courriel qui l'accompagne déjà pour
 * « À valider » et « Publié ». Pour des vidéos ajoutées une à une, le
 * courriel ne repart pas si le client a déjà été prévenu pour ce tournage
 * depuis moins de 2 heures : la notification suffit, et dix ajouts ne font
 * pas dix courriels.
 */
const PAUSE_COURRIEL_MS = 2 * 3_600_000;

export async function prevenirClientPublication(shoot: { id: string; clientId: string; startsAt: Date; title: string }, nbVideos: number) {
  await notify({
    kind: "tournage",
    title: `Votre prochain tournage : ${jourLong(shoot.startsAt)}, ${heureDite(shoot.startsAt)}`,
    body: `${nbVideos > 0 ? `${nbVideos} vidéo${nbVideos > 1 ? "s" : ""} prévue${nbVideos > 1 ? "s" : ""}` : "Le tournage est prévu"}. Retrouvez dans votre espace ce que nous allons filmer et ce que vous pouvez préparer.`,
    href: "/portail/tournages",
    clientId: shoot.clientId,
    audience: "client",
  });
}

export async function prevenirClientVideos(shoot: { id: string; clientId: string; startsAt: Date }, titres: string[]) {
  if (titres.length === 0) return;
  const [recent] = await db
    .select({ id: notifications.id })
    .from(notifications)
    .innerJoin(users, eq(users.id, notifications.userId))
    .where(
      and(
        eq(notifications.clientId, shoot.clientId),
        eq(notifications.kind, "tournage"),
        eq(users.role, "client"),
        // Un courriel parti, ou tenté (la messagerie peut être en panne).
        sql`(${notifications.emailedAt} is not null or ${notifications.emailError} is not null)`,
        gte(notifications.createdAt, new Date(Date.now() - PAUSE_COURRIEL_MS)),
      ),
    )
    .limit(1);
  await notify({
    kind: "tournage",
    title:
      titres.length > 1
        ? `${titres.length} nouvelles vidéos pour votre tournage du ${jourLong(shoot.startsAt)}`
        : `Nouvelle vidéo pour votre tournage du ${jourLong(shoot.startsAt)} : ${titres[0]}`,
    body: "Retrouvez dans votre espace ce que nous allons filmer et ce que vous pouvez préparer.",
    href: "/portail/tournages",
    clientId: shoot.clientId,
    audience: "client",
    email: !recent,
  });
}

/* ------------------------------------------------------- prévenir l'équipe -- */

/**
 * Le client a agi (« Je suis prêt », une question) : l'équipe du tournage est
 * prévenue, ou toute l'équipe si personne n'y est encore assigné — comme un
 * contenu sans responsable.
 */
export async function prevenirEquipe(
  shoot: { id: string; clientId: string },
  n: { title: string; body: string; email: boolean },
) {
  const crew = await db.select({ id: shootCrew.userId }).from(shootCrew).where(eq(shootCrew.shootId, shoot.id));
  await notify({
    kind: "tournage",
    title: n.title,
    body: n.body,
    href: `/tournages/${shoot.id}`,
    clientId: shoot.clientId,
    ...(crew.length ? { userIds: crew.map((c) => c.id) } : { audience: "equipe" as const }),
    email: n.email,
  });
}

/* ---------------------------------------------------------- côté portail -- */

/**
 * Les tournages d'un client tels qu'il a le droit de les voir : publiés, non
 * annulés, avec leurs vidéos visibles seulement. Rien d'interne n'est lu :
 * ni note d'équipe, ni matériel, ni droits, ni l'état de fabrication.
 */
export async function tournagesDuPortail(clientId: string) {
  const liste = await db
    .select({
      id: shoots.id,
      title: shoots.title,
      place: shoots.place,
      startsAt: shoots.startsAt,
      endsAt: shoots.endsAt,
      status: shoots.status,
    })
    .from(shoots)
    .where(and(eq(shoots.clientId, clientId), isNotNull(shoots.publishedAt), ne(shoots.status, "annule")))
    .orderBy(asc(shoots.startsAt));
  const ids = liste.map((s) => s.id);
  if (ids.length === 0) return [];

  const [videos, equipe] = await Promise.all([
    db
      .select({
        id: shootVideos.id,
        shootId: shootVideos.shootId,
        title: shootVideos.title,
        description: shootVideos.description,
        references: shootVideos.references,
        script: shootVideos.script,
        speaker: shootVideos.speaker,
        prep: shootVideos.prep,
        prepDone: shootVideos.prepDone,
        durationSec: shootVideos.durationSec,
        format: shootVideos.format,
        contentId: shootVideos.contentId,
        clientReadyAt: shootVideos.clientReadyAt,
      })
      .from(shootVideos)
      .where(and(inArray(shootVideos.shootId, ids), eq(shootVideos.visibleToClient, true)))
      .orderBy(asc(shootVideos.position), asc(shootVideos.createdAt)),
    db
      .select({ shootId: shootCrew.shootId, name: users.name })
      .from(shootCrew)
      .innerJoin(users, eq(users.id, shootCrew.userId))
      .where(inArray(shootCrew.shootId, ids))
      .orderBy(asc(users.name)),
  ]);

  const videoIds = videos.map((v) => v.id);
  const [echanges, produits] = await Promise.all([
    videoIds.length
      ? db
          .select({
            id: shootVideoComments.id,
            videoId: shootVideoComments.videoId,
            body: shootVideoComments.body,
            createdAt: shootVideoComments.createdAt,
            auteur: users.name,
            role: users.role,
          })
          .from(shootVideoComments)
          .leftJoin(users, eq(users.id, shootVideoComments.authorId))
          .where(inArray(shootVideoComments.videoId, videoIds))
          .orderBy(asc(shootVideoComments.createdAt))
      : Promise.resolve([]),
    // Ce qui est sorti du tournage et que le client peut ouvrir : à valider,
    // validé ou publié — jamais ce qui se fabrique encore.
    db
      .select({ id: contents.id, title: contents.title, status: contents.status, shootId: contents.shootId })
      .from(contents)
      .where(
        and(
          eq(contents.clientId, clientId),
          inArray(contents.shootId, ids),
          inArray(contents.status, ["validation", "pret", "publie"]),
        ),
      )
      .orderBy(desc(contents.updatedAt)),
  ]);

  return liste.map((s) => ({
    ...s,
    equipe: equipe.filter((e) => e.shootId === s.id).map((e) => prenom(e.name)),
    videos: videos
      .filter((v) => v.shootId === s.id)
      .map((v) => ({
        ...v,
        echanges: echanges
          .filter((e) => e.videoId === v.id)
          .map((e) => ({
            id: e.id,
            body: e.body,
            createdAt: e.createdAt,
            deVous: e.role === "client",
            // Le client lit un prénom, jamais un compte interne complet.
            auteur: e.role === "client" ? (e.auteur ?? "Vous") : prenom(e.auteur ?? "L'équipe"),
          })),
      })),
    produits: produits.filter((p) => p.shootId === s.id),
  }));
}

export type TournagePortail = Awaited<ReturnType<typeof tournagesDuPortail>>[number];

/** Avant le début de la journée de tournage, il est encore « à venir ». */
export const estAVenir = (s: { startsAt: Date; status: string }, maintenantMural: Date) =>
  s.status !== "realise" &&
  Date.UTC(s.startsAt.getUTCFullYear(), s.startsAt.getUTCMonth(), s.startsAt.getUTCDate()) >=
    Date.UTC(maintenantMural.getUTCFullYear(), maintenantMural.getUTCMonth(), maintenantMural.getUTCDate());

/** Les notifications « tournage » du client pas encore vues, pour signaler du nouveau. */
export async function nouveautesTournage(userId: string) {
  return db
    .select({ id: notifications.id, title: notifications.title, createdAt: notifications.createdAt })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.kind, "tournage"), isNull(notifications.readAt)))
    .orderBy(desc(notifications.createdAt))
    .limit(5);
}

/* ------------------------------------------------------------ côté agence -- */

/** Les vidéos d'un tournage pour la fiche agence : tout, y compris ce qui est masqué au client. */
export async function videosAgence(shootId: string, clientId: string) {
  const videos = await db
    .select()
    .from(shootVideos)
    .where(eq(shootVideos.shootId, shootId))
    .orderBy(asc(shootVideos.position), asc(shootVideos.createdAt));
  const ids = videos.map((v) => v.id);
  const lienIds = videos.map((v) => v.contentId).filter((x): x is string => Boolean(x));
  // inArray refuse une liste vide : un identifiant qui n'existe pas la complète.
  const clientIdVide = ["00000000-0000-0000-0000-000000000000"];
  const [echanges, lies, candidats, notes, auteursTournee] = await Promise.all([
    ids.length
      ? db
          .select({
            id: shootVideoComments.id,
            videoId: shootVideoComments.videoId,
            body: shootVideoComments.body,
            createdAt: shootVideoComments.createdAt,
            auteur: users.name,
            role: users.role,
          })
          .from(shootVideoComments)
          .leftJoin(users, eq(users.id, shootVideoComments.authorId))
          .where(inArray(shootVideoComments.videoId, ids))
          .orderBy(asc(shootVideoComments.createdAt))
      : Promise.resolve([]),
    // Les contenus déjà reliés, pour afficher leur titre et leur étape.
    lienIds.length
      ? db
          .select({ id: contents.id, title: contents.title, status: contents.status })
          .from(contents)
          .where(inArray(contents.id, lienIds))
      : Promise.resolve([]),
    // Ce qu'on peut relier ou dont on peut partir : les idées et contenus pas
    // encore publiés du client, les plus récents d'abord.
    db
      .select({ id: contents.id, title: contents.title, status: contents.status })
      .from(contents)
      .where(and(eq(contents.clientId, clientId), sql`${contents.status} not in ('publie', 'manque')`))
      .orderBy(desc(contents.createdAt))
      .limit(80),
    // Les notes de tournage (vidéaste, équipe) : internes.
    ids.length
      ? db
          .select({ id: shootVideoNotes.id, videoId: shootVideoNotes.videoId, body: shootVideoNotes.body, createdAt: shootVideoNotes.createdAt, auteur: users.name })
          .from(shootVideoNotes)
          .leftJoin(users, eq(users.id, shootVideoNotes.authorId))
          .where(inArray(shootVideoNotes.videoId, ids))
          .orderBy(desc(shootVideoNotes.createdAt))
      : Promise.resolve([]),
    db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(inArray(users.id, videos.map((v) => v.shotById).filter((x): x is string => Boolean(x)).concat(clientIdVide))),
  ]);
  return {
    videos: videos.map((v) => ({
      ...v,
      echanges: echanges.filter((e) => e.videoId === v.id).map((e) => ({ ...e, deClient: e.role === "client" })),
      contenu: lies.find((c) => c.id === v.contentId) ?? null,
      notes: notes.filter((n) => n.videoId === v.id),
      tourneePar: auteursTournee.find((u) => u.id === v.shotById)?.name ?? null,
    })),
    candidats,
  };
}

/** Pour la barre et l'accueil du portail : combien de tournages publiés, et le prochain. */
export async function prochainDuPortail(clientId: string) {
  const tous = await tournagesDuPortail(clientId);
  const maintenant = wallNow();
  const prochain = tous.find((s) => estAVenir(s, maintenant)) ?? null;
  return { publies: tous.length, prochain };
}
