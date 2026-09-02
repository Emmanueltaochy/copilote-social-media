import "server-only";

import { and, asc, count, desc, eq, gte, inArray, isNull, lt, lte, ne, type SQL } from "drizzle-orm";
import {
  clients,
  comments,
  contents,
  contentVersions,
  contractLines,
  db,
  shootCrew,
  shootDeliverables,
  shoots,
  users,
  type ApiKey,
} from "@/db";
import { activity } from "@/db";
import { transitionPermise } from "./pipeline";
import type { ContentStatus } from "@/data/content";
import { perimetreDeLaCle } from "./api-auth";
import { departmentsOf, type Department } from "./auth";

/**
 * Le seul chemin par lequel l'API des agents atteint la base.
 *
 * Les routes n'importent pas `@/db` — une règle eslint le leur interdit. Sans
 * cette interdiction, appliquer le périmètre resterait une discipline : il
 * suffirait d'un `select()` écrit vite pour qu'une route rende les contenus de
 * toute la clientèle, et rien ne le signalerait avant qu'un agent ne les lise.
 *
 * Ici, il n'existe simplement pas de chemin non cloisonné à emprunter.
 */

/* --------------------------------------------- le registre des ressources -- */

/**
 * Comment chaque ressource est bornée.
 *
 * - `client` : bornée au pôle **et** au client de la clé. Le cas courant.
 * - `pole`   : bornée au seul pôle. Les personnes de l'agence n'appartiennent
 *              à aucun client ; les borner par client ne voudrait rien dire.
 * - `aucun`  : ouverte à toute clé valide. À n'employer que pour ce qui ne
 *              décrit ni un client ni quelqu'un — et à justifier sur place.
 */
export type Cloisonnement = "client" | "pole" | "aucun";

const RESSOURCES = {
  contenus: "client",
  clients: "client",
  tournages: "client",
  commentaires: "client",
  versions: "client",
  journal: "client",
  // Une personne de l'équipe n'est pas rattachée à un client : la borner par
  // client la rendrait invisible partout. Le pôle reste, lui, une vraie
  // frontière — l'équipe web n'a pas à remonter dans une API sociale.
  equipe: "pole",
} as const satisfies Record<string, Cloisonnement>;

export type Ressource = keyof typeof RESSOURCES;

/**
 * Le cloisonnement d'une ressource, ou une erreur.
 *
 * Le silence n'ouvre rien : une ressource que personne n'a déclarée est
 * refusée, pas servie. C'est l'inverse du défaut habituel — on ajoute une
 * table, on écrit la route, et le cloisonnement manquant ne se voit qu'après
 * coup. Ici la route casse au premier appel, en développement, avec le nom de
 * ce qu'il faut déclarer.
 */
export function cloisonnementDe(ressource: string): Cloisonnement {
  const declare = (RESSOURCES as Record<string, Cloisonnement | undefined>)[ressource];
  if (!declare) {
    throw new Error(
      `[pilot] ressource « ${ressource} » sans cloisonnement déclaré dans agent-data.ts : accès refusé.`,
    );
  }
  return declare;
}

/**
 * Ce que l'accès sur le point d'être fait prétend appliquer, confronté à ce que
 * le registre déclare.
 *
 * Sans cette confrontation, le registre ne serait qu'un commentaire tapé en
 * majuscules : on pourrait l'y lire « client » pendant que la requête, elle,
 * ne borne rien. Ici, changer une ligne du registre casse bruyamment tout accès
 * qui ne s'est pas aligné — c'est ce qui en fait une déclaration et non une
 * décoration.
 */
function exige(ressource: Ressource, applique: Cloisonnement): void {
  const declare = cloisonnementDe(ressource);
  if (declare !== applique) {
    throw new Error(
      `[pilot] « ${ressource} » est déclarée « ${declare} » mais l'accès applique « ${applique} ». ` +
        `Aligne l'un sur l'autre dans agent-data.ts.`,
    );
  }
}

/* ------------------------------------------------------- les sous-requêtes -- */

/**
 * Les identifiants de clients qu'une clé a le droit d'atteindre.
 *
 * Rendue en sous-requête plutôt qu'en condition à poser soi-même : la jointure
 * qu'impose `perimetreDeLaCle()` vit alors ici, et l'appelant n'a aucune
 * contrainte implicite à connaître.
 */
export function clientsAutorises(cle: ApiKey) {
  exige("clients", "client");
  return db.select({ id: clients.id }).from(clients).where(perimetreDeLaCle(cle));
}

/**
 * Les identifiants de contenus qu'une clé a le droit de voir ou de toucher.
 *
 * Le même verrou sert aux lectures et aux écritures : un `update` le pose dans
 * son propre `where`, ce qui évite la lecture-puis-écriture en deux temps —
 * entre les deux, un contenu peut changer de client.
 */
export function contenusAutorises(cle: ApiKey) {
  exige("contenus", "client");
  return db
    .select({ id: contents.id })
    .from(contents)
    .innerJoin(clients, eq(clients.id, contents.clientId))
    .where(perimetreDeLaCle(cle));
}

/* ------------------------------------------------------------- les lectures -- */

/** Les statuts du pipeline, dans leur ordre. Exportés pour que les routes les
 *  valident sans importer le schéma. */
export const STATUTS_CONTENU = [
  "idee",
  "brief",
  "tournage",
  "derush",
  "creation",
  "revision",
  "validation",
  "pret",
  "publie",
  "manque",
] as const;

export type StatutContenu = (typeof STATUTS_CONTENU)[number];

export type FiltresContenus = {
  client?: string;
  statut?: StatutContenu[];
  debut?: string;
  fin?: string;
  limite: number;
};

/**
 * Le pipeline de contenus d'une clé.
 *
 * Les projections sont explicites, jamais un `select()` nu : `clients` porte le
 * forfait mensuel, les heures vendues et les tarifs web, et `users` porte les
 * courriels et les jetons d'invitation. Un `select()` nu les emporterait tous,
 * et c'est la fuite la plus facile à commettre de toute cette couche.
 */
export async function listerContenus(cle: ApiKey, filtres: FiltresContenus) {
  const bornes: SQL[] = [
    // Le périmètre d'abord, avant tout filtre demandé : un paramètre ne doit
    // jamais pouvoir élargir ce que la clé autorise.
    inArray(contents.id, contenusAutorises(cle)),
  ];

  // Un client hors périmètre ne renvoie rien plutôt qu'une erreur : dire « ce
  // client existe mais pas pour toi » est déjà en dire trop.
  if (filtres.client) bornes.push(eq(contents.clientId, filtres.client));
  if (filtres.statut?.length) bornes.push(inArray(contents.status, filtres.statut));
  if (filtres.debut) bornes.push(gte(contents.scheduledAt, new Date(`${filtres.debut}T00:00:00Z`)));
  // Fin incluse : « du 1er au 31 » ne doit pas s'arrêter le 30 au soir.
  if (filtres.fin) bornes.push(lte(contents.scheduledAt, new Date(`${filtres.fin}T23:59:59.999Z`)));

  const lignes = await db
    .select({
      id: contents.id,
      titre: contents.title,
      statut: contents.status,
      format: contents.kind,
      reseau: contents.network,
      reseaux: contents.networks,
      consignes: contents.instructions,
      legende: contents.caption,
      hashtags: contents.hashtags,
      prevuLe: contents.scheduledAt,
      echeanceLe: contents.dueAt,
      soumisLe: contents.submittedAt,
      publieLe: contents.publishedAt,
      publieUrl: contents.publishedUrl,
      creeLe: contents.createdAt,
      majLe: contents.updatedAt,
      clientId: clients.id,
      clientNom: clients.name,
      clientNomCourt: clients.shortName,
      // De quoi savoir à qui parler, pas qui sont les gens : ni courriel, ni
      // rôle, ni jeton d'invitation.
      responsableId: users.id,
      responsableNom: users.name,
      responsableInitiales: users.initials,
    })
    .from(contents)
    .innerJoin(clients, eq(clients.id, contents.clientId))
    .leftJoin(users, eq(users.id, contents.ownerId))
    .where(and(...bornes))
    // Ce qui est daté d'abord, dans l'ordre où ça doit sortir ; PostgreSQL
    // range les dates absentes en dernier, ce qui est le bon ordre — un
    // contenu sans date n'est pas urgent, il est en retard d'une décision.
    .orderBy(asc(contents.scheduledAt), desc(contents.createdAt))
    .limit(filtres.limite);

  return lignes.map((l) => ({
    id: l.id,
    titre: l.titre,
    statut: l.statut,
    format: l.format,
    reseaux: l.reseaux.length > 0 ? l.reseaux : [l.reseau],
    consignes: l.consignes,
    legende: l.legende,
    hashtags: l.hashtags,
    prevuLe: l.prevuLe,
    echeanceLe: l.echeanceLe,
    soumisLe: l.soumisLe,
    publieLe: l.publieLe,
    publieUrl: l.publieUrl,
    creeLe: l.creeLe,
    majLe: l.majLe,
    client: { id: l.clientId, nom: l.clientNom, nomCourt: l.clientNomCourt },
    // La jointure externe rend un objet de champs nuls quand personne n'est
    // assigné ; « pas de responsable » se dit `null`, pas `{ id: null }`.
    responsable: l.responsableId
      ? { id: l.responsableId, nom: l.responsableNom, initiales: l.responsableInitiales }
      : null,
  }));
}

/* -------------------------------------------------------------- les clients -- */

/**
 * Le portefeuille d'une clé.
 *
 * La projection est la partie sensible : `clients` porte `monthlyFeeCents`,
 * `hoursSold`, `webMaintenanceCents`, `webHourlyRateCents` et `webHoursSold`.
 * Un agent chef de projet n'a aucun usage des conditions commerciales, et un
 * `select()` nu les lui livrerait toutes en un appel.
 *
 * Les lignes de contrat viennent avec : sans elles, un agent voit ce qui existe
 * mais pas ce qui *devrait* exister, et ne peut donc pas repérer ce qui manque.
 * Elles ne portent aucun montant, seulement des volumes et des formats.
 */
export async function listerClients(cle: ApiKey) {
  exige("clients", "client");

  const lignes = await db
    .select({
      id: clients.id,
      nom: clients.name,
      nomCourt: clients.shortName,
      secteur: clients.sector,
      contenusParMois: clients.contentTarget,
      poles: clients.departments,
      responsableId: users.id,
      responsableNom: users.name,
      responsableInitiales: users.initials,
    })
    .from(clients)
    .leftJoin(users, eq(users.id, clients.projectManagerId))
    .where(perimetreDeLaCle(cle))
    .orderBy(asc(clients.shortName));

  if (lignes.length === 0) return [];

  const contrats = await db
    .select({
      clientId: contractLines.clientId,
      id: contractLines.id,
      libelle: contractLines.label,
      parMois: contractLines.monthlyTarget,
      format: contractLines.kind,
      reseau: contractLines.network,
      reseaux: contractLines.networks,
    })
    .from(contractLines)
    .where(inArray(contractLines.clientId, clientsAutorises(cle)))
    .orderBy(asc(contractLines.position));

  return lignes.map((c) => ({
    id: c.id,
    nom: c.nom,
    nomCourt: c.nomCourt,
    secteur: c.secteur,
    contenusParMois: c.contenusParMois,
    poles: c.poles,
    responsable: c.responsableId
      ? { id: c.responsableId, nom: c.responsableNom, initiales: c.responsableInitiales }
      : null,
    contrat: contrats
      .filter((l) => l.clientId === c.id)
      .map((l) => ({
        id: l.id,
        libelle: l.libelle,
        parMois: l.parMois,
        format: l.format,
        reseaux: l.reseaux.length > 0 ? l.reseaux : [l.reseau],
      })),
  }));
}

/* ------------------------------------------------------- un contenu, en détail -- */

/**
 * Un contenu avec ses versions et ses commentaires, ou `null`.
 *
 * `null` et non une erreur d'autorisation : un contenu hors périmètre doit être
 * indiscernable d'un contenu qui n'existe pas. Répondre « il existe mais pas
 * pour toi » confirmerait son existence, ce qui est déjà une fuite.
 */
export async function lireContenu(cle: ApiKey, id: string) {
  exige("contenus", "client");

  const [contenu] = await db
    .select({
      id: contents.id,
      titre: contents.title,
      statut: contents.status,
      format: contents.kind,
      reseau: contents.network,
      reseaux: contents.networks,
      consignes: contents.instructions,
      legende: contents.caption,
      hashtags: contents.hashtags,
      prevuLe: contents.scheduledAt,
      echeanceLe: contents.dueAt,
      soumisLe: contents.submittedAt,
      publieLe: contents.publishedAt,
      publieUrl: contents.publishedUrl,
      creeLe: contents.createdAt,
      majLe: contents.updatedAt,
      clientId: clients.id,
      clientNom: clients.name,
      clientNomCourt: clients.shortName,
      responsableId: users.id,
      responsableNom: users.name,
      responsableInitiales: users.initials,
    })
    .from(contents)
    .innerJoin(clients, eq(clients.id, contents.clientId))
    .leftJoin(users, eq(users.id, contents.ownerId))
    .where(and(eq(contents.id, id), inArray(contents.id, contenusAutorises(cle))))
    .limit(1);

  if (!contenu) return null;

  exige("versions", "client");
  const versions = await db
    .select({
      id: contentVersions.id,
      numero: contentVersions.number,
      note: contentVersions.note,
      valideeLe: contentVersions.approvedAt,
      refuseeLe: contentVersions.rejectedAt,
      motifDuRefus: contentVersions.rejectionReason,
      creeLe: contentVersions.createdAt,
      auteurNom: users.name,
      auteurInitiales: users.initials,
    })
    .from(contentVersions)
    .leftJoin(users, eq(users.id, contentVersions.createdById))
    // Deux conditions, et les deux comptent : celle du contenu demandé, sinon
    // la requête remonte les versions de tout ce que la clé peut voir ; et le
    // verrou de périmètre, reposé sur chaque table fille, sinon connaître un
    // identifiant suffirait à lire par une porte dérobée.
    .where(and(eq(contentVersions.contentId, id), inArray(contentVersions.contentId, contenusAutorises(cle))))
    .orderBy(asc(contentVersions.number));

  exige("commentaires", "client");
  const fil = await db
    .select({
      id: comments.id,
      versionId: comments.versionId,
      texte: comments.body,
      pastille: comments.pinNumber,
      resoluLe: comments.resolvedAt,
      creeLe: comments.createdAt,
      auteurNom: users.name,
      auteurInitiales: users.initials,
    })
    .from(comments)
    .leftJoin(users, eq(users.id, comments.authorId))
    .where(and(eq(comments.contentId, id), inArray(comments.contentId, contenusAutorises(cle))))
    .orderBy(asc(comments.createdAt));

  return {
    id: contenu.id,
    titre: contenu.titre,
    statut: contenu.statut,
    format: contenu.format,
    reseaux: contenu.reseaux.length > 0 ? contenu.reseaux : [contenu.reseau],
    consignes: contenu.consignes,
    legende: contenu.legende,
    hashtags: contenu.hashtags,
    prevuLe: contenu.prevuLe,
    echeanceLe: contenu.echeanceLe,
    soumisLe: contenu.soumisLe,
    publieLe: contenu.publieLe,
    publieUrl: contenu.publieUrl,
    creeLe: contenu.creeLe,
    majLe: contenu.majLe,
    client: { id: contenu.clientId, nom: contenu.clientNom, nomCourt: contenu.clientNomCourt },
    responsable: contenu.responsableId
      ? {
          id: contenu.responsableId,
          nom: contenu.responsableNom,
          initiales: contenu.responsableInitiales,
        }
      : null,
    versions,
    commentaires: fil,
  };
}

/* ------------------------------------------------------------ les tournages -- */

export type FiltresTournages = { debut?: string; fin?: string; limite: number };

/**
 * Les tournages d'une clé, avec leur équipe et ce qu'ils doivent livrer.
 *
 * En lecture seule, et ce n'est pas une prudence excessive : déplacer un
 * tournage, c'est déplacer l'agenda de plusieurs personnes et parfois celui
 * d'un client. Savoir qu'un tournage a lieu jeudi explique en revanche
 * pourquoi rien n'est prêt mercredi — c'est le contexte qui manque le plus à
 * qui suit un pipeline.
 */
export async function listerTournages(cle: ApiKey, filtres: FiltresTournages) {
  exige("tournages", "client");

  const bornes: SQL[] = [inArray(shoots.clientId, clientsAutorises(cle))];
  // Par défaut, ce qui reste à venir : un chef de projet arbitre sur la suite,
  // pas sur ce qui est déjà tourné.
  bornes.push(
    filtres.debut
      ? gte(shoots.startsAt, new Date(`${filtres.debut}T00:00:00Z`))
      : gte(shoots.startsAt, new Date()),
  );
  if (filtres.fin) bornes.push(lte(shoots.startsAt, new Date(`${filtres.fin}T23:59:59.999Z`)));

  const lignes = await db
    .select({
      id: shoots.id,
      titre: shoots.title,
      lieu: shoots.place,
      debuteLe: shoots.startsAt,
      finitLe: shoots.endsAt,
      statut: shoots.status,
      note: shoots.note,
      clientId: clients.id,
      clientNom: clients.name,
      clientNomCourt: clients.shortName,
    })
    .from(shoots)
    .innerJoin(clients, eq(clients.id, shoots.clientId))
    .where(and(...bornes))
    .orderBy(asc(shoots.startsAt))
    .limit(filtres.limite);

  if (lignes.length === 0) return [];
  const ids = lignes.map((l) => l.id);

  const equipes = await db
    .select({
      shootId: shootCrew.shootId,
      role: shootCrew.roleLabel,
      etat: shootCrew.state,
      nom: users.name,
      initiales: users.initials,
    })
    .from(shootCrew)
    .innerJoin(users, eq(users.id, shootCrew.userId))
    .where(inArray(shootCrew.shootId, ids));

  const livrables = await db
    .select({
      shootId: shootDeliverables.shootId,
      id: shootDeliverables.id,
      libelle: shootDeliverables.label,
      attenduLe: shootDeliverables.dueOn,
      livre: shootDeliverables.delivered,
    })
    .from(shootDeliverables)
    .where(inArray(shootDeliverables.shootId, ids))
    .orderBy(asc(shootDeliverables.position));

  return lignes.map((t) => ({
    id: t.id,
    titre: t.titre,
    lieu: t.lieu,
    debuteLe: t.debuteLe,
    finitLe: t.finitLe,
    statut: t.statut,
    note: t.note,
    client: { id: t.clientId, nom: t.clientNom, nomCourt: t.clientNomCourt },
    equipe: equipes
      .filter((e) => e.shootId === t.id)
      .map((e) => ({ nom: e.nom, initiales: e.initiales, role: e.role, etat: e.etat })),
    livrables: livrables
      .filter((l) => l.shootId === t.id)
      .map((l) => ({ id: l.id, libelle: l.libelle, attenduLe: l.attenduLe, livre: l.livre })),
  }));
}

/* --------------------------------------------------------------- l'équipe -- */

/**
 * Les personnes du pôle de la clé, et ce qu'elles ont sur les bras.
 *
 * Première ressource bornée par `pole` et non par `client` : quelqu'un de
 * l'agence n'est rattaché à aucun client, et le borner par client le rendrait
 * invisible partout. Le pôle reste une frontière réelle — l'équipe web n'a
 * rien à faire dans une API sociale.
 *
 * Le tri se fait avec `departmentsOf()`, la fonction qui sert déjà aux écrans :
 * elle porte deux règles qu'on oublierait en les réécrivant — la direction a
 * les deux pôles quoi qu'il arrive, et un compte sans pôle renseigné retombe
 * sur le social, ce qu'étaient tous les comptes avant que le web n'existe. Une
 * seconde version de cette règle finirait par diverger de la première.
 *
 * Le filtrage se fait donc en mémoire, après une lecture large. C'est tenable
 * ici et seulement ici : l'agence compte quelques personnes, et il s'agit
 * d'une lecture — aucune écriture ne dépend de cet intervalle.
 */
export async function listerEquipe(cle: ApiKey) {
  exige("equipe", "pole");

  const poles = (cle.departments ?? []).filter(
    (d): d is Department => d === "social" || d === "web",
  );
  // Une clé sans pôle ne voit personne, comme elle ne voit aucun client.
  if (poles.length === 0) return [];

  const membres = await db
    .select({
      id: users.id,
      nom: users.name,
      initiales: users.initials,
      poles: users.departments,
      role: users.role,
      actif: users.active,
    })
    .from(users)
    .where(eq(users.active, true))
    .orderBy(asc(users.name));

  const duPole = membres.filter((m) =>
    departmentsOf({ role: m.role, departments: m.poles }).some((d) => poles.includes(d)),
  );
  if (duPole.length === 0) return [];

  // La charge est un agrégat : il doit passer par le même verrou que les
  // listes, sinon il compterait juste sur le mauvais ensemble — et un compte
  // juste sur le mauvais ensemble ressemble à un compte juste.
  exige("contenus", "client");
  const charges = await db
    .select({
      responsableId: contents.ownerId,
      statut: contents.status,
      combien: count(),
    })
    .from(contents)
    .where(inArray(contents.id, contenusAutorises(cle)))
    .groupBy(contents.ownerId, contents.status);

  return duPole.map((m) => {
    const parStatut: Record<string, number> = {};
    for (const c of charges) {
      if (c.responsableId === m.id) parStatut[c.statut] = c.combien;
    }
    return {
      id: m.id,
      nom: m.nom,
      initiales: m.initiales,
      // `departmentsOf` plutôt que la colonne brute : c'est ce que l'outil
      // considère réellement, colonne vide comprise.
      poles: departmentsOf({ role: m.role, departments: m.poles }),
      charge: parStatut,
      total: Object.values(parStatut).reduce((n, v) => n + v, 0),
    };
  });
}

/* ------------------------------------------------------------ l'agrégat -- */

export type FiltresPipeline = { jours: number; limite: number };

/**
 * L'état du pipeline en un appel : ce qu'il y a, et ce qui cloche.
 *
 * Tout passe par `contenusAutorises()`, y compris les comptages. C'est le
 * point le plus délicat de cette couche : un COUNT juste sur le mauvais
 * ensemble ressemble trait pour trait à un COUNT juste, et la réponse ne porte
 * aucune trace de ce qu'il a compté. Une liste qui fuit se voit à l'œil nu
 * dans le JSON ; un agrégat qui fuit ne se voit jamais.
 *
 * Trois anomalies plutôt qu'un état des lieux neutre :
 *
 * - le **retard** se mesure sur `dueAt` et l'absence de publication, jamais sur
 *   le statut seul : un contenu marqué « prêt » depuis trois semaines est en
 *   retard, même si son statut a l'air sain.
 * - le **manque** est un statut à part entière — prévu, jamais publié. C'est ce
 *   qu'un calendrier ordinaire ne montre pas, puisqu'il n'affiche que ce qui
 *   existe.
 * - l'**attente de validation** se compte en jours depuis `submittedAt` : la
 *   question utile n'est pas « combien attendent » mais « depuis quand », et
 *   c'est celle-là qui déclenche une relance.
 */
export async function agregatPipeline(cle: ApiKey, filtres: FiltresPipeline) {
  exige("contenus", "client");

  const autorises = () => inArray(contents.id, contenusAutorises(cle));
  const maintenant = new Date();
  const seuil = new Date(maintenant.getTime() - filtres.jours * 86_400_000);

  // Un contenu publié n'est jamais en retard, quelle que soit son échéance.
  const enRetard = and(
    autorises(),
    lt(contents.dueAt, maintenant),
    isNull(contents.publishedAt),
    ne(contents.status, "publie"),
  ) as SQL;

  const enManque = and(autorises(), eq(contents.status, "manque")) as SQL;

  const enAttente = and(
    autorises(),
    eq(contents.status, "validation"),
    lt(contents.submittedAt, seuil),
  ) as SQL;

  const parClientEtStatut = await db
    .select({
      clientId: clients.id,
      clientNom: clients.name,
      clientNomCourt: clients.shortName,
      statut: contents.status,
      combien: count(),
    })
    .from(contents)
    .innerJoin(clients, eq(clients.id, contents.clientId))
    .where(autorises())
    .groupBy(clients.id, clients.name, clients.shortName, contents.status);

  /** Les contenus d'une anomalie, nommés — un compteur seul n'indique pas quoi faire. */
  const lister = (ou: SQL) =>
    db
      .select({
        id: contents.id,
        titre: contents.title,
        statut: contents.status,
        echeanceLe: contents.dueAt,
        prevuLe: contents.scheduledAt,
        soumisLe: contents.submittedAt,
        clientNomCourt: clients.shortName,
      })
      .from(contents)
      .innerJoin(clients, eq(clients.id, contents.clientId))
      .where(ou)
      .orderBy(asc(contents.dueAt), asc(contents.scheduledAt))
      .limit(filtres.limite);

  const [retards, manques, attentes] = await Promise.all([
    lister(enRetard),
    lister(enManque),
    lister(enAttente),
  ]);

  const parStatut: Record<string, number> = {};
  const clientsVus = new Map<
    string,
    { id: string; nom: string; nomCourt: string; parStatut: Record<string, number>; total: number }
  >();

  for (const ligne of parClientEtStatut) {
    parStatut[ligne.statut] = (parStatut[ligne.statut] ?? 0) + ligne.combien;

    const vu = clientsVus.get(ligne.clientId) ?? {
      id: ligne.clientId,
      nom: ligne.clientNom,
      nomCourt: ligne.clientNomCourt,
      parStatut: {},
      total: 0,
    };
    vu.parStatut[ligne.statut] = ligne.combien;
    vu.total += ligne.combien;
    clientsVus.set(ligne.clientId, vu);
  }

  const compter = (liste: { clientNomCourt: string }[], nomCourt: string) =>
    liste.filter((l) => l.clientNomCourt === nomCourt).length;

  return {
    total: Object.values(parStatut).reduce((n, v) => n + v, 0),
    parStatut,
    parClient: [...clientsVus.values()]
      .sort((a, b) => b.total - a.total)
      .map((c) => ({
        ...c,
        // Comptés sur les listes déjà bornées, pour deux raisons : recompter
        // en base ouvrirait une seconde occasion de se tromper de périmètre,
        // et ces compteurs doivent s'accorder avec ce que l'agent lit juste
        // au-dessus.
        //
        // Conséquence à connaître : ils sont plafonnés par `limite` comme les
        // listes. Au-delà de 50 anomalies d'une même nature, ils sous-comptent.
        // À l'échelle d'une agence qui produit quelques dizaines de contenus
        // par mois, le plafond ne mord pas — mais il existe, et le jour où il
        // mordra, c'est `limite` qu'il faudra monter, pas ces lignes.
        retards: compter(retards, c.nomCourt),
        manques: compter(manques, c.nomCourt),
        attentesDeValidation: compter(attentes, c.nomCourt),
      })),
    anomalies: {
      retards,
      manques,
      attentesDeValidation: attentes,
      // Le seuil est rappelé : « 3 en attente » ne veut rien dire sans « depuis
      // plus de combien de jours ».
      seuilEnJours: filtres.jours,
    },
  };
}

/* ------------------------------------------------------------ les écritures -- */

/**
 * Le refus d'une écriture, tel qu'une route le rendra.
 *
 * Un type de retour plutôt qu'une exception : une écriture refusée n'est pas
 * un incident, c'est une réponse. L'exception reste pour ce qui ne devrait
 * jamais arriver.
 */
export type Refus = { ok: false; statut: 400 | 404 | 409; message: string };
export type Succes<T> = { ok: true; valeur: T };
export type Resultat<T> = Succes<T> | Refus;

/**
 * La trace d'une écriture faite par une clé.
 *
 * `actorLabel` porte le nom de la clé, `actorId` reste vide : la colonne est
 * prévue pour ça — « vide quand l'action vient du système ». Sans cette ligne,
 * rien ne distinguerait dans l'historique une modification de l'agent d'une
 * modification humaine, et personne ne pourrait revenir sur ce qu'il a fait.
 *
 * Elle est écrite dans la même transaction que la mutation, jamais après. Une
 * écriture qui réussit sans sa trace est pire qu'une écriture refusée : le
 * pipeline aurait changé et l'historique dirait que personne ne l'a touché.
 */
type Journal = { clientId: string; contentId: string; texte: string };

const tracer = (tx: Parameters<Parameters<typeof db.transaction>[0]>[0], cle: ApiKey, j: Journal) =>
  tx.insert(activity).values({
    clientId: j.clientId,
    contentId: j.contentId,
    actorId: null,
    actorLabel: cle.name,
    text: j.texte,
  });

export type NouveauContenu = {
  clientId: string;
  titre: string;
  format?: "feed" | "story" | "reel" | "carrousel" | "autre";
  reseaux?: string[];
  consignes?: string;
  legende?: string;
  hashtags?: string[];
  prevuLe?: string;
  echeanceLe?: string;
  responsableId?: string;
};

/**
 * Crée un contenu, toujours au statut « idée ».
 *
 * Le statut n'est pas un paramètre : un contenu qui naîtrait « prêt à
 * publier » n'aurait traversé aucune des étapes qui font qu'il est prêt. On
 * crée, puis on fait avancer — et chaque avancée laisse sa trace.
 */
export async function creerContenu(
  cle: ApiKey,
  v: NouveauContenu,
): Promise<Resultat<{ id: string }>> {
  exige("contenus", "client");

  return db.transaction(async (tx) => {
    // Le périmètre est vérifié dans la transaction. Un client qui changerait de
    // pôle pendant ces quelques millisecondes laisserait un contenu créé chez
    // lui — invisible à la clé dès l'instant d'après, donc sans conséquence.
    const [client] = await tx
      .select({ id: clients.id })
      .from(clients)
      .where(and(eq(clients.id, v.clientId), perimetreDeLaCle(cle)))
      .limit(1);

    // Introuvable plutôt que « pas pour toi » : la seconde formule confirmerait
    // l'existence du client.
    if (!client) return { ok: false, statut: 404, message: "Client introuvable." } as Refus;

    if (v.responsableId) {
      const [personne] = await tx
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.id, v.responsableId), eq(users.active, true)))
        .limit(1);
      if (!personne) {
        return { ok: false, statut: 400, message: "Responsable introuvable." } as Refus;
      }
    }

    const [contenu] = await tx
      .insert(contents)
      .values({
        clientId: v.clientId,
        title: v.titre,
        status: "idee",
        kind: v.format ?? "feed",
        networks: v.reseaux ?? [],
        instructions: v.consignes,
        caption: v.legende,
        hashtags: v.hashtags ?? [],
        scheduledAt: v.prevuLe ? new Date(v.prevuLe) : null,
        dueAt: v.echeanceLe ? new Date(v.echeanceLe) : null,
        ownerId: v.responsableId ?? null,
      })
      .returning({ id: contents.id });

    await tracer(tx, cle, {
      clientId: v.clientId,
      contentId: contenu.id,
      texte: `Contenu « ${v.titre} » créé`,
    });

    return { ok: true, valeur: { id: contenu.id } } as Succes<{ id: string }>;
  });
}

export type ModifsContenu = {
  titre?: string;
  statut?: ContentStatus;
  format?: "feed" | "story" | "reel" | "carrousel" | "autre";
  reseaux?: string[];
  consignes?: string;
  legende?: string;
  hashtags?: string[];
  prevuLe?: string | null;
  echeanceLe?: string | null;
  responsableId?: string | null;
};

/**
 * Modifie un contenu, dans les seules colonnes autorisées.
 *
 * `publishedAt`, `publishedUrl` et `publishedById` n'y figurent pas et n'y
 * figureront pas : ce sont les trois colonnes qui attestent qu'une personne a
 * constaté une publication réelle, et le suivi calcule les retards dessus.
 */
export async function modifierContenu(
  cle: ApiKey,
  id: string,
  modifs: ModifsContenu,
): Promise<Resultat<{ id: string; statut: string }>> {
  exige("contenus", "client");

  return db.transaction(async (tx) => {
    const [avant] = await tx
      .select({ id: contents.id, titre: contents.title, statut: contents.status, clientId: contents.clientId })
      .from(contents)
      .where(and(eq(contents.id, id), inArray(contents.id, contenusAutorises(cle))))
      .limit(1);

    if (!avant) return { ok: false, statut: 404, message: "Contenu introuvable." } as Refus;

    if (modifs.statut) {
      const verdict = transitionPermise(avant.statut as ContentStatus, modifs.statut);
      if (!verdict.permise) {
        // 409 et non 400 : la demande est bien formée, c'est l'état actuel qui
        // s'y oppose. Un agent qui distingue les deux sait s'il doit corriger
        // son appel ou relire le pipeline.
        return { ok: false, statut: 409, message: verdict.raison } as Refus;
      }
    }

    if (modifs.responsableId) {
      const [personne] = await tx
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.id, modifs.responsableId), eq(users.active, true)))
        .limit(1);
      if (!personne) {
        return { ok: false, statut: 400, message: "Responsable introuvable." } as Refus;
      }
    }

    const champs: Record<string, unknown> = { updatedAt: new Date() };
    if (modifs.titre !== undefined) champs.title = modifs.titre;
    if (modifs.statut !== undefined) champs.status = modifs.statut;
    if (modifs.format !== undefined) champs.kind = modifs.format;
    if (modifs.reseaux !== undefined) champs.networks = modifs.reseaux;
    if (modifs.consignes !== undefined) champs.instructions = modifs.consignes;
    if (modifs.legende !== undefined) champs.caption = modifs.legende;
    if (modifs.hashtags !== undefined) champs.hashtags = modifs.hashtags;
    if (modifs.prevuLe !== undefined) {
      champs.scheduledAt = modifs.prevuLe ? new Date(modifs.prevuLe) : null;
    }
    if (modifs.echeanceLe !== undefined) {
      champs.dueAt = modifs.echeanceLe ? new Date(modifs.echeanceLe) : null;
    }
    if (modifs.responsableId !== undefined) champs.ownerId = modifs.responsableId;
    // Passer en validation, c'est demander une réponse à quelqu'un : la date
    // sert à compter les jours d'attente, et le suivi s'en sert pour relancer.
    if (modifs.statut === "validation" && avant.statut !== "validation") {
      champs.submittedAt = new Date();
    }

    const [apres] = await tx
      .update(contents)
      .set(champs)
      // Le périmètre est reposé dans le `where` de l'update lui-même, et non
      // déduit de la lecture ci-dessus : entre les deux, un contenu peut
      // changer de client.
      .where(and(eq(contents.id, id), inArray(contents.id, contenusAutorises(cle))))
      .returning({ id: contents.id, statut: contents.status });

    if (!apres) return { ok: false, statut: 404, message: "Contenu introuvable." } as Refus;

    const dit =
      modifs.statut && modifs.statut !== avant.statut
        ? `« ${avant.titre} » déplacé vers ${modifs.statut}`
        : `« ${avant.titre} » modifié`;
    await tracer(tx, cle, { clientId: avant.clientId, contentId: id, texte: dit });

    return { ok: true, valeur: apres } as Succes<{ id: string; statut: string }>;
  });
}

/** Ajoute un commentaire au fil d'un contenu. */
export async function ajouterCommentaire(
  cle: ApiKey,
  contentId: string,
  texte: string,
): Promise<Resultat<{ id: string }>> {
  exige("commentaires", "client");

  return db.transaction(async (tx) => {
    const [contenu] = await tx
      .select({ id: contents.id, titre: contents.title, clientId: contents.clientId })
      .from(contents)
      .where(and(eq(contents.id, contentId), inArray(contents.id, contenusAutorises(cle))))
      .limit(1);

    if (!contenu) return { ok: false, statut: 404, message: "Contenu introuvable." } as Refus;

    const [commentaire] = await tx
      .insert(comments)
      // `authorId` reste vide comme `actorId` du journal : ce n'est personne de
      // l'équipe qui parle, et l'attribuer à quelqu'un serait un faux.
      .values({ contentId, authorId: null, body: texte })
      .returning({ id: comments.id });

    await tracer(tx, cle, {
      clientId: contenu.clientId,
      contentId,
      texte: `Remarque ajoutée sur « ${contenu.titre} »`,
    });

    return { ok: true, valeur: { id: commentaire.id } } as Succes<{ id: string }>;
  });
}
