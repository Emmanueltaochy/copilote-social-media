import "server-only";

import { and, asc, desc, eq, gte, inArray, lte, type SQL } from "drizzle-orm";
import { clients, contents, db, users, type ApiKey } from "@/db";
import { perimetreDeLaCle } from "./api-auth";

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
