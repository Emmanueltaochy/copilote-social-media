import Link from "next/link";
import { contextePortail } from "@/lib/portail";
import { audienceStats, postStats } from "@/db/stats-queries";
import { cn } from "@/lib/cn";
import { NetworkDot, Panel, networkLabel } from "@/components/home/bits";
import { Heatmap, LineChart, Sparkline, fmt, pct } from "@/components/stats/Charts";

export const dynamic = "force-dynamic";

const RANGES = [7, 30, 90] as const;

/**
 * Les statistiques du client, dans son portail : ses réseaux, et rien que les
 * siens. Le client est toujours celui du contexte du portail — jamais un
 * paramètre de l'adresse, qu'un client pourrait changer pour voir un autre
 * compte.
 */
export default async function StatistiquesPortail({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const { client } = await contextePortail();
  const sp = await searchParams;
  const days = RANGES.includes(Number(sp.p) as 7) ? Number(sp.p) : 30;
  const f = { days, clientId: client.id };
  const [aud, posts] = await Promise.all([audienceStats(f), postStats(f)]);

  const titre = (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex flex-col gap-1">
        <span className="eyebrow text-ink-3">{client.shortName}</span>
        <h1 className="text-[34px] leading-[1.05] font-bold tracking-[-0.03em] sm:text-[40px]">Vos statistiques</h1>
      </div>
      <span className="flex rounded-full bg-mute p-[3px]">
        {RANGES.map((r) => (
          <Link
            key={r}
            href={r === 30 ? "/portail/statistiques" : `/portail/statistiques?p=${r}`}
            className={cn(
              "rounded-full px-3 py-[5px] text-small font-semibold no-underline hover:no-underline",
              days === r ? "bg-paper text-ink shadow-soft" : "text-ink-3 hover:text-ink",
            )}
          >
            {r} j
          </Link>
        ))}
      </span>
    </div>
  );

  if (!aud && !posts.posts) {
    return (
      <div className="flex flex-col gap-5">
        {titre}
        <Panel title="Bientôt ici">
          <p className="text-base text-ink-2">
            Les chiffres de vos réseaux sociaux s&apos;afficheront ici dès que votre compte sera relié à notre outil de
            statistiques. Votre interlocuteur s&apos;en occupe.
          </p>
        </Panel>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {titre}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Chiffre valeur={fmt(aud?.current)} libelle="abonnés au total" />
        <Chiffre
          valeur={`${aud && aud.gained >= 0 ? "+" : ""}${fmt(aud?.gained)}`}
          libelle={`nouveaux abonnés en ${days} j`}
        />
        <Chiffre valeur={fmt(posts.views)} libelle={`vues en ${days} j`} pastille={posts.viewsChange != null ? pct(posts.viewsChange) : undefined} />
        <Chiffre valeur={String(posts.posts)} libelle={`publications en ${days} j`} />
      </div>

      {aud ? (
        <Panel title="Croissance de votre audience">
          <p className="-mt-2 mb-2 text-small text-ink-3">
            Abonnés gagnés depuis le début de la période · en pointillés, la période précédente.
          </p>
          <LineChart axis={aud.axis} values={aud.curve} previous={aud.prevCurve} />
        </Panel>
      ) : null}

      {aud ? (
        <Panel title="Par réseau">
          <div className="flex flex-col">
            {aud.networks.map((n) => {
              const p = posts.perNetwork.get(n.network);
              return (
                <div key={n.network} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line py-3 last:border-none">
                  <span className="flex min-w-[150px] flex-1 items-center gap-3">
                    <NetworkDot network={n.network} size={28} />
                    <span className="flex flex-col leading-tight">
                      <span className="text-base font-semibold">{networkLabel(n.network)}</span>
                      <span className="text-small text-ink-3">{fmt(n.followers)} abonnés</span>
                    </span>
                  </span>
                  <span className={cn("w-[72px] text-right text-base tabular-nums", (n.growthPct ?? 0) >= 0 ? "text-ok" : "text-alert")}>
                    {pct(n.growthPct)}
                  </span>
                  <span className="w-[110px] text-right text-small text-ink-3 tabular-nums">
                    {p ? `${p.posts} publication${p.posts > 1 ? "s" : ""}` : "—"}
                  </span>
                  <Sparkline values={n.trend} />
                </div>
              );
            })}
          </div>
        </Panel>
      ) : null}

      {posts.top.length ? (
        <Panel title="Vos meilleures publications">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {posts.top.map((t, i) => (
              <a
                key={t.id}
                href={t.url ?? "#"}
                target="_blank"
                rel="noreferrer"
                className="flex flex-col overflow-hidden rounded-[18px] border border-line text-ink no-underline hover:border-line-strong hover:no-underline"
              >
                <span className="relative block aspect-[4/5] bg-mute">
                  {t.imageUrl ? (
                    // Image hébergée par le réseau social.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t.imageUrl} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" loading="lazy" />
                  ) : null}
                  <span className="absolute top-2 left-2 flex h-7 w-7 items-center justify-center rounded-full bg-accent text-small font-bold text-accent-ink">
                    {i + 1}
                  </span>
                  <span className="absolute right-2 bottom-2">
                    <NetworkDot network={t.network} size={22} />
                  </span>
                </span>
                <span className="flex flex-col gap-1 p-3">
                  <span className="text-title leading-none font-bold">{fmt(t.reach)}</span>
                  <span className="text-micro text-ink-3">
                    personnes touchées · {fmt(t.interactions)} interactions
                  </span>
                  <span className="text-micro text-ink-3">
                    {t.publishedAt.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}
                  </span>
                </span>
              </a>
            ))}
          </div>
        </Panel>
      ) : null}

      {posts.heat.length ? (
        <Panel title="Quand votre audience répond le mieux">
          <p className="-mt-2 mb-4 text-small text-ink-3">
            Portée moyenne de vos publications des 90 derniers jours, selon le jour et l&apos;heure de mise en ligne (heure
            de La Réunion).
          </p>
          <Heatmap cells={posts.heat} />
        </Panel>
      ) : null}
    </div>
  );
}

function Chiffre({ valeur, libelle, pastille }: { valeur: string; libelle: string; pastille?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-[20px] border border-line bg-paper p-4 shadow-soft">
      <span className="flex items-center gap-2">
        <span className="text-[24px] leading-none font-bold tracking-[-0.02em] tabular-nums">{valeur}</span>
        {pastille ? (
          <span className="rounded-full bg-ok px-2 py-[1px] text-micro font-semibold text-white">{pastille}</span>
        ) : null}
      </span>
      <span className="text-small text-ink-3">{libelle}</span>
    </div>
  );
}
