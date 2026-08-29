import "server-only";

import { and, asc, count, desc, eq, gte, isNotNull, isNull, lt, sql as raw } from "drizzle-orm";
import { db } from "./index";
import {
  activity,
  adMetrics,
  adSets,
  campaigns,
  clientFiles,
  clients,
  comments,
  contentLinks,
  contents,
  contentStats,
  contentVersions,
  assets,
  assetFolders,
  assetUsages,
  contractLines,
  gearPresets,
  shoots,
  shootCrew,
  shootDeliverables,
  shootGear,
  shootRights,
  shots,
  timeEntries,
  users,
  type Client,
} from "./schema";
import { monthRange, pace, type Pace } from "@/lib/pacing";

/* ---------------------------------------------------------------- clients -- */

/**
 * Le filtre de pôle appliqué aux clients.
 *
 * Un client web n'a rien à faire dans les écrans du social, et inversement : le
 * cockpit compterait des engagements mensuels qui n'existent pas, et les listes
 * déroulantes proposeraient des comptes qu'on ne sert pas. Sans pôle demandé,
 * on ne filtre pas — c'est le cas des écrans partagés.
 */
const duPole = (pole?: "social" | "web") =>
  pole ? raw`${clients.departments} ? ${pole}` : undefined;

export type ClientWithPace = Client & {
  /** Contenus publiés dans le mois courant. */
  done: number;
  pace: Pace;
};

/**
 * Le cœur du cockpit : chaque client avec son avancement du mois.
 *
 * « Publié » se mesure sur `publishedAt`, jamais sur le statut : un contenu
 * marqué publié sans date ne prouve rien, et c'est la date qui permet de
 * rattacher le contenu au bon mois.
 */
export async function listClientsWithPace(
  now: Date = new Date(),
  pole?: "social" | "web",
): Promise<ClientWithPace[]> {
  const { start, end } = monthRange(now);

  const rows = await db
    .select({
      client: clients,
      done: count(contents.id),
    })
    .from(clients)
    .leftJoin(
      contents,
      and(
        eq(contents.clientId, clients.id),
        isNotNull(contents.publishedAt),
        gte(contents.publishedAt, start),
        lt(contents.publishedAt, end),
      ),
    )
    .where(and(eq(clients.active, true), duPole(pole)))
    .groupBy(clients.id)
    .orderBy(asc(clients.shortName));

  return rows.map(({ client, done }) => ({
    ...client,
    done,
    pace: pace(done, client.contentTarget, now),
  }));
}

/** Ordre du cockpit : le plus urgent en premier. */
const URGENCY: Record<string, number> = { late: 0, risk: 1, ontime: 2, ahead: 3, none: 4 };

export function byUrgency(list: ClientWithPace[]): ClientWithPace[] {
  return [...list].sort(
    (a, b) => URGENCY[a.pace.key] - URGENCY[b.pace.key] || a.pace.gap - b.pace.gap,
  );
}

export async function getClient(id: string): Promise<Client | null> {
  const rows = await db.select().from(clients).where(eq(clients.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function getClientWithPace(
  id: string,
  now: Date = new Date(),
): Promise<ClientWithPace | null> {
  const client = await getClient(id);
  if (!client) return null;
  const { start, end } = monthRange(now);
  const [{ n }] = await db
    .select({ n: count() })
    .from(contents)
    .where(
      and(
        eq(contents.clientId, id),
        isNotNull(contents.publishedAt),
        gte(contents.publishedAt, start),
        lt(contents.publishedAt, end),
      ),
    );
  return { ...client, done: n, pace: pace(n, client.contentTarget, now) };
}

export async function listContractLines(clientId: string) {
  return db
    .select()
    .from(contractLines)
    .where(eq(contractLines.clientId, clientId))
    .orderBy(asc(contractLines.position));
}

/* --------------------------------------------------------------- contenus -- */

/** Contenus programmés sur un mois : alimente le calendrier. */
export async function listContentsForMonth(now: Date = new Date(), clientId?: string) {
  const { start, end } = monthRange(now);
  return db
    .select({
      content: contents,
      clientName: clients.shortName,
    })
    .from(contents)
    .innerJoin(clients, eq(clients.id, contents.clientId))
    .where(
      and(
        gte(contents.scheduledAt, start),
        lt(contents.scheduledAt, end),
        clientId ? eq(contents.clientId, clientId) : undefined,
      ),
    )
    .orderBy(asc(contents.scheduledAt));
}

/** Le pipeline : tout ce qui n'est ni publié ni abandonné. */
export async function listPipeline(clientId?: string) {
  return db
    .select({ content: contents, clientName: clients.shortName, ownerName: users.name })
    .from(contents)
    .innerJoin(clients, eq(clients.id, contents.clientId))
    .leftJoin(users, eq(users.id, contents.ownerId))
    .where(and(clientId ? eq(contents.clientId, clientId) : undefined))
    .orderBy(asc(contents.dueAt));
}

/** La file du jour : ce qui est prêt et doit partir aujourd'hui. */
export async function listTodayQueue(now: Date = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start.getTime() + 86_400_000);
  return db
    .select({ content: contents, clientName: clients.shortName })
    .from(contents)
    .innerJoin(clients, eq(clients.id, contents.clientId))
    .where(and(gte(contents.scheduledAt, start), lt(contents.scheduledAt, end)))
    .orderBy(asc(contents.scheduledAt));
}

/**
 * Tout ce qui est prêt à partir, quelle qu'en soit la date.
 *
 * « À publier » doit dire la même chose que la colonne du pipeline qui porte ce
 * nom : un contenu validé et prêt depuis trois jours attend toujours, et le
 * filtrer sur la seule journée en cours le faisait disparaître de l'écran censé
 * le rattraper. L'ordre met devant ce qui aurait déjà dû sortir.
 */
export async function listReadyToPublish(clientId?: string) {
  return db
    .select({ content: contents, clientName: clients.shortName })
    .from(contents)
    .innerJoin(clients, eq(clients.id, contents.clientId))
    .where(
      and(
        eq(contents.status, "pret"),
        isNull(contents.publishedAt),
        clientId ? eq(contents.clientId, clientId) : undefined,
      ),
    )
    .orderBy(raw`${contents.scheduledAt} asc nulls last`);
}

/** Ce qui est programmé aujourd'hui sans être encore prêt : le rappel du jour. */
export async function listScheduledTodayNotReady(now: Date = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start.getTime() + 86_400_000);
  return db
    .select({ content: contents, clientName: clients.shortName })
    .from(contents)
    .innerJoin(clients, eq(clients.id, contents.clientId))
    .where(
      and(
        gte(contents.scheduledAt, start),
        lt(contents.scheduledAt, end),
        isNull(contents.publishedAt),
        raw`${contents.status} <> 'pret'`,
      ),
    )
    .orderBy(asc(contents.scheduledAt));
}

/** Publiés aujourd'hui : la preuve que la journée a été faite. */
export async function listPublishedToday(now: Date = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start.getTime() + 86_400_000);
  return db
    .select({ content: contents, clientName: clients.shortName })
    .from(contents)
    .innerJoin(clients, eq(clients.id, contents.clientId))
    .where(and(gte(contents.publishedAt, start), lt(contents.publishedAt, end)))
    .orderBy(desc(contents.publishedAt));
}

/**
 * En attente de validation, interne ou client.
 *
 * Le délai d'attente est calculé par la base : l'heure du serveur fait
 * autorité, et le rendu d'une page n'a pas à dépendre d'une horloge lue au
 * milieu de l'affichage.
 */
export async function listAwaitingApproval(clientId?: string) {
  return db
    .select({
      content: contents,
      clientName: clients.shortName,
      waitingDays: raw<number | null>`case when ${contents.submittedAt} is null then null
        else floor(extract(epoch from (now() - ${contents.submittedAt})) / 86400)::int end`,
    })
    .from(contents)
    .innerJoin(clients, eq(clients.id, contents.clientId))
    .where(
      and(
        raw`${contents.status} in ('revision','validation')`,
        clientId ? eq(contents.clientId, clientId) : undefined,
      ),
    )
    .orderBy(asc(contents.submittedAt));
}

/**
 * Publications manquées : l'heure prévue est passée et rien n'a été publié.
 * C'est l'alerte la plus importante du cockpit.
 */
export async function countMissedPublications(now: Date = new Date()) {
  const [{ n }] = await db
    .select({ n: count() })
    .from(contents)
    .where(
      and(
        isNull(contents.publishedAt),
        isNotNull(contents.scheduledAt),
        lt(contents.scheduledAt, now),
        raw`${contents.status} in ('pret','manque')`,
      ),
    );
  return n;
}

/* -------------------------------------------------------------- tournages -- */

export async function listUpcomingShoots(now: Date = new Date(), clientId?: string) {
  return db
    .select({ shoot: shoots, clientName: clients.shortName })
    .from(shoots)
    .innerJoin(clients, eq(clients.id, shoots.clientId))
    .where(and(gte(shoots.startsAt, now), clientId ? eq(shoots.clientId, clientId) : undefined))
    .orderBy(asc(shoots.startsAt));
}

/**
 * Le planning terrain, avec ce qui bloque le départ compté en base.
 *
 * Les compteurs sont des sous-requêtes plutôt que cinq allers-retours par
 * tournage : la liste doit rester lisible d'un coup d'œil même avec vingt
 * fiches, et c'est le point bloquant qu'on vient y chercher.
 */
export async function listShoots(opts: { from?: Date; clientId?: string } = {}) {
  const sub = (table: string, extra = "") =>
    raw<number>`(select count(*)::int from ${raw.raw(table)} where shoot_id = ${shoots.id}${raw.raw(extra)})`;

  return db
    .select({
      shoot: shoots,
      clientName: clients.shortName,
      shots: sub("shots"),
      shotsDone: sub("shots", " and done"),
      gearTotal: sub("shoot_gear"),
      gearReserved: sub("shoot_gear", " and reserved"),
      rightsTotal: sub("shoot_rights"),
      rightsSigned: sub("shoot_rights", " and signed"),
      crew: sub("shoot_crew"),
    })
    .from(shoots)
    .innerJoin(clients, eq(clients.id, shoots.clientId))
    .where(
      and(
        opts.from ? gte(shoots.startsAt, opts.from) : undefined,
        opts.clientId ? eq(shoots.clientId, opts.clientId) : undefined,
      ),
    )
    .orderBy(asc(shoots.startsAt));
}

export async function getShoot(id: string) {
  const rows = await db
    .select({ shoot: shoots, client: clients })
    .from(shoots)
    .innerJoin(clients, eq(clients.id, shoots.clientId))
    .where(eq(shoots.id, id))
    .limit(1);
  if (!rows[0]) return null;

  const [shotRows, gear, rights, deliverables, crew, media] = await Promise.all([
    db.select().from(shots).where(eq(shots.shootId, id)).orderBy(asc(shots.position)),
    db.select().from(shootGear).where(eq(shootGear.shootId, id)).orderBy(asc(shootGear.position)),
    db.select().from(shootRights).where(eq(shootRights.shootId, id)).orderBy(asc(shootRights.position)),
    db
      .select()
      .from(shootDeliverables)
      .where(eq(shootDeliverables.shootId, id))
      .orderBy(asc(shootDeliverables.position)),
    db
      .select({
        userId: shootCrew.userId,
        roleLabel: shootCrew.roleLabel,
        state: shootCrew.state,
        name: users.name,
        initials: users.initials,
        avatarPath: users.avatarPath,
      })
      .from(shootCrew)
      .innerJoin(users, eq(users.id, shootCrew.userId))
      .where(eq(shootCrew.shootId, id))
      .orderBy(asc(users.name)),
    db.select().from(assets).where(eq(assets.shootId, id)).orderBy(desc(assets.createdAt)),
  ]);

  return { ...rows[0], shots: shotRows, gear, rights, deliverables, crew, media };
}

/* -------------------------------------------------------------- campagnes -- */

export async function listCampaigns(clientId?: string) {
  return db
    .select({ campaign: campaigns, clientName: clients.shortName })
    .from(campaigns)
    .innerJoin(clients, eq(clients.id, campaigns.clientId))
    .where(clientId ? eq(campaigns.clientId, clientId) : undefined)
    .orderBy(desc(campaigns.createdAt));
}

/**
 * Les campagnes avec les chiffres du mois courant.
 *
 * L'agrégat est fait en base sur les saisies hebdomadaires : additionner côté
 * application obligerait à charger toutes les lignes de toutes les semaines
 * pour n'en afficher que six totaux.
 */
export async function listCampaignsWithTotals(now: Date = new Date(), clientId?: string) {
  const { start, end } = monthRange(now);
  const from = start.toISOString().slice(0, 10);
  const to = end.toISOString().slice(0, 10);

  const total = (col: string) => raw<number>`coalesce((
    select sum(m.${raw.raw(col)}) from ad_metrics m
    join ad_sets s on s.id = m.ad_set_id
    where s.campaign_id = ${campaigns.id} and m.week_start >= ${from} and m.week_start < ${to}
  ), 0)::int`;

  return db
    .select({
      campaign: campaigns,
      clientName: clients.shortName,
      spendCents: total("spend_cents"),
      impressions: total("impressions"),
      clicks: total("clicks"),
      leads: total("leads"),
      conversions: total("conversions"),
      revenueCents: total("revenue_cents"),
      sets: raw<number>`(select count(*)::int from ad_sets where campaign_id = ${campaigns.id})`,
    })
    .from(campaigns)
    .innerJoin(clients, eq(clients.id, campaigns.clientId))
    .where(clientId ? eq(campaigns.clientId, clientId) : undefined)
    .orderBy(asc(clients.shortName), desc(campaigns.createdAt));
}

export async function getCampaign(id: string) {
  const rows = await db
    .select({ campaign: campaigns, client: clients })
    .from(campaigns)
    .innerJoin(clients, eq(clients.id, campaigns.clientId))
    .where(eq(campaigns.id, id))
    .limit(1);
  if (!rows[0]) return null;

  const sets = await db
    .select()
    .from(adSets)
    .where(eq(adSets.campaignId, id))
    .orderBy(asc(adSets.position));

  const metrics = sets.length
    ? await db
        .select({ metric: adMetrics, capturedByName: users.name })
        .from(adMetrics)
        .leftJoin(users, eq(users.id, adMetrics.capturedById))
        .where(
          raw`${adMetrics.adSetId} in (${raw.join(
            sets.map((s) => raw`${s.id}::uuid`),
            raw`, `,
          )})`,
        )
        .orderBy(desc(adMetrics.weekStart))
    : [];

  return { ...rows[0], sets, metrics };
}

/* ------------------------------------------------------------ rentabilité -- */

/**
 * Heures consommées par client sur le mois. Le coût n'est pas calculé ici :
 * il dépend du tarif horaire en vigueur à la date de la saisie, ce que seul
 * l'écran de rentabilité assemble.
 */
export async function hoursByClient(now: Date = new Date()) {
  const { start, end } = monthRange(now);
  return db
    .select({
      clientId: timeEntries.clientId,
      minutes: raw<number>`coalesce(sum(${timeEntries.minutes}), 0)::int`,
    })
    .from(timeEntries)
    .where(and(gte(timeEntries.weekStart, start.toISOString().slice(0, 10)),
               lt(timeEntries.weekStart, end.toISOString().slice(0, 10))))
    .groupBy(timeEntries.clientId);
}

/* ---------------------------------------------------------------- équipe -- */

export async function listStaff() {
  return db
    .select()
    .from(users)
    .where(raw`${users.role} in ('direction','equipe')`)
    .orderBy(asc(users.name));
}


/* ------------------------------------------------------ détail d'un contenu -- */

export async function getContent(id: string) {
  const rows = await db
    .select({ content: contents, client: clients, ownerName: users.name })
    .from(contents)
    .innerJoin(clients, eq(clients.id, contents.clientId))
    .leftJoin(users, eq(users.id, contents.ownerId))
    .where(eq(contents.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function listComments(contentId: string) {
  return db
    .select({ comment: comments, authorName: users.name, authorInitials: users.initials })
    .from(comments)
    .leftJoin(users, eq(users.id, comments.authorId))
    .where(eq(comments.contentId, contentId))
    .orderBy(asc(comments.createdAt));
}

export async function listVersions(contentId: string) {
  return db
    .select()
    .from(contentVersions)
    .where(eq(contentVersions.contentId, contentId))
    .orderBy(desc(contentVersions.number));
}

export async function listActivity(contentId: string) {
  return db
    .select({ entry: activity, actorName: users.name })
    .from(activity)
    .leftJoin(users, eq(users.id, activity.actorId))
    .where(eq(activity.contentId, contentId))
    .orderBy(desc(activity.createdAt))
    .limit(20);
}

/** Clients actifs, pour les listes déroulantes des formulaires. */
export async function listClientOptions(pole?: "social" | "web") {
  return db
    .select({ id: clients.id, name: clients.shortName })
    .from(clients)
    .where(and(eq(clients.active, true), duPole(pole)))
    .orderBy(asc(clients.shortName));
}


/* ----------------------------------------------------------------- assets -- */

export async function listAssets(clientId?: string, folderId?: string | null) {
  return db
    .select({ asset: assets, clientName: clients.shortName, authorName: users.name })
    .from(assets)
    .innerJoin(clients, eq(clients.id, assets.clientId))
    .leftJoin(users, eq(users.id, assets.authorId))
    .where(
      and(
        clientId ? eq(assets.clientId, clientId) : undefined,
        // `undefined` = on ne filtre pas, `null` = la racine. La nuance compte :
        // sans elle, ouvrir la bibliothèque d'un client montrerait d'un bloc ce
        // qu'on vient justement de ranger dans des dossiers.
        folderId === undefined ? undefined : folderId === null ? isNull(assets.folderId) : eq(assets.folderId, folderId),
      ),
    )
    .orderBy(desc(assets.createdAt));
}

/**
 * Les dossiers d'un client, à plat.
 *
 * L'arborescence se reconstruit en mémoire : elle compte quelques dizaines de
 * nœuds, et une requête récursive coûterait plus cher à lire qu'à exécuter.
 * Chaque dossier porte le nombre de médias qu'il contient en propre — celui de
 * ses sous-dossiers se cumule ensuite côté écran.
 */
export async function listAssetFolders(clientId: string) {
  return db
    .select({
      id: assetFolders.id,
      parentId: assetFolders.parentId,
      name: assetFolders.name,
      medias: raw<number>`(select count(*)::int from assets a where a.folder_id = ${assetFolders.id})`,
    })
    .from(assetFolders)
    .where(eq(assetFolders.clientId, clientId))
    .orderBy(asc(assetFolders.name));
}

/**
 * Tous les dossiers, tous clients confondus.
 *
 * Sert le formulaire d'import : la destination doit se mettre à jour dès qu'on
 * change de client dans la liste déroulante, sans attendre un aller-retour
 * serveur au milieu d'une sélection de trente fichiers.
 */
export async function listAllAssetFolders() {
  return db
    .select({
      id: assetFolders.id,
      clientId: assetFolders.clientId,
      parentId: assetFolders.parentId,
      name: assetFolders.name,
    })
    .from(assetFolders)
    .orderBy(asc(assetFolders.name));
}

/** Combien de médias à la racine d'un client, hors de tout dossier. */
export async function assetsAtRoot(clientId: string) {
  const [row] = await db
    .select({ n: count() })
    .from(assets)
    .where(and(eq(assets.clientId, clientId), isNull(assets.folderId)));
  return row?.n ?? 0;
}

/**
 * Combien de médias par client.
 *
 * Sert les filtres de la bibliothèque : un client affiché sans compte oblige
 * à cliquer pour découvrir qu'il n'a rien.
 */
export async function assetCountsByClient() {
  const rows = await db
    .select({ clientId: assets.clientId, n: count() })
    .from(assets)
    .groupBy(assets.clientId);
  return new Map(rows.map((r) => [r.clientId, r.n]));
}

/** Poids total des médias : sert l'indicateur d'espace de l'écran Assets. */
export async function assetsFootprint() {
  const [row] = await db
    .select({
      files: count(),
      bytes: raw<number>`coalesce(sum(${assets.sizeBytes}), 0)::bigint`,
    })
    .from(assets);
  return { files: row?.files ?? 0, bytes: Number(row?.bytes ?? 0) };
}


/** Comptes portail rattachés à un client. */
export async function listClientAccess(clientId: string) {
  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      inviteToken: users.inviteToken,
    })
    .from(users)
    .where(and(eq(users.clientId, clientId), eq(users.active, true)))
    .orderBy(asc(users.name));
}

/* ------------------------------------------------------------------ heures -- */

/** Saisies d'une personne sur un mois, du plus récent au plus ancien. */
export async function listTimeEntries(userId: string, now: Date = new Date()) {
  const { start, end } = monthRange(now);
  return db
    .select({ entry: timeEntries, clientName: clients.shortName })
    .from(timeEntries)
    .innerJoin(clients, eq(clients.id, timeEntries.clientId))
    .where(
      and(
        eq(timeEntries.userId, userId),
        gte(timeEntries.weekStart, start.toISOString().slice(0, 10)),
        lt(timeEntries.weekStart, end.toISOString().slice(0, 10)),
      ),
    )
    .orderBy(desc(timeEntries.weekStart), asc(clients.shortName));
}

/**
 * Coût des heures passées, par client, sur le mois.
 *
 * Le tarif retenu est celui en vigueur à la semaine de la saisie, pas le
 * tarif actuel : une augmentation de salaire ne doit pas réécrire la marge
 * des mois déjà clos.
 */
export async function costByClient(now: Date = new Date(), pole?: "social" | "web") {
  const { start, end } = monthRange(now);
  const from = start.toISOString().slice(0, 10);
  const to = end.toISOString().slice(0, 10);

  return db
    .select({
      clientId: timeEntries.clientId,
      minutes: raw<number>`coalesce(sum(${timeEntries.minutes}), 0)::int`,
      // Les noms de colonnes de la requête extérieure sont écrits en toutes
      // lettres, et non interpolés : dans une requête sans jointure, drizzle
      // les rend sans préfixe de table, et « user_id » se résoudrait alors
      // contre hourly_rates.user_id — la condition serait toujours vraie et
      // n'importe quel tarif ferait l'affaire.
      costCents: raw<number>`coalesce(sum(
        ${timeEntries.minutes} * coalesce((
          select r.cost_per_hour_cents from hourly_rates r
          where r.user_id = time_entries.user_id
            and r.effective_from <= time_entries.week_start
          order by r.effective_from desc limit 1
        ), 0) / 60.0
      ), 0)::int`,
    })
    .from(timeEntries)
    .where(
      and(
        gte(timeEntries.weekStart, from),
        lt(timeEntries.weekStart, to),
        // Un client qui achète les deux prestations a deux marges. Compter
        // l'intégration de son site contre son forfait social donnerait une
        // perte là où il n'y en a pas.
        pole ? eq(timeEntries.pole, pole) : undefined,
      ),
    )
    .groupBy(timeEntries.clientId);
}

/** Tarif horaire courant de chaque membre de l'équipe. */
export async function listRates() {
  return db
    .select({
      userId: users.id,
      name: users.name,
      role: users.role,
      costPerHourCents: raw<number | null>`(
        select r.cost_per_hour_cents from hourly_rates r
        where r.user_id = users.id order by r.effective_from desc limit 1
      )`,
    })
    .from(users)
    .where(raw`${users.role} in ('direction','equipe')`)
    .orderBy(asc(users.name));
}

/* ---------------------------------------------------------------- rapports -- */

/**
 * Tout ce que contient le rapport mensuel d'un client.
 *
 * Une seule fonction plutôt qu'une par bloc : le rapport se lit comme un tout,
 * et charger ses morceaux depuis plusieurs endroits finirait par produire des
 * chiffres qui ne se recoupent pas d'un bloc à l'autre.
 */
export async function monthlyReport(clientId: string, now: Date = new Date()) {
  const { start, end } = monthRange(now);
  const from = start.toISOString().slice(0, 10);
  const to = end.toISOString().slice(0, 10);

  const [published, shootRows, mediaCount, campaignRows] = await Promise.all([
    db
      .select({ content: contents, stats: contentStats })
      .from(contents)
      .leftJoin(contentStats, eq(contentStats.contentId, contents.id))
      .where(
        and(
          eq(contents.clientId, clientId),
          isNotNull(contents.publishedAt),
          gte(contents.publishedAt, start),
          lt(contents.publishedAt, end),
        ),
      )
      .orderBy(asc(contents.publishedAt)),

    db
      .select()
      .from(shoots)
      .where(
        and(gte(shoots.startsAt, start), lt(shoots.startsAt, end), eq(shoots.clientId, clientId)),
      )
      .orderBy(asc(shoots.startsAt)),

    db
      .select({ n: count() })
      .from(assets)
      .where(
        and(
          eq(assets.clientId, clientId),
          gte(assets.createdAt, start),
          lt(assets.createdAt, end),
        ),
      ),

    db
      .select({
        campaign: campaigns,
        spendCents: raw<number>`coalesce((
          select sum(m.spend_cents) from ad_metrics m
          join ad_sets s on s.id = m.ad_set_id
          where s.campaign_id = campaigns.id and m.week_start >= ${from} and m.week_start < ${to}
        ), 0)::int`,
        impressions: raw<number>`coalesce((
          select sum(m.impressions) from ad_metrics m
          join ad_sets s on s.id = m.ad_set_id
          where s.campaign_id = campaigns.id and m.week_start >= ${from} and m.week_start < ${to}
        ), 0)::int`,
        clicks: raw<number>`coalesce((
          select sum(m.clicks) from ad_metrics m
          join ad_sets s on s.id = m.ad_set_id
          where s.campaign_id = campaigns.id and m.week_start >= ${from} and m.week_start < ${to}
        ), 0)::int`,
        leads: raw<number>`coalesce((
          select sum(m.leads) from ad_metrics m
          join ad_sets s on s.id = m.ad_set_id
          where s.campaign_id = campaigns.id and m.week_start >= ${from} and m.week_start < ${to}
        ), 0)::int`,
        conversions: raw<number>`coalesce((
          select sum(m.conversions) from ad_metrics m
          join ad_sets s on s.id = m.ad_set_id
          where s.campaign_id = campaigns.id and m.week_start >= ${from} and m.week_start < ${to}
        ), 0)::int`,
        revenueCents: raw<number>`coalesce((
          select sum(m.revenue_cents) from ad_metrics m
          join ad_sets s on s.id = m.ad_set_id
          where s.campaign_id = campaigns.id and m.week_start >= ${from} and m.week_start < ${to}
        ), 0)::int`,
      })
      .from(campaigns)
      .where(eq(campaigns.clientId, clientId))
      .orderBy(desc(campaigns.createdAt)),
  ]);

  return {
    published,
    shoots: shootRows,
    mediaCount: mediaCount[0]?.n ?? 0,
    campaigns: campaignRows.filter((c) => c.spendCents > 0 || c.campaign.status === "active"),
  };
}

/* ------------------------------------------------------------------ équipe -- */

/**
 * Toute l'équipe, actifs et retirés, avec la charge du mois.
 *
 * Les heures viennent en une seule requête : ouvrir l'écran pour voir « qui
 * fait quoi ce mois » ne doit pas coûter une requête par personne.
 */
export async function listTeam(now: Date = new Date()) {
  const { start, end } = monthRange(now);
  const from = start.toISOString().slice(0, 10);
  const to = end.toISOString().slice(0, 10);

  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      initials: users.initials,
      avatarPath: users.avatarPath,
      role: users.role,
      departments: users.departments,
      active: users.active,
      inviteToken: users.inviteToken,
      inviteExpiresAt: users.inviteExpiresAt,
      accessExpiresAt: users.accessExpiresAt,
      hasPassword: raw<boolean>`${users.passwordHash} is not null`,
      minutes: raw<number>`coalesce((
        select sum(t.minutes) from time_entries t
        where t.user_id = users.id and t.week_start >= ${from} and t.week_start < ${to}
      ), 0)::int`,
    })
    .from(users)
    .where(raw`${users.role} in ('direction','equipe')`)
    .orderBy(desc(users.active), asc(users.name));
}

/* ------------------------------------------------- médias d'un contenu -- */

/** Médias rattachés à un contenu, dans l'ordre d'ajout. */
export async function listContentMedia(contentId: string) {
  return db
    .select({ asset: assets })
    .from(assetUsages)
    .innerJoin(assets, eq(assets.id, assetUsages.assetId))
    .where(eq(assetUsages.contentId, contentId))
    .orderBy(asc(assetUsages.position));
}

/**
 * Le premier média de chaque contenu d'une liste.
 *
 * Une requête pour toute la page plutôt qu'une par carte : le pipeline en
 * affiche parfois cinquante, et cinquante allers-retours se voient à
 * l'ouverture de l'écran.
 */
export async function coversFor(contentIds: string[]) {
  if (contentIds.length === 0) return new Map<string, { id: string; mimeType: string }>();

  const rows = await db
    .select({
      contentId: assetUsages.contentId,
      id: assets.id,
      mimeType: assets.mimeType,
      position: assetUsages.position,
    })
    .from(assetUsages)
    .innerJoin(assets, eq(assets.id, assetUsages.assetId))
    .where(
      raw`${assetUsages.contentId} in (${raw.join(
        contentIds.map((c) => raw`${c}::uuid`),
        raw`, `,
      )})`,
    )
    .orderBy(asc(assetUsages.position));

  const covers = new Map<string, { id: string; mimeType: string }>();
  for (const r of rows) {
    if (!covers.has(r.contentId)) covers.set(r.contentId, { id: r.id, mimeType: r.mimeType });
  }
  return covers;
}

/* ------------------------------------------------ pièces jointes client -- */

export async function listClientFiles(clientId: string) {
  return db
    .select({
      id: clientFiles.id,
      filename: clientFiles.filename,
      label: clientFiles.label,
      mimeType: clientFiles.mimeType,
      sizeBytes: clientFiles.sizeBytes,
      createdAt: clientFiles.createdAt,
      uploadedByName: users.name,
    })
    .from(clientFiles)
    .leftJoin(users, eq(users.id, clientFiles.uploadedById))
    .where(eq(clientFiles.clientId, clientId))
    .orderBy(desc(clientFiles.createdAt));
}

/**
 * Toutes les vues de plusieurs contenus, dans leur ordre de carrousel.
 *
 * Une requête pour l'écran entier : la page d'approbation ou le portail
 * affichent plusieurs carrousels à la fois, et les charger un par un se
 * verrait à l'ouverture.
 */
export async function slidesFor(contentIds: string[]) {
  if (contentIds.length === 0) {
    return new Map<string, { id: string; mimeType: string; filename: string }[]>();
  }

  const rows = await db
    .select({
      contentId: assetUsages.contentId,
      id: assets.id,
      mimeType: assets.mimeType,
      filename: assets.filename,
    })
    .from(assetUsages)
    .innerJoin(assets, eq(assets.id, assetUsages.assetId))
    .where(
      raw`${assetUsages.contentId} in (${raw.join(
        contentIds.map((c) => raw`${c}::uuid`),
        raw`, `,
      )})`,
    )
    .orderBy(asc(assetUsages.position));

  const map = new Map<string, { id: string; mimeType: string; filename: string }[]>();
  for (const r of rows) {
    const list = map.get(r.contentId) ?? [];
    list.push({ id: r.id, mimeType: r.mimeType, filename: r.filename });
    map.set(r.contentId, list);
  }
  return map;
}

/** Liens externes d'un contenu : Drive, WeTransfer, montage en ligne. */
export async function listContentLinks(contentId: string) {
  return db
    .select({ link: contentLinks, addedByName: users.name })
    .from(contentLinks)
    .leftJoin(users, eq(users.id, contentLinks.addedById))
    .where(eq(contentLinks.contentId, contentId))
    .orderBy(asc(contentLinks.createdAt));
}

/**
 * Les liens externes de plusieurs contenus d'un coup.
 *
 * Le portail en a besoin pour toutes les cartes en attente : quand la vidéo
 * est trop lourde pour être hébergée ici, le lien Drive *est* le contenu à
 * valider. Sans lui la carte est vide, et on demande au client d'approuver
 * quelque chose qu'il ne peut pas voir.
 */
export async function linksFor(contentIds: string[]) {
  const map = new Map<string, { id: string; url: string; label: string | null }[]>();
  if (contentIds.length === 0) return map;

  const rows = await db
    .select({
      contentId: contentLinks.contentId,
      id: contentLinks.id,
      url: contentLinks.url,
      label: contentLinks.label,
    })
    .from(contentLinks)
    .where(
      raw`${contentLinks.contentId} in (${raw.join(
        contentIds.map((c) => raw`${c}::uuid`),
        raw`, `,
      )})`,
    )
    .orderBy(asc(contentLinks.createdAt));

  for (const r of rows) {
    const list = map.get(r.contentId) ?? [];
    list.push({ id: r.id, url: r.url, label: r.label });
    map.set(r.contentId, list);
  }
  return map;
}

/** La liste de matériel personnelle de quelqu'un. */
export async function listGearPresets(userId: string) {
  return db
    .select()
    .from(gearPresets)
    .where(eq(gearPresets.userId, userId))
    .orderBy(asc(gearPresets.position));
}
