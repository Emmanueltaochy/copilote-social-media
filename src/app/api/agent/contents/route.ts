import { and, asc, desc, eq, gte, inArray, lte, type SQL } from "drizzle-orm";
import { z } from "zod";
import { clients, contents, db, users } from "@/db";
import { perimetreDeLaCle, withApiKey } from "@/lib/api-auth";

/**
 * Le pipeline de contenus, tel qu'un agent chef de projet le lit.
 *
 * Première et seule route de lecture pour l'instant : une lecture qui refuse
 * correctement vaut mieux que six routes dont on espère qu'elles refusent.
 */
export const dynamic = "force-dynamic";

const STATUTS = [
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

/**
 * Les filtres, en français comme les valeurs qu'ils acceptent : demander
 * `?status=validation` quand la valeur elle-même est française serait un
 * mélange que personne ne retient.
 */
const Filtres = z.object({
  client: z.uuid({ error: "« client » attend l'identifiant d'un client (uuid)." }).optional(),
  statut: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : undefined))
    .pipe(
      z
        .array(
          z.enum(STATUTS, {
            error: `« statut » accepte : ${STATUTS.join(", ")}.`,
          }),
        )
        .optional(),
    ),
  debut: z.iso
    .date({ error: "« debut » attend une date au format AAAA-MM-JJ." })
    .optional(),
  fin: z.iso.date({ error: "« fin » attend une date au format AAAA-MM-JJ." }).optional(),
  limite: z.coerce
    .number({ error: "« limite » attend un nombre." })
    .int()
    .min(1)
    .max(200, { error: "« limite » ne peut pas dépasser 200." })
    .default(50),
});

export const GET = withApiKey("pipeline:read", async (request, cle) => {
  const brut = Object.fromEntries(new URL(request.url).searchParams);
  const lu = Filtres.safeParse(brut);
  if (!lu.success) {
    // Le premier problème suffit à corriger l'appel, et une liste d'erreurs
    // internes de Zod ne se lit pas.
    return Response.json({ error: lu.error.issues[0].message }, { status: 400 });
  }
  const { client, statut, debut, fin, limite } = lu.data;

  const bornes: SQL[] = [
    // Le périmètre de la clé d'abord, avant tout filtre demandé : un paramètre
    // ne doit jamais pouvoir élargir ce que la clé autorise.
    perimetreDeLaCle(cle),
  ];

  // Un client demandé hors du périmètre ne renvoie rien, plutôt qu'une erreur :
  // dire « ce client existe mais pas pour toi » est déjà en dire trop.
  if (client) bornes.push(eq(contents.clientId, client));
  if (statut && statut.length > 0) bornes.push(inArray(contents.status, statut));
  if (debut) bornes.push(gte(contents.scheduledAt, new Date(`${debut}T00:00:00Z`)));
  // Fin incluse : « du 1er au 31 » ne doit pas s'arrêter le 30 au soir.
  if (fin) bornes.push(lte(contents.scheduledAt, new Date(`${fin}T23:59:59.999Z`)));

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
      // Projection explicite, jamais un select() nu : `clients` porte le
      // forfait mensuel, les heures vendues et les tarifs web, qui n'ont rien
      // à faire dans la réponse d'un agent de pipeline.
      clientId: clients.id,
      clientNom: clients.name,
      clientNomCourt: clients.shortName,
      // Même raison côté personnes : de quoi savoir à qui parler, pas qui elles
      // sont. Ni courriel, ni jeton d'invitation, ni rôle.
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
    .limit(limite);

  const contenus = lignes.map((l) => ({
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
    // assigné ; « pas de responsable » se dit `null`, pas `{id: null}`.
    responsable: l.responsableId
      ? { id: l.responsableId, nom: l.responsableNom, initiales: l.responsableInitiales }
      : null,
  }));

  return Response.json({ contenus, nombre: contenus.length, limite });
});
