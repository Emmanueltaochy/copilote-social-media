import Link from "next/link";
import { scopeClientId } from "@/lib/scope";
import { ScopeNotice } from "@/components/shell/ScopeNotice";
import { requireDepartment } from "@/lib/auth";
import { audienceStats, postStats } from "@/db/stats-queries";
import { listClientOptions } from "@/db/queries";
import { metricoolStatus } from "@/lib/metricool";
import { cn } from "@/lib/cn";
import { Icon, type IconName } from "@/components/ui/Icon";
import {
  ClientChip,
  NetworkDot,
  Panel,
  networkLabel,
} from "@/components/home/bits";
import {
  Heatmap,
  LineChart,
  Sparkline,
  fmt,
  pct,
} from "@/components/stats/Charts";

export const dynamic = "force-dynamic";

const RANGES = [7, 30, 90] as const;

/**
 * Statistiques — l'audience et les publications de tous les clients, telles
 * que Metricool les relève. Période, réseau et client se choisissent dans
 * l'adresse : un lien partagé montre exactement la même vue.
 */
export default async function StatistiquesPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string; n?: string; client?: string }>;
}) {
  await requireDepartment("social");
  const sp = await searchParams;
  const days = RANGES.includes(Number(sp.p) as 7) ? Number(sp.p) : 30;
  const f = {
    days,
    network: sp.n || undefined,
    clientId: await scopeClientId(sp.client),
  };

  const [aud, posts, mc, clientOptions] = await Promise.all([
    audienceStats(f),
    postStats(f),
    metricoolStatus(),
    listClientOptions("social"),
  ]);
  // La liste des réseaux ne dépend pas du filtre réseau : on la relit sans lui.
  const allNets = f.network
    ? ((await audienceStats({ ...f, network: undefined }))?.networks ?? [])
    : (aud?.networks ?? []);
  const client = clientOptions.find((c) => c.id === f.clientId);
  const cookieScoped = Boolean(await scopeClientId());

  const href = (o: {
    p?: number;
    n?: string | null;
    client?: string | null;
  }) => {
    const q = new URLSearchParams();
    const p = o.p ?? days;
    if (p !== 30) q.set("p", String(p));
    const n = o.n === undefined ? f.network : o.n;
    if (n) q.set("n", n);
    const c = o.client === undefined ? f.clientId : o.client;
    if (c) q.set("client", c);
    // Revenir à tous les clients doit passer devant le client mémorisé.
    else if (cookieScoped) q.set("client", "all");
    const s = q.toString();
    return `/statistiques${s ? `?${s}` : ""}`;
  };

  if (!aud && !posts.posts) {
    return (
      <div className="min-h-0 flex-1 overflow-auto px-4 pt-1 pb-10 lg:px-7">
        <h1 className="mb-5 text-[34px] font-bold tracking-[-0.03em] lg:text-[40px]">
          Statistiques
        </h1>
        <Panel title="Pas encore de chiffres">
          <p className="text-base text-ink-2">
            {mc.connected
              ? "Metricool est raccordé, mais aucun client n'est encore relié à sa marque, ou le premier relevé n'a pas eu lieu."
              : "Raccordez Metricool pour voir l'audience et les publications de vos clients."}
          </p>
          <Link
            href="/reglages"
            className="mt-4 w-fit rounded-full bg-night px-4 py-2 text-base font-medium text-white no-underline hover:no-underline"
          >
            Réglages → Metricool
          </Link>
        </Panel>
      </div>
    );
  }

  const prevPct =
    aud && aud.prevGained > 0
      ? ((aud.gained - aud.prevGained) / aud.prevGained) * 100
      : null;
  const growthPct =
    aud && aud.current - aud.gained > 0
      ? (aud.gained / (aud.current - aud.gained)) * 100
      : null;
  const mixTotal = posts.mix.reduce((s, m) => s + m.n, 0);
  const maxBrand = Math.max(1, ...(aud?.brands.map((b) => b.followers) ?? [1]));

  return (
    <div className="min-h-0 flex-1 overflow-auto px-4 pt-1 pb-10 lg:px-7">
      <div className="mb-4 flex flex-wrap items-center gap-x-8 gap-y-4">
        <h1 className="text-[34px] leading-[1.05] font-bold tracking-[-0.03em] lg:text-[40px]">
          Statistiques
          {client ? (
            <span className="block text-title font-semibold text-ink-3">
              {client.name}
            </span>
          ) : null}
          {cookieScoped && client ? <ScopeNotice name={client.name} className="mt-1 text-base font-normal tracking-normal" /> : null}
        </h1>
        <Stat
          icon="users"
          value={fmt(aud?.current)}
          label={`abonnés · ${aud?.accounts ?? 0} comptes`}
        />
        <Stat
          icon="chart"
          value={`${aud && aud.gained >= 0 ? "+" : ""}${fmt(aud?.gained)}`}
          pill={growthPct != null ? pct(growthPct) : undefined}
          label={`nouveaux abonnés · ${days} j`}
        />
        <Stat
          icon="eye"
          value={fmt(posts.views)}
          pill={posts.viewsChange != null ? pct(posts.viewsChange) : undefined}
          label={`vues · ${days} j`}
        />
        <Stat
          icon="heart"
          value={pct(posts.engagement, false)}
          label={`engagement moyen · ${posts.posts} publications`}
        />
      </div>

      {/* Filtres */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Pill href={href({ n: null })} active={!f.network}>
          <Icon name="layers" size={14} /> Tous les réseaux
        </Pill>
        {allNets.map((n) => (
          <Pill
            key={n.network}
            href={href({ n: n.network })}
            active={f.network === n.network}
          >
            <NetworkDot network={n.network} size={18} />{" "}
            {networkLabel(n.network)}
            <span className="text-ink-3">{n.accounts}</span>
          </Pill>
        ))}
        <span className="ml-auto flex rounded-full bg-mute p-[3px]">
          {RANGES.map((r) => (
            <Link
              key={r}
              href={href({ p: r })}
              className={cn(
                "rounded-full px-3 py-[5px] text-small font-semibold no-underline hover:no-underline",
                days === r
                  ? "bg-paper text-ink shadow-soft"
                  : "text-ink-3 hover:text-ink",
              )}
            >
              {r} j
            </Link>
          ))}
        </span>
        {client ? (
          <Pill href={href({ client: null })} active>
            {client.name} <Icon name="close" size={13} />
          </Pill>
        ) : null}
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Croissance de l'audience">
          {aud ? (
            <>
              <div className="mb-1 flex flex-wrap items-baseline gap-3">
                <span className="text-[36px] leading-none font-bold tracking-[-0.03em]">
                  {aud.gained >= 0 ? "+" : ""}
                  {fmt(aud.gained)}
                </span>
                <span className="text-small text-ink-3">
                  abonnés gagnés en {days} j
                  {prevPct != null
                    ? ` · ${pct(prevPct)} vs les ${days} j d'avant`
                    : ""}
                </span>
              </div>
              <Legend
                items={[
                  ["bg-ok", "Cette période"],
                  ["border border-dashed border-ink-3", "Période précédente"],
                ]}
              />
              <LineChart
                axis={aud.axis}
                values={aud.curve}
                previous={aud.prevCurve}
              />
            </>
          ) : (
            <p className="text-base text-ink-3">
              Aucun relevé d&apos;abonnés pour ce filtre.
            </p>
          )}
        </Panel>

        <Panel title="Répartition des publications">
          <div className="mb-4 flex items-baseline gap-3">
            <span className="text-[36px] leading-none font-bold tracking-[-0.03em]">
              {posts.posts}
            </span>
            <span className="text-small text-ink-3">
              publications parues en {days} j
            </span>
          </div>
          <div className="flex flex-col gap-3">
            {posts.mix.map((m) => (
              <div
                key={m.network}
                className="grid grid-cols-[26px_100px_minmax(0,1fr)_40px_44px] items-center gap-3"
              >
                <NetworkDot network={m.network} size={26} />
                <span className="text-base font-medium">
                  {networkLabel(m.network)}
                </span>
                <span className="h-[7px] rounded-full bg-slot">
                  <span
                    className="block h-full rounded-full bg-ink"
                    style={{
                      width: `${(m.n / Math.max(1, posts.mix[0].n)) * 100}%`,
                    }}
                  />
                </span>
                <span className="text-right text-base font-semibold tabular-nums">
                  {m.n}
                </span>
                <span className="text-right text-small text-ink-3 tabular-nums">
                  {Math.round((m.n / Math.max(1, mixTotal)) * 100)} %
                </span>
              </div>
            ))}
            {posts.mix.length === 0 ? (
              <p className="text-base text-ink-3">
                Aucune publication sur la période.
              </p>
            ) : null}
          </div>
        </Panel>
      </div>

      <Panel title="Meilleurs moments pour publier" className="mt-5">
        <p className="-mt-2 mb-4 text-small text-ink-3">
          Portée moyenne de vos publications des 90 derniers jours, par jour et
          heure de mise en ligne (heure de La Réunion). Les cases cerclées sont
          les trois meilleurs créneaux (au moins deux publications).
        </p>
        <Heatmap cells={posts.heat} />
      </Panel>

      {aud ? (
        <Panel title="Par réseau" className="mt-5">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-base">
              <thead>
                <tr className="text-left text-small text-ink-3">
                  {[
                    "Réseau",
                    "Comptes",
                    "Abonnés",
                    "Croissance",
                    "Vues",
                    "Engagement",
                    "Publications",
                    "Tendance",
                  ].map((h, i) => (
                    <th
                      key={h}
                      className={cn(
                        "border-b border-line pb-2 font-medium",
                        i > 0 && i < 7 && "text-right",
                        i === 7 && "pl-4",
                      )}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {aud.networks.map((n) => {
                  const p = posts.perNetwork.get(n.network);
                  return (
                    <tr
                      key={n.network}
                      className="border-b border-line last:border-none"
                    >
                      <td className="py-3">
                        <span className="flex items-center gap-3">
                          <NetworkDot network={n.network} size={28} />
                          <span className="font-medium">
                            {networkLabel(n.network)}
                          </span>
                        </span>
                      </td>
                      <td className="text-right tabular-nums">{n.accounts}</td>
                      <td className="text-right font-semibold tabular-nums">
                        {fmt(n.followers)}
                      </td>
                      <td
                        className={cn(
                          "text-right tabular-nums",
                          (n.growthPct ?? 0) >= 0 ? "text-ok" : "text-alert",
                        )}
                      >
                        {pct(n.growthPct)}
                      </td>
                      <td className="text-right tabular-nums">
                        {fmt(p?.views)}
                      </td>
                      <td className="text-right tabular-nums">
                        {pct(p?.engagement, false)}
                      </td>
                      <td className="text-right tabular-nums">
                        {p?.posts ?? 0}
                      </td>
                      <td className="pl-4">
                        <Sparkline values={n.trend} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      ) : null}

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
        <Panel title="Meilleures publications">
          {posts.top.length ? (
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
                      <img
                        src={t.imageUrl}
                        alt=""
                        className="h-full w-full object-cover"
                        referrerPolicy="no-referrer"
                        loading="lazy"
                      />
                    ) : null}
                    <span className="absolute top-2 left-2 flex h-7 w-7 items-center justify-center rounded-full bg-accent text-small font-bold text-accent-ink">
                      {i + 1}
                    </span>
                    <span className="absolute right-2 bottom-2">
                      <NetworkDot network={t.network} size={22} />
                    </span>
                  </span>
                  <span className="flex flex-col gap-1 p-3">
                    <span className="text-title leading-none font-bold">
                      {fmt(t.reach)}
                    </span>
                    <span className="text-micro text-ink-3">
                      portée · {fmt(t.interactions)} interactions
                    </span>
                    <span className="mt-1 flex items-center gap-2 text-small text-ink-2">
                      <ClientChip name={t.clientName} size={18} />
                      <span className="clip">{t.clientName}</span>
                      <span className="ml-auto text-ink-3">
                        {t.publishedAt.toLocaleDateString("fr-FR", {
                          day: "numeric",
                          month: "short",
                        })}
                      </span>
                    </span>
                  </span>
                </a>
              ))}
            </div>
          ) : (
            <p className="text-base text-ink-3">
              Aucune publication sur la période.
            </p>
          )}
        </Panel>

        <Panel title="Comparaison des clients">
          <div className="flex flex-col gap-4">
            {aud?.brands.map((b) => (
              <Link
                key={b.clientId}
                href={href({ client: b.clientId })}
                className="grid grid-cols-[34px_minmax(0,120px)_minmax(0,1fr)_auto] items-center gap-3 text-ink no-underline hover:no-underline"
              >
                <ClientChip name={b.clientName} size={34} />
                <span className="flex min-w-0 flex-col">
                  <span className="clip text-base font-semibold">
                    {b.clientName}
                  </span>
                  <span className="text-micro text-ink-3">
                    {b.networks} compte{b.networks > 1 ? "s" : ""}
                  </span>
                </span>
                <span className="h-[8px] rounded-full bg-slot">
                  <span
                    className="block h-full rounded-full bg-ink"
                    style={{ width: `${(b.followers / maxBrand) * 100}%` }}
                  />
                </span>
                <span className="text-right text-base font-semibold tabular-nums">
                  {fmt(b.followers)}
                </span>
              </Link>
            ))}
          </div>
          {mc.lastSyncAt ? (
            <p className="mt-5 text-micro text-ink-3">
              Relevé Metricool du{" "}
              {mc.lastSyncAt.toLocaleString("fr-FR", {
                dateStyle: "short",
                timeStyle: "short",
              })}
            </p>
          ) : null}
        </Panel>
      </div>
    </div>
  );
}

function Stat({
  icon,
  value,
  label,
  pill,
}: {
  icon: IconName;
  value: string;
  label: string;
  pill?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-11 w-11 flex-none items-center justify-center rounded-full border border-line bg-paper text-ink shadow-soft">
        <Icon name={icon} size={18} />
      </span>
      <span className="flex flex-col">
        <span className="flex items-center gap-2">
          <span className="text-[22px] leading-tight font-bold tracking-[-0.02em] tabular-nums">
            {value}
          </span>
          {pill ? (
            <span className="rounded-full bg-ok px-2 py-[1px] text-micro font-semibold text-white">
              {pill}
            </span>
          ) : null}
        </span>
        <span className="text-small text-ink-3">{label}</span>
      </span>
    </div>
  );
}

function Pill({
  href,
  active,
  children,
}: {
  href: string;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2 rounded-full border px-3 py-[6px] text-small font-medium no-underline hover:no-underline",
        active
          ? "border-night bg-night text-white"
          : "border-line bg-paper text-ink hover:border-line-strong",
      )}
    >
      {children}
    </Link>
  );
}

function Legend({ items }: { items: [string, string][] }) {
  return (
    <span className="mb-2 flex flex-wrap gap-4 text-small text-ink-3">
      {items.map(([cls, label]) => (
        <span key={label} className="flex items-center gap-2">
          <span className={cn("h-[3px] w-4 rounded-full", cls)} /> {label}
        </span>
      ))}
    </span>
  );
}
