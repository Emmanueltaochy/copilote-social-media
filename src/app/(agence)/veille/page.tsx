import Link from "next/link";
import { Vignette } from "./Vignette";
import { scopeClientId } from "@/lib/scope";
import { and, asc, desc, eq, isNotNull } from "drizzle-orm";
import { clients, db, trendReports, veilleAccounts } from "@/db";
import { requireDepartment } from "@/lib/auth";
import { secretStatus } from "@/lib/secrets";
import { COMPETITOR_NETWORKS, competitorPosts, listCompetitors, type Competitor } from "@/lib/metricool-competitors";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/Icon";
import { ClientChip, NetworkDot, Panel } from "@/components/home/bits";
import { fmt } from "@/components/stats/Charts";
import { changerRole, copierIdee, retirerConcurrent, supprimerAnalyse } from "./actions";
import { AjoutConcurrent, BoutonAnalyse } from "./Forms";

export const dynamic = "force-dynamic";

/**
 * Veille — les concurrents de chaque client, ce qui marche chez eux, et
 * l'analyse de l'IA pour en tirer des idées à adapter.
 */
export default async function VeillePage({ searchParams }: { searchParams: Promise<{ client?: string; vue?: string }> }) {
  await requireDepartment("social");
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
  const { posts: allPosts, errors: postErrors } = competitors.length ? await competitorPosts(client.brandId!, 30) : { posts: [], errors: [] };
  const posts = allPosts.filter((p) => vue === "tout" || (vue === "inspirations") === (roleOf(p.network, p.author) === "inspiration"));
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
        title="Ce qui marche · 30 derniers jours"
        className="mt-5"
        right={
          <span className="flex gap-1">
            {[
              ["tout", "Tout"],
              ["concurrents", "Concurrents"],
              ["inspirations", "Inspirations"],
            ].map(([k, l]) => (
              <Link
                key={k}
                href={`/veille?client=${client.id}${k === "tout" ? "" : `&vue=${k}`}`}
                className={cn(
                  "rounded-full border px-3 py-[4px] text-small no-underline hover:no-underline",
                  vue === k ? "border-night bg-night text-white" : "border-line bg-paper text-ink hover:border-line-strong",
                )}
              >
                {l}
              </Link>
            ))}
          </span>
        }
      >
        {postErrors.length ? <p className="mb-2 text-small text-warn">{postErrors.join(" · ")}</p> : null}
        {posts.length === 0 ? (
          <p className="text-base text-ink-3">
            {competitors.length
              ? vue === "tout"
                ? "Metricool collecte les publications des comptes suivis : les premières arrivent sous 24 h environ après l'ajout."
                : "Aucune publication pour ce filtre sur 30 jours."
              : "Ajoutez des concurrents ou des inspirations pour voir leurs publications les plus engageantes."}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
            {posts.slice(0, 16).map((p, i) => (
              <div key={`${p.id}-${i}`} className="flex flex-col overflow-hidden rounded-[18px] border border-line">
                <a href={p.url ?? "#"} target="_blank" rel="noreferrer" className="relative block aspect-[4/5] bg-mute">
                  <Vignette imageUrl={p.imageUrl} videoUrl={p.videoUrl} type={p.type} />
                  <span className="absolute top-2 left-2 flex h-7 w-7 items-center justify-center rounded-full bg-accent text-small font-bold text-accent-ink">{i + 1}</span>
                  <span className="absolute right-2 bottom-2">
                    <NetworkDot network={p.network} size={22} />
                  </span>
                </a>
                <div className="flex flex-1 flex-col gap-1 p-3">
                  <span className="flex items-center gap-2">
                    <span className="clip text-small font-semibold">@{p.author}</span>
                    {roleOf(p.network, p.author) === "inspiration" ? (
                      <span className="flex-none rounded-full bg-mute px-2 py-[1px] text-micro text-ink-2">Inspiration</span>
                    ) : null}
                  </span>
                  <span className="line-clamp-2 text-small text-ink-2">{p.text || "(sans texte)"}</span>
                  <span className="text-micro text-ink-3">
                    {fmt(p.likes)} j&apos;aime · {fmt(p.comments)} comm.{p.views ? ` · ${fmt(p.views)} vues` : ""}
                  </span>
                  <form action={copierIdee} className="mt-auto pt-2">
                    <input type="hidden" name="clientId" value={client.id} />
                    <input type="hidden" name="titre" value={`À adapter : ${(p.text || "publication").slice(0, 60)}`} />
                    <input type="hidden" name="format" value={/reel|video/i.test(p.type) ? "reel" : "feed"} />
                    <input type="hidden" name="reseau" value={p.network === "youtube" ? "instagram" : p.network} />
                    <input
                      type="hidden"
                      name="consignes"
                      value={`Reprendre le mécanisme (pas le texte) de cette publication de @${p.author} :\n${p.url ?? ""}\n\n« ${p.text.slice(0, 400)} »\n\n${fmt(p.likes)} j'aime, ${fmt(p.comments)} commentaires${p.views ? `, ${fmt(p.views)} vues` : ""}.`}
                    />
                    <button type="submit" className="flex w-full cursor-pointer items-center justify-center gap-1 rounded-full border border-line bg-paper px-3 py-[6px] text-small font-medium text-ink hover:border-line-strong">
                      <Icon name="plus" size={13} /> Copier l&apos;idée
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
