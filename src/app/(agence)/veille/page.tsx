import Link from "next/link";
import { after } from "next/server";
import { Vignette } from "./Vignette";
import { scopeClientId } from "@/lib/scope";
import { and, asc, desc, eq, isNotNull } from "drizzle-orm";
import { clients, db, trendReports, veilleAccounts } from "@/db";
import { requireDepartment } from "@/lib/auth";
import { secretStatus } from "@/lib/secrets";
import { COMPETITOR_NETWORKS, listCompetitors, type Competitor } from "@/lib/metricool-competitors";
import { classement, etatMemoire, recupererHistorique, releverRecent } from "@/lib/veille";
import { FORMAT_LABEL, ilYa, PERIODES, periodeDe, triDe, type Periode, type Tri } from "@/lib/veille-regles";
import { cn } from "@/lib/cn";
import { ClientChip, NetworkDot, Panel } from "@/components/home/bits";
import { fmt } from "@/components/stats/Charts";
import { changerRole, copierIdee, retirerConcurrent, supprimerAnalyse } from "./actions";
import { AjoutConcurrent, BoutonAnalyse, BoutonHistorique, BoutonRefaire, BoutonTournage } from "./Forms";

const jourFr = (d: Date) => d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Indian/Reunion" });
const fois = (x: number) => `×${String(x).replace(".", ",")}`;

export const dynamic = "force-dynamic";

/**
 * Veille — les concurrents de chaque client, ce qui marche chez eux, et
 * l'analyse de l'IA pour en tirer des idées à adapter.
 */
export default async function VeillePage({ searchParams }: { searchParams: Promise<{ client?: string; vue?: string; periode?: string; tri?: string }> }) {
  const user = await requireDepartment("social");
  const sp = await searchParams;
  const linked = await db
    .select({ id: clients.id, name: clients.shortName, brandId: clients.metricoolBrandId })
    .from(clients)
    .where(and(eq(clients.active, true), isNotNull(clients.metricoolBrandId)))
    .orderBy(asc(clients.shortName));

  if (!linked.length) {
    return (
      <div className="min-h-0 flex-1 overflow-auto px-4 pt-1 pb-10 lg:px-7">
        <h1 className="mb-5 text-[34px] font-bold tracking-[-0.03em] lg:text-[40px]">Veille</h1>
        <Panel title="À raccorder">
          <p className="text-base text-ink-2">La veille passe par Metricool : raccordez-le et reliez vos clients à leur marque.</p>
          <Link href="/reglages" className="mt-4 w-fit rounded-full bg-night px-4 py-2 text-base font-medium text-white no-underline hover:no-underline">
            Réglages → Metricool
          </Link>
        </Panel>
      </div>
    );
  }

  // Le client choisi en haut à droite (cookie), sauf ?client= dans l'adresse.
  const wanted = await scopeClientId(sp.client);
  const client = linked.find((c) => c.id === wanted) ?? linked[0];
  const errors: string[] = [];
  const lists = await Promise.all(
    COMPETITOR_NETWORKS.map((n) =>
      listCompetitors(client.brandId!, n).catch((e: Error) => {
        errors.push(`${n} : ${e.message}`);
        return [] as Competitor[];
      }),
    ),
  );
  const competitors = lists.flat();
  // Le rôle de chaque compte pour Pilot (Metricool les suit tous comme concurrents).
  const roles = await db.select().from(veilleAccounts).where(eq(veilleAccounts.clientId, client.id));
  const cle = (h: string) => h.replace(/^@/, "").trim().toLowerCase();
  const roleMap = new Map(roles.map((r) => [`${r.network}:${r.handle}`, r.kind]));
  const roleOf = (network: string, handle: string) => (roleMap.get(`${network}:${cle(handle)}`) === "inspiration" ? "inspiration" : "concurrent");
  const groupes = [
    { kind: "concurrent" as const, titre: "Concurrents directs", vide: "Aucun concurrent suivi.", items: competitors.filter((c) => roleOf(c.network, c.handle) === "concurrent") },
    { kind: "inspiration" as const, titre: "Inspirations du secteur", vide: "Aucune inspiration : ajoutez des comptes du même métier ailleurs, ou d'un secteur voisin dont les formats s'adaptent.", items: competitors.filter((c) => roleOf(c.network, c.handle) === "inspiration") },
  ];
  const vue = sp.vue === "concurrents" || sp.vue === "inspirations" ? sp.vue : "tout";
  const periode = periodeDe(sp.periode);
  const tri = triDe(sp.tri);
  // Les 30 derniers jours relus chez Metricool (au plus toutes les 10 minutes) et gardés en mémoire ;
  // le classement, lui, se lit toujours dans la mémoire de Pilot, quelle que soit la période.
  const { errors: postErrors } = competitors.length
    ? await releverRecent(client.id).catch((e: Error) => ({ errors: [e.message] }))
    : { errors: [] as string[] };
  const { publications: posts, total } = await classement(client.id, {
    periode,
    tri,
    garder: vue === "tout" ? undefined : (p) => (vue === "inspirations") === (roleOf(p.network, p.handle) === "inspiration"),
  });
  const memoire = await etatMemoire(client.id);
  // Premier remplissage de la mémoire : jamais fait pour ce client → lancé en arrière-plan.
  if (competitors.length && !memoire.sync?.backfillStatus && !memoire.enCours) {
    const id = client.id;
    after(() => recupererHistorique(id).catch((e) => console.warn("[pilot] veille : historique,", (e as Error).message)));
  }
  const maintenant = new Date();
  const lien = (x: { periode?: Periode; tri?: Tri; vue?: string }) => {
    const q = new URLSearchParams({ client: client.id });
    const v = x.vue ?? vue;
    const pe = x.periode ?? periode;
    const t = x.tri ?? tri;
    if (v !== "tout") q.set("vue", v);
    if (pe !== "30j") q.set("periode", pe);
    if (t !== "engagement") q.set("tri", t);
    return `/veille?${q.toString()}`;
  };
  const titrePeriode = periode === "30j" ? "30 derniers jours" : periode === "tout" ? "depuis toujours" : PERIODES.find((p) => p.cle === periode)!.label;
  const etatHistorique = memoire.enCours
    ? "récupération de l'historique en cours"
    : memoire.sync?.backfillStatus === "termine" && memoire.sync.backfillDoneAt
      ? `historique récupéré ${ilYa(memoire.sync.backfillDoneAt, maintenant)}`
      : memoire.sync?.backfillStatus === "en_cours"
        ? "historique en partie récupéré (la suite au prochain relevé)"
        : "historique pas encore récupéré";
  const [report] = await db.select().from(trendReports).where(eq(trendReports.clientId, client.id)).orderBy(desc(trendReports.createdAt)).limit(1);
  const ai = await secretStatus("anthropic");

  return (
    <div className="min-h-0 flex-1 overflow-auto px-4 pt-1 pb-10 lg:px-7">
      <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-3">
        <h1 className="text-[34px] leading-[1.05] font-bold tracking-[-0.03em] lg:text-[40px]">Veille</h1>
        <span className="text-base text-ink-3">Ce qui marche chez les concurrents de vos clients, dans leur secteur et ailleurs, et comment le reprendre à votre façon.</span>
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        {linked.map((c) => (
          <Link
            key={c.id}
            href={`/veille?client=${c.id}`}
            className={cn(
              "flex items-center gap-2 rounded-full border px-3 py-[6px] text-small font-medium no-underline hover:no-underline",
              c.id === client.id ? "border-night bg-night text-white" : "border-line bg-paper text-ink hover:border-line-strong",
            )}
          >
            <ClientChip name={c.name} size={18} /> {c.name}
          </Link>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <Panel title={`Comptes suivis pour ${client.name}`}>
          <AjoutConcurrent clientId={client.id} />
          {groupes.map((g) => (
            <div key={g.kind} className="mt-4">
              <span className="eyebrow text-ink-3">{g.titre}</span>
              <div className="flex flex-col divide-y divide-line">
                {g.items.length === 0 ? <p className="py-3 text-small text-ink-3">{g.vide}</p> : null}
                {g.items.map((c) => (
                  <div key={`${c.network}-${c.id}`} className="flex items-center gap-3 py-3">
                    <span className="relative flex-none">
                      {c.picture ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={c.picture} alt="" className="h-10 w-10 rounded-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slot text-small font-bold uppercase">{c.handle.slice(0, 2)}</span>
                      )}
                      <span className="absolute -right-1 -bottom-1">
                        <NetworkDot network={c.network} size={18} />
                      </span>
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="clip text-base font-semibold">{c.name || c.handle}</span>
                      <span className="clip text-small text-ink-3">
                        @{c.handle}
                        {c.followers != null ? ` · ${fmt(c.followers)} abonnés` : " · première collecte en cours"}
                      </span>
                    </span>
                    <form action={changerRole}>
                      <input type="hidden" name="clientId" value={client.id} />
                      <input type="hidden" name="network" value={c.network} />
                      <input type="hidden" name="handle" value={c.handle} />
                      <input type="hidden" name="kind" value={g.kind === "concurrent" ? "inspiration" : "concurrent"} />
                      <button type="submit" title="Changer le rôle de ce compte" className="cursor-pointer rounded-full border border-line bg-paper px-3 py-[5px] text-small text-ink-2 hover:border-line-strong">
                        {g.kind === "concurrent" ? "→ Inspiration" : "→ Concurrent"}
                      </button>
                    </form>
                    <form action={retirerConcurrent}>
                      <input type="hidden" name="clientId" value={client.id} />
                      <input type="hidden" name="network" value={c.network} />
                      <input type="hidden" name="competitorId" value={c.id} />
                      <input type="hidden" name="handle" value={c.handle} />
                      <button type="submit" title="Ne plus suivre" className="cursor-pointer rounded-full border border-line bg-paper px-3 py-[5px] text-small text-ink-2 hover:border-line-strong">
                        Retirer
                      </button>
                    </form>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {errors.length ? <p className="mt-2 text-small text-warn">{errors.join(" · ")}</p> : null}
        </Panel>

        <Panel title="Analyse des tendances par l'IA" right={report ? <span className="text-small text-ink-3">{report.createdAt.toLocaleDateString("fr-FR")}</span> : null}>
          <BoutonAnalyse clientId={client.id} ready={ai.connected} />
          {!report && ai.connected ? (
            <p className="mt-2 text-small text-ink-3">
              L&apos;IA lit les publications des concurrents et des inspirations, et cherche sur le web les tendances actuelles du secteur du client
              (renseignez son secteur dans sa fiche).
            </p>
          ) : null}
          {report ? (
            <div className="mt-4 flex flex-col gap-4">
              <p className="text-base text-ink">{report.summary}</p>
              <div className="flex flex-col gap-2">
                {report.trends.map((t, i) => (
                  <div key={i} className="rounded-[16px] border border-line p-3">
                    <span className="text-base font-semibold">{t.titre}</span>
                    <p className="mt-1 text-small text-ink-2">{t.pourquoi}</p>
                    {t.exemples?.length ? (
                      <span className="mt-1 flex flex-wrap gap-2">
                        {t.exemples.slice(0, 3).map((u, k) => (
                          <a key={k} href={u} target="_blank" rel="noreferrer" className="text-micro text-info">
                            exemple {k + 1} ↗
                          </a>
                        ))}
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>
              <span className="eyebrow text-ink-3">Idées à adapter pour {client.name}</span>
              <div className="grid gap-2 md:grid-cols-2">
                {report.ideas.map((idea, i) => (
                  <form key={i} action={copierIdee} className="flex flex-col gap-2 rounded-[16px] border border-line p-3">
                    <input type="hidden" name="clientId" value={client.id} />
                    <input type="hidden" name="titre" value={idea.titre} />
                    <input type="hidden" name="format" value={idea.format} />
                    <input type="hidden" name="reseau" value={idea.reseau} />
                    <input type="hidden" name="legende" value={idea.legende} />
                    <input type="hidden" name="consignes" value={`Accroche : ${idea.accroche}\n\n${idea.consignes}${idea.inspiration ? `\n\nInspiration : ${idea.inspiration}` : ""}`} />
                    <span className="flex items-center gap-2">
                      <NetworkDot network={idea.reseau} size={18} />
                      <span className="text-micro font-semibold text-ink-3 uppercase">{idea.format}</span>
                    </span>
                    <span className="text-base font-semibold">{idea.titre}</span>
                    <span className="text-small text-ink-2">« {idea.accroche} »</span>
                    <button type="submit" className="mt-auto w-fit cursor-pointer rounded-full border-none bg-night px-3 py-[6px] text-small font-medium text-white hover:opacity-85">
                      + Ajouter au planning
                    </button>
                  </form>
                ))}
              </div>
              <form action={supprimerAnalyse}>
                <input type="hidden" name="id" value={report.id} />
                <button type="submit" className="cursor-pointer border-none bg-transparent p-0 text-small text-ink-3 underline">
                  Effacer cette analyse
                </button>
              </form>
            </div>
          ) : null}
        </Panel>
      </div>

      <Panel
        title={`Ce qui marche · ${titrePeriode}`}
        className="mt-5"
      >
        <div className="mb-4 flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <nav aria-label="Période" className="flex flex-wrap gap-1" data-periodes>
              {PERIODES.map((p) => (
                <Link
                  key={p.cle}
                  href={lien({ periode: p.cle })}
                  aria-current={periode === p.cle ? "page" : undefined}
                  className={cn(
                    "rounded-full border px-3 py-[4px] text-small no-underline hover:no-underline",
                    periode === p.cle ? "border-night bg-night text-white" : "border-line bg-paper text-ink hover:border-line-strong",
                  )}
                >
                  {p.label}
                </Link>
              ))}
            </nav>
            <nav aria-label="Comptes" className="flex flex-wrap gap-1">
              {[
                ["tout", "Tous les comptes"],
                ["concurrents", "Concurrents"],
                ["inspirations", "Inspirations"],
              ].map(([k, l]) => (
                <Link
                  key={k}
                  href={lien({ vue: k })}
                  aria-current={vue === k ? "page" : undefined}
                  className={cn(
                    "rounded-full border px-3 py-[4px] text-small no-underline hover:no-underline",
                    vue === k ? "border-night bg-night text-white" : "border-line bg-paper text-ink hover:border-line-strong",
                  )}
                >
                  {l}
                </Link>
              ))}
            </nav>
            <nav aria-label="Classement" className="flex flex-wrap items-center gap-1">
              <span className="mr-1 text-small text-ink-3">Classer par</span>
              {(
                [
                  ["engagement", "Engagement"],
                  ["moyenne", "× sa moyenne"],
                ] as const
              ).map(([k, l]) => (
                <Link
                  key={k}
                  href={lien({ tri: k })}
                  aria-current={tri === k ? "page" : undefined}
                  className={cn(
                    "rounded-full border px-3 py-[4px] text-small no-underline hover:no-underline",
                    tri === k ? "border-gold bg-accent text-accent-ink" : "border-line bg-paper text-ink hover:border-line-strong",
                  )}
                >
                  {l}
                </Link>
              ))}
            </nav>
          </div>
          <p className="text-small text-ink-2" data-explication>
            <b className="font-semibold">« ×3 sa moyenne »</b> : la publication a fait trois fois le score moyen du même compte dans les deux mois autour d&apos;elle — un
            petit compte qui sort du lot remonte autant qu&apos;un gros.
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[14px] bg-mute px-3 py-2 text-small text-ink-2" data-memoire>
            <span>
              Mémoire de Pilot : <b className="font-semibold text-ink">{memoire.publications.toLocaleString("fr-FR")}</b> publication{memoire.publications > 1 ? "s" : ""}
              {memoire.plusAncienne ? `, depuis le ${jourFr(memoire.plusAncienne)}` : ""} · {etatHistorique}.
              {periode === "tout" ? " Metricool ne relève un compte qu'à partir de son ajout (et le mois d'avant) : tout ce qu'il relève est gardé ici." : ""}
            </span>
            {user.role === "direction" ? <BoutonHistorique clientId={client.id} enCours={memoire.enCours} /> : null}
          </div>
        </div>
        {postErrors.length ? <p className="mb-2 text-small text-warn">{postErrors.join(" · ")}</p> : null}
        {posts.length === 0 ? (
          <p className="text-base text-ink-3">
            {competitors.length
              ? vue === "tout" && memoire.publications === 0
                ? "Metricool collecte les publications des comptes suivis : les premières arrivent sous 24 h environ après l'ajout."
                : `Aucune publication pour ce filtre sur ${titrePeriode === "depuis toujours" ? "toute la mémoire" : titrePeriode}.`
              : "Ajoutez des concurrents ou des inspirations pour voir leurs publications les plus engageantes."}
          </p>
        ) : (
          <>
            <p className="mb-3 text-small text-ink-3">
              {Math.min(16, posts.length)} meilleures sur {total.toLocaleString("fr-FR")} publication{total > 1 ? "s" : ""} · métriques au dernier relevé
            </p>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4" data-classement>
              {posts.slice(0, 16).map((p, i) => (
                <div key={p.id} className="flex flex-col overflow-hidden rounded-[18px] border border-line" data-publication={p.id}>
                  <a href={p.url ?? "#"} target="_blank" rel="noreferrer" className="relative block aspect-[4/5] bg-mute" aria-label={`Voir la publication de @${p.handle}`}>
                    <Vignette imageUrl={p.imageUrl} videoUrl={p.videoUrl} type={p.rawType ?? p.format} />
                    <span className="absolute top-2 left-2 flex h-7 w-7 items-center justify-center rounded-full bg-accent text-small font-bold text-accent-ink">{i + 1}</span>
                    <span className="absolute top-2 right-2 rounded-full bg-paper/90 px-2 py-[2px] text-micro font-semibold text-ink">{FORMAT_LABEL[p.format]}</span>
                    <span className="absolute right-2 bottom-2">
                      <NetworkDot network={p.network} size={22} />
                    </span>
                  </a>
                  <div className="flex flex-1 flex-col gap-1 p-3">
                    <span className="flex items-center gap-2">
                      <span className="clip text-small font-semibold">@{p.handle}</span>
                      {roleOf(p.network, p.handle) === "inspiration" ? (
                        <span className="flex-none rounded-full bg-mute px-2 py-[1px] text-micro text-ink-2">Inspiration</span>
                      ) : null}
                    </span>
                    {p.publishedAt ? (
                      <span className="text-micro text-ink-3" title={jourFr(p.publishedAt)}>
                        {ilYa(p.publishedAt, maintenant)} · {jourFr(p.publishedAt)}
                      </span>
                    ) : null}
                    <span className="line-clamp-2 text-small text-ink-2">{p.caption || "(sans texte)"}</span>
                    <span className="text-micro text-ink-3">
                      {fmt(p.likes)} j&apos;aime · {fmt(p.comments)} comm.{p.shares ? ` · ${fmt(p.shares)} partages` : ""}
                      {p.views ? ` · ${fmt(p.views)} vues` : ""}
                    </span>
                    {p.fois != null ? (
                      <span
                        className={cn(
                          "w-fit rounded-full px-2 py-[1px] text-micro font-semibold",
                          p.fois >= 2 ? "bg-ok-bg text-ok" : "bg-mute text-ink-2",
                        )}
                        title="Score de la publication divisé par le score moyen du compte dans les deux mois autour"
                      >
                        {fois(p.fois)} sa moyenne
                      </span>
                    ) : null}
                    <div className="mt-auto flex flex-col gap-1 pt-2">
                      <BoutonRefaire postId={p.id} />
                      <BoutonTournage postId={p.id} />
                      {p.url ? (
                        <a href={p.url} target="_blank" rel="noreferrer" className="text-center text-micro text-info">
                          Voir l&apos;original ↗
                        </a>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </Panel>
    </div>
  );
}
