import "server-only";

import { and, asc, eq, gte, isNotNull, lte, sql } from "drizzle-orm";
import { clients, db, veillePosts, veilleSync, type VeillePost } from "@/db";
import {
  COMPETITOR_NETWORKS,
  competitorPosts,
  competitorPostsBetween,
  ErreurMetricool,
  MetricoolLent,
  type CompetitorNetwork,
  type CompetitorPost,
} from "@/lib/metricool-competitors";
import {
  apresErreur,
  apresSucces,
  classer,
  cleCompte,
  debutPeriode,
  etatInitial,
  FENETRE_MOYENNE_JOURS,
  foisMoyenne,
  formatDe,
  JOUR_MS,
  legendeCourte,
  score,
  trancheSuivante,
  type EtatReseau,
  type Format,
  type Periode,
  type Tri,
} from "@/lib/veille-regles";

/*
 * La mémoire de la veille.
 *
 * D'où viennent les publications : de l'API Metricool des concurrents
 * (GET /v2/analytics/competitors/{instagram/publications | facebook/posts |
 * youtube/posts}), lecture seule. Paramètres requis : from, to, timezone,
 * limit (« max of 5000 » selon le swagger de Metricool) ; aucune durée
 * maximale de période n'y est documentée.
 *
 * La vraie limite est ailleurs : Metricool ne relève un concurrent qu'à
 * partir de son ajout. Son centre d'aide (« Historical data available ») dit
 * qu'à l'ajout il synchronise depuis le 1er jour du mois précédent, et que
 * sur un plan payant on peut demander par le chat un historique de 300
 * publications au plus ; il peut y en avoir davantage si un autre utilisateur
 * suivait déjà ce compte. Une vidéo d'il y a 5 mois n'existe donc chez
 * Metricool que si le compte était suivi à ce moment-là (ou récupéré par le
 * support).
 *
 * D'où cette mémoire : chaque publication relevée est gardée en base
 * (veille_posts, une ligne par client, réseau et publication), ses métriques
 * mises à jour à chaque relevé. L'historique s'accumule, et « Depuis
 * toujours » lit cette table.
 *
 *   - relevé des 30 jours : à l'ouverture de la page (au plus toutes les
 *     10 minutes), par Jarvis, et toutes les 6 h en arrière-plan ;
 *   - récupération de l'historique : par tranches, du plus récent au plus
 *     ancien, en demandant d'abord toute la période et en la découpant si la
 *     réponse est refusée ou pleine (voir veille-regles.ts). Bornée en durée
 *     et en nombre de requêtes ; reprend là où elle s'est arrêtée. Relancée
 *     chaque semaine (Metricool a pu compléter l'historique entre-temps).
 */

const AGE_RECENT_MS = 10 * 60_000;
const BAIL_MS = 6 * 60_000;
const MAX_REQUETES = 80;
const SEMAINE_MS = 7 * JOUR_MS;

/** Nombre maximal de publications demandées par tranche (1000 par défaut, 5000 au plus selon Metricool). */
function limite() {
  const n = Number(process.env.VEILLE_LIMITE);
  return Number.isFinite(n) && n >= 10 ? Math.min(Math.floor(n), 5000) : 1000;
}
function budgetDefaut() {
  const n = Number(process.env.VEILLE_BUDGET_MS);
  return Number.isFinite(n) && n > 0 ? n : 180_000;
}

/* --------------------------------------------------------- enregistrer -- */

const entier = (n: number) => Math.max(0, Math.min(2_147_483_647, Math.round(n || 0)));
const grand = (n: number) => Math.max(0, Math.round(n || 0));

/** Une date de Metricool. Sans fuseau, c'est l'heure de La Réunion (on la demande avec timezone=Indian/Reunion). */
function dateDe(v: string | null): Date | null {
  if (!v) return null;
  const d = new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(v) || !/T/.test(v) ? v : `${v}+04:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Garde les publications relevées, sans doublon : une ligne par client,
 * réseau et identifiant. Une publication déjà connue voit ses métriques et
 * ses liens mis à jour (le dernier relevé fait foi). Rend le nombre de
 * nouvelles lignes.
 */
export async function enregistrerPublications(clientId: string, posts: CompetitorPost[], maintenant = new Date()): Promise<{ nouvelles: number; misesAJour: number }> {
  const uniques = new Map<string, CompetitorPost>();
  for (const p of posts) if (p.id) uniques.set(`${p.network}|${p.id}`, p);
  const lignes = [...uniques.values()].map((p) => ({
    clientId,
    network: p.network,
    externalId: p.id.slice(0, 500),
    handle: cleCompte(p.author) || "?",
    publishedAt: dateDe(p.publishedAt),
    format: formatDe(p.type, p.network, p.url),
    rawType: p.type || null,
    url: p.url,
    imageUrl: p.imageUrl,
    videoUrl: p.videoUrl,
    caption: legendeCourte(p.text),
    likes: entier(p.likes),
    comments: entier(p.comments),
    shares: entier(p.shares),
    views: grand(p.views),
    interactions: grand(p.interactions),
    engagement: p.engagement,
    metricsAt: maintenant,
  }));
  let nouvelles = 0;
  for (let i = 0; i < lignes.length; i += 200) {
    const rows = await db
      .insert(veillePosts)
      .values(lignes.slice(i, i + 200))
      .onConflictDoUpdate({
        target: [veillePosts.clientId, veillePosts.network, veillePosts.externalId],
        set: {
          handle: sql`excluded.handle`,
          publishedAt: sql`coalesce(excluded.published_at, ${veillePosts.publishedAt})`,
          format: sql`excluded.format`,
          rawType: sql`coalesce(excluded.raw_type, ${veillePosts.rawType})`,
          url: sql`coalesce(excluded.url, ${veillePosts.url})`,
          imageUrl: sql`coalesce(excluded.image_url, ${veillePosts.imageUrl})`,
          videoUrl: sql`coalesce(excluded.video_url, ${veillePosts.videoUrl})`,
          caption: sql`coalesce(excluded.caption, ${veillePosts.caption})`,
          likes: sql`excluded.likes`,
          comments: sql`excluded.comments`,
          shares: sql`excluded.shares`,
          views: sql`excluded.views`,
          interactions: sql`excluded.interactions`,
          engagement: sql`excluded.engagement`,
          metricsAt: sql`excluded.metrics_at`,
        },
      })
      .returning({ nouvelle: sql<boolean>`(xmax = 0)` });
    nouvelles += rows.filter((r) => r.nouvelle).length;
  }
  return { nouvelles, misesAJour: lignes.length - nouvelles };
}

/* ------------------------------------------------------------- relevés -- */

async function marqueDe(clientId: string) {
  const [c] = await db.select({ brandId: clients.metricoolBrandId }).from(clients).where(eq(clients.id, clientId)).limit(1);
  return c?.brandId ?? null;
}

async function etatSync(clientId: string) {
  const [s] = await db.select().from(veilleSync).where(eq(veilleSync.clientId, clientId)).limit(1);
  return s ?? null;
}

async function majSync(clientId: string, champs: Partial<typeof veilleSync.$inferInsert>) {
  await db
    .insert(veilleSync)
    .values({ clientId, ...champs, updatedAt: new Date() })
    .onConflictDoUpdate({ target: veilleSync.clientId, set: { ...champs, updatedAt: new Date() } });
}

/**
 * Le relevé des 30 derniers jours (celui d'avant, inchangé), gardé en
 * mémoire. Sauté s'il date de moins de `ageMaxMs`. Les erreurs par réseau
 * sont rendues, pas levées : la mémoire reste lisible quand Metricool ne
 * répond pas.
 */
export async function releverRecent(clientId: string, { ageMaxMs = AGE_RECENT_MS }: { ageMaxMs?: number } = {}): Promise<{ errors: string[]; releve: boolean; posts: CompetitorPost[] }> {
  const brandId = await marqueDe(clientId);
  if (!brandId) return { errors: [], releve: false, posts: [] };
  const s = await etatSync(clientId);
  if (s?.recentAt && Date.now() - s.recentAt.getTime() < ageMaxMs) return { errors: [], releve: false, posts: [] };
  const { posts, errors } = await competitorPosts(brandId, 30);
  await enregistrerPublications(clientId, posts);
  if (errors.length < COMPETITOR_NETWORKS.length) await majSync(clientId, { recentAt: new Date() });
  return { errors, releve: true, posts };
}

async function prendreBail(clientId: string): Promise<boolean> {
  const fin = new Date(Date.now() + BAIL_MS);
  const rows = await db
    .insert(veilleSync)
    .values({ clientId, leaseUntil: fin })
    .onConflictDoUpdate({
      target: veilleSync.clientId,
      set: { leaseUntil: fin },
      setWhere: sql`${veilleSync.leaseUntil} is null or ${veilleSync.leaseUntil} < now()`,
    })
    .returning({ id: veilleSync.clientId });
  return rows.length > 0;
}

export type BilanHistorique = {
  statut: "termine" | "en_cours" | "occupe" | "sans_metricool";
  requetes: number;
  nouvelles: number;
  erreurs: string[];
};

/**
 * Récupère l'historique des comptes suivis, du plus récent au plus ancien,
 * par tranches (voir veille-regles.ts), dans la limite de `budgetMs` et de
 * 80 requêtes. Une remontée inachevée reprend là où elle s'est arrêtée ; une
 * remontée terminée repart d'aujourd'hui (les publications déjà connues ne
 * sont que mises à jour). Lecture seule chez Metricool : uniquement des GET.
 */
export async function recupererHistorique(clientId: string, { budgetMs = budgetDefaut() }: { budgetMs?: number } = {}): Promise<BilanHistorique> {
  const brandId = await marqueDe(clientId);
  if (!brandId) return { statut: "sans_metricool", requetes: 0, nouvelles: 0, erreurs: [] };
  if (!(await prendreBail(clientId))) return { statut: "occupe", requetes: 0, nouvelles: 0, erreurs: [] };
  const debut = Date.now();
  const maintenant = new Date();
  const lim = limite();
  const bilan: BilanHistorique = { statut: "en_cours", requetes: 0, nouvelles: 0, erreurs: [] };
  try {
    const s = await etatSync(clientId);
    const reprise = s?.backfillStatus === "en_cours";
    const precedent = (reprise ? s?.backfillState : {}) as Record<string, EtatReseau | undefined>;
    const etats: Record<string, EtatReseau> = {};
    for (const n of COMPETITOR_NETWORKS) etats[n] = precedent[n] ?? etatInitial(maintenant);
    await majSync(clientId, { backfillStatus: "en_cours", ...(reprise ? {} : { backfillStartedAt: maintenant }), backfillState: etats, lastError: null });

    let pause = false;
    for (const n of COMPETITOR_NETWORKS as readonly CompetitorNetwork[]) {
      for (;;) {
        if (pause || Date.now() - debut > budgetMs || bilan.requetes >= MAX_REQUETES) break;
        const t = trancheSuivante(etats[n]);
        if (!t) break;
        bilan.requetes++;
        try {
          const posts = await competitorPostsBetween(brandId, n, t.from, t.to, lim);
          bilan.nouvelles += (await enregistrerPublications(clientId, posts)).nouvelles;
          etats[n] = apresSucces(etats[n], t, posts.length, lim);
        } catch (e) {
          const statut = e instanceof ErreurMetricool ? e.statut : null;
          const message = e instanceof MetricoolLent || e instanceof ErreurMetricool ? e.message : `Metricool injoignable : ${(e as Error).message}`;
          if (!(e instanceof MetricoolLent) && !(e instanceof ErreurMetricool) && /n'est pas raccordé/.test((e as Error).message)) throw e;
          const r = apresErreur(etats[n], t, statut, message);
          etats[n] = r.etat;
          pause = r.pause;
          bilan.erreurs.push(`${n} : ${message}`);
        }
        await majSync(clientId, { backfillState: etats });
      }
    }
    const fini = COMPETITOR_NETWORKS.every((n) => etats[n].fini || !trancheSuivante(etats[n]));
    bilan.statut = fini ? "termine" : "en_cours";
    await majSync(clientId, {
      backfillStatus: bilan.statut,
      backfillState: etats,
      ...(fini ? { backfillDoneAt: new Date() } : {}),
      lastError: bilan.erreurs.length ? bilan.erreurs.slice(-3).join(" · ").slice(0, 500) : null,
    });
    return bilan;
  } catch (e) {
    await majSync(clientId, { lastError: (e as Error).message.slice(0, 500) }).catch(() => undefined);
    bilan.erreurs.push((e as Error).message);
    return bilan;
  } finally {
    await db.update(veilleSync).set({ leaseUntil: null }).where(eq(veilleSync.clientId, clientId));
  }
}

/** L'historique est-il à (re)prendre ? Jamais lancé, inachevé, ou terminé il y a plus d'une semaine. */
export function historiqueAFaire(s: { backfillStatus: string | null; backfillDoneAt: Date | null } | null, maintenant = new Date()) {
  if (!s || !s.backfillStatus || s.backfillStatus === "en_cours") return true;
  return !s.backfillDoneAt || maintenant.getTime() - s.backfillDoneAt.getTime() > SEMAINE_MS;
}

/**
 * Un compte vient d'être ajouté : Metricool collecte son historique dans les
 * 24 h. La remontée sera refaite dans un jour (au lieu d'une semaine).
 */
export async function relancerHistoriqueDemain(clientId: string) {
  const s = await etatSync(clientId);
  if (s?.backfillStatus === "termine") await majSync(clientId, { backfillDoneAt: new Date(Date.now() - SEMAINE_MS + JOUR_MS) });
}

/** Relevé régulier (toutes les heures, src/instrumentation.ts) : 30 jours toutes les 6 h, et l'historique s'il est à faire. */
export async function releveVeilleRegulier() {
  const liste = await db
    .select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.active, true), isNotNull(clients.metricoolBrandId)))
    .orderBy(asc(clients.shortName));
  for (const c of liste) {
    await releverRecent(c.id, { ageMaxMs: 6 * 3_600_000 }).catch((e) => console.warn("[pilot] veille : relevé récent,", (e as Error).message));
    const s = await etatSync(c.id);
    if (historiqueAFaire(s)) {
      const b = await recupererHistorique(c.id, { budgetMs: 120_000 }).catch((e) => ({ statut: "erreur", erreurs: [(e as Error).message] }));
      if (b.erreurs.length) console.warn("[pilot] veille : historique,", b.erreurs.slice(-2).join(" · "));
    }
  }
}

/* ----------------------------------------------------------- classement -- */

export type PublicationClassee = {
  id: string;
  network: string;
  handle: string;
  publishedAt: Date | null;
  format: Format;
  rawType: string | null;
  url: string | null;
  imageUrl: string | null;
  videoUrl: string | null;
  caption: string | null;
  likes: number;
  comments: number;
  shares: number;
  views: number;
  interactions: number;
  metricsAt: Date;
  score: number;
  /** « x fois sa moyenne » (null : pas assez de publications du compte autour). */
  fois: number | null;
};

/**
 * Le classement d'une période, lu dans la mémoire. Même score pour toutes les
 * périodes (comparable) ; `tri: "moyenne"` classe par « x fois sa moyenne ».
 * `garder` filtre les comptes (concurrents, inspirations).
 */
export async function classement(
  clientId: string,
  { periode, tri = "engagement", garder, maintenant = new Date() }: { periode: Periode; tri?: Tri; garder?: (p: { network: string; handle: string }) => boolean; maintenant?: Date },
): Promise<{ publications: PublicationClassee[]; total: number }> {
  const debut = debutPeriode(periode, maintenant);
  // La moyenne « au même moment » regarde 60 jours avant le début de la période.
  const lecture = debut ? new Date(debut.getTime() - FENETRE_MOYENNE_JOURS * JOUR_MS) : null;
  const rows: VeillePost[] = await db
    .select()
    .from(veillePosts)
    .where(and(eq(veillePosts.clientId, clientId), lecture ? gte(veillePosts.publishedAt, lecture) : undefined));
  const tous = rows
    .filter((r) => !garder || garder(r))
    .map((r) => ({ ...r, format: r.format as Format, score: score(r), compte: `${r.network}:${r.handle}`, date: r.publishedAt }));
  const fois = foisMoyenne(tous);
  const dans = tous
    .filter((r) => (debut ? r.publishedAt && r.publishedAt >= debut : true))
    .map(
      (r): PublicationClassee => ({
        id: r.id,
        network: r.network,
        handle: r.handle,
        publishedAt: r.publishedAt,
        format: r.format,
        rawType: r.rawType,
        url: r.url,
        imageUrl: r.imageUrl,
        videoUrl: r.videoUrl,
        caption: r.caption,
        likes: r.likes,
        comments: r.comments,
        shares: r.shares,
        views: r.views,
        interactions: r.interactions,
        metricsAt: r.metricsAt,
        score: r.score,
        fois: fois.get(r.id) ?? null,
      }),
    );
  return { publications: classer(dans, tri), total: dans.length };
}

/** Ce que Pilot garde pour ce client : nombre de publications, la plus ancienne, et l'état des relevés. */
export async function etatMemoire(clientId: string) {
  const [m] = await db
    .select({ n: sql<number>`count(*)::int`, plusAncienne: sql<Date | null>`min(${veillePosts.publishedAt})` })
    .from(veillePosts)
    .where(eq(veillePosts.clientId, clientId));
  const s = await etatSync(clientId);
  const plusAncienne = m?.plusAncienne ? new Date(m.plusAncienne) : null;
  return { publications: m?.n ?? 0, plusAncienne, sync: s, enCours: Boolean(s?.leaseUntil && s.leaseUntil > new Date()) };
}

/** Une publication de la mémoire, vérifiée contre son client. */
export async function publicationVeille(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [p] = await db.select().from(veillePosts).where(eq(veillePosts.id, id)).limit(1);
  return p ?? null;
}

/** « x fois sa moyenne » d'une seule publication (les publications du même compte à ±60 jours). */
export async function foisMoyenneDe(p: VeillePost): Promise<number | null> {
  if (!p.publishedAt) return null;
  const fenetre = FENETRE_MOYENNE_JOURS * JOUR_MS;
  const voisines = await db
    .select()
    .from(veillePosts)
    .where(
      and(
        eq(veillePosts.clientId, p.clientId),
        eq(veillePosts.network, p.network),
        eq(veillePosts.handle, p.handle),
        gte(veillePosts.publishedAt, new Date(p.publishedAt.getTime() - fenetre)),
        lte(veillePosts.publishedAt, new Date(p.publishedAt.getTime() + fenetre)),
      ),
    );
  const fois = foisMoyenne(voisines.map((r) => ({ id: r.id, compte: "x", date: r.publishedAt, score: score(r) })));
  return fois.get(p.id) ?? null;
}
