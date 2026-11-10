import Link from "next/link";
import { requireDepartment } from "@/lib/auth";
import { coversFor, listAwaitingApproval, listClientsWithPace } from "@/db/queries";
import {
  missedRecently,
  networksThisMonth,
  publishedThisMonth,
  shootsSoon,
  teamActivity,
  upNext,
  weekAhead,
  audience,
  topPostThisMonth,
} from "@/db/home-queries";
import { AudiencePanel } from "@/components/home/AudiencePanel";
import { devisNouveaux } from "@/db/queries";
import { monthLabel } from "@/lib/pacing";
import { networksOf } from "@/data/content";
import { cn } from "@/lib/cn";
import { Cover } from "@/components/ui/Cover";
import { Icon } from "@/components/ui/Icon";
import { PacingBar } from "@/components/ui/PacingBar";
import { Avatar } from "@/components/ui/primitives";
import {
  ClientChip,
  NetworkDot,
  NetworkStack,
  Panel,
  StatusTag,
  ago,
  countdown,
  hhmm,
  networkLabel,
  whenLabel,
} from "@/components/home/bits";

/**
 * Aujourd'hui — l'accueil de l'agence.
 *
 * Une seule question : qu'est-ce qui part, qu'est-ce qui attend quelqu'un,
 * et où en est le mois ? Tout le reste est à un clic.
 */
export default async function AujourdhuiPage() {
  const user = await requireDepartment("social");
  const now = new Date();
  const [next, missed, approvals, week, networks, published, activity, shoots, portfolio, devis, aud, top] =
    await Promise.all([
      upNext(now),
      missedRecently(now),
      listAwaitingApproval(),
      weekAhead(now),
      networksThisMonth(now),
      publishedThisMonth(now),
      teamActivity(8),
      shootsSoon(now),
      listClientsWithPace(now, "social"),
      devisNouveaux(),
      audience(90),
      topPostThisMonth(now),
    ]);
  const covers = await coversFor([...next.map((c) => c.id), ...approvals.map((a) => a.content.id)]);

  const hour = now.getHours();
  const greeting = hour < 12 ? "Bonjour" : hour < 18 ? "Bon après-midi" : "Bonsoir";
  const firstName = user.name.split(" ")[0];
  const sold = portfolio.reduce((s, c) => s + c.contentTarget, 0);
  const late = portfolio.filter((c) => c.pace.key === "late" || c.pace.key === "risk");
  const thisWeek = week.filter((c) => !c.publishedAt).length;

  const hero = next[0];
  const rest = next.slice(1, 7);

  type Need = { key: string; title: string; meta: string; href: string; tone: "alert" | "warn" | "info"; cta: string; coverId?: string };
  const needs: Need[] = [
    ...missed.map((m) => ({
      key: "m" + m.id,
      title: `« ${m.title} » n'est pas parti`,
      meta: `${m.clientName} · prévu ${whenLabel(m.scheduledAt!, now)}`,
      href: `/contenu/${m.id}`,
      tone: "alert" as const,
      cta: "Publier",
    })),
    ...approvals.map((a) => ({
      key: "a" + a.content.id,
      title: a.content.title,
      meta: `${a.clientName} · ${a.content.status === "revision" ? "révision interne" : "attend le client"}${a.waitingDays ? ` depuis ${a.waitingDays} j` : ""}`,
      href: `/contenu/${a.content.id}`,
      tone: (a.waitingDays ?? 0) >= 3 ? ("warn" as const) : ("info" as const),
      cta: "Ouvrir",
      coverId: a.content.id,
    })),
    ...shoots
      .filter((s) => s.status === "a_securiser" || s.status === "preparation")
      .map((s) => ({
        key: "s" + s.id,
        title: `Tournage « ${s.title} » à sécuriser`,
        meta: `${s.clientName} · ${whenLabel(s.startsAt, now)}${s.place ? ` · ${s.place}` : ""}`,
        href: `/tournages/${s.id}`,
        tone: "warn" as const,
        cta: "Préparer",
      })),
    ...(devis > 0
      ? [{ key: "devis", title: `${devis} demande${devis > 1 ? "s" : ""} de devis`, meta: "Arrivées depuis les portails clients", href: "/devis", tone: "info" as const, cta: "Voir" }]
      : []),
  ];

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const items = week.filter((c) => {
      const s = c.scheduledAt!;
      return s.getFullYear() === d.getFullYear() && s.getMonth() === d.getMonth() && s.getDate() === d.getDate();
    });
    return { d, items };
  });
  const maxNet = Math.max(1, ...networks.map((n) => n.total));

  return (
    <div className="min-h-0 flex-1 overflow-auto px-4 pt-1 pb-10 lg:px-7">
      {/* Bonjour + chiffres clés */}
      <div className="mb-5 flex flex-wrap items-center gap-x-8 gap-y-4">
        <h1 className="text-[34px] leading-[1.05] font-bold tracking-[-0.03em] lg:text-[40px]">
          {greeting},<br className="hidden lg:block" /> {firstName}
        </h1>
        {aud ? (
          <Stat
            icon="users"
            value={compact(aud.current)}
            pill={aud.current30ago > 0 ? `${aud.current >= aud.current30ago ? "+" : ""}${(((aud.current - aud.current30ago) / aud.current30ago) * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} % en 30 j` : undefined}
            label="abonnés, tous clients et réseaux"
          />
        ) : null}
        <Stat icon="send" value={`${published}`} pill={sold ? `${Math.round((published / Math.max(1, sold)) * 100)} % du mois` : undefined} label={`publiés en ${monthLabel(now).split(" ")[0]} sur ${sold} vendus`} />
        <Stat icon="calendar" value={`${thisWeek}`} label="contenus prévus sur 7 jours" />
        <Link
          href="/contenu"
          className="ml-auto flex items-center gap-2 rounded-full bg-night px-5 py-3 text-base font-semibold text-white no-underline shadow-soft hover:no-underline hover:brightness-125"
        >
          <Icon name="plus" size={17} strokeWidth={2.2} /> Nouveau contenu
        </Link>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
        {/* À venir */}
        <Panel title="À venir" action={{ href: "/calendrier", label: "Calendrier" }} right={<LiveDot />}>
          {hero ? (
            <Link
              href={`/contenu/${hero.id}`}
              className="group grid gap-5 rounded-[22px] bg-night p-4 text-white no-underline hover:no-underline sm:grid-cols-[200px_minmax(0,1fr)]"
            >
              <Cover asset={covers.get(hero.id)} ratio="4/5" className="rounded-[16px] max-sm:hidden" label={hero.kind === "reel" ? "Reel" : "Visuel à venir"} />
              <div className="flex min-w-0 flex-col">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <ClientChip name={hero.clientName} size={26} />
                    <span className="clip font-semibold">{hero.clientName}</span>
                  </span>
                  <StatusTag status={hero.status} className="bg-white/10 text-white" />
                </div>
                <span className="mt-5 text-small text-white/60">part dans</span>
                <span className="text-[40px] leading-none font-bold tracking-[-0.03em] lg:text-[46px]">
                  {countdown(hero.scheduledAt!, now)}
                </span>
                <span className="mt-2 flex items-center gap-2 text-small text-white/70">
                  <Icon name="clock" size={14} /> {whenLabel(hero.scheduledAt!, now)}
                </span>
                <p className="mt-4 line-clamp-3 text-base text-white/90">{hero.caption || hero.title}</p>
                <span className="mt-auto flex items-center justify-between pt-4">
                  <NetworkStack networks={networksOf(hero)} size={26} />
                  <span className="flex h-9 w-9 items-center justify-center rounded-full border border-white/25 group-hover:bg-white/10">
                    <Icon name="arrowUpRight" size={16} />
                  </span>
                </span>
              </div>
            </Link>
          ) : (
            <Empty text="Rien de programmé. Les contenus avec une date apparaîtront ici." href="/calendrier" cta="Ouvrir le calendrier" />
          )}

          {rest.length ? (
            <>
              <span className="eyebrow mt-5 mb-2 text-ink-3">Ensuite</span>
              <div className="grid gap-2 sm:grid-cols-2">
                {rest.map((c) => (
                  <Link
                    key={c.id}
                    href={`/contenu/${c.id}`}
                    className="flex min-w-0 items-center gap-3 rounded-[16px] border border-line p-2 pr-3 text-ink no-underline hover:border-line-strong hover:no-underline"
                  >
                    <ClientChip name={c.clientName} size={38} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="clip text-base font-semibold">{c.title}</span>
                      <span className="clip text-small text-ink-3">{whenLabel(c.scheduledAt!, now)}</span>
                    </span>
                    <span className="flex flex-none flex-col items-end gap-1">
                      <NetworkStack networks={networksOf(c)} size={18} />
                      <StatusTag status={c.status} className="px-[7px] py-[1px] text-micro" />
                    </span>
                  </Link>
                ))}
              </div>
            </>
          ) : null}
        </Panel>

        {/* À traiter */}
        <Panel
          title="À traiter"
          right={needs.length ? <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-alert px-2 text-small font-bold text-white">{needs.length}</span> : null}
          className="bg-[linear-gradient(180deg,var(--c-paper),var(--c-paper)_60%,var(--c-gold-wash))]"
        >
          {needs.length === 0 ? (
            <Empty text="Rien n'attend personne. Belle journée." />
          ) : (
            <div className="flex flex-col gap-2">
              {needs.slice(0, 6).map((n) => (
                <div key={n.key} className="flex items-start gap-3 rounded-[18px] border border-line bg-paper p-3">
                  {n.coverId ? (
                    <Cover asset={covers.get(n.coverId)} ratio="1/1" className="w-11 flex-none rounded-[12px]" label=" " />
                  ) : (
                    <span
                      className={cn(
                        "flex h-11 w-11 flex-none items-center justify-center rounded-[12px]",
                        n.tone === "alert" ? "bg-alert text-white" : n.tone === "warn" ? "bg-warn-bg text-warn" : "bg-info-bg text-info",
                      )}
                    >
                      <Icon name={n.tone === "alert" ? "alert" : n.key.startsWith("s") ? "camera" : "inbox"} size={18} />
                    </span>
                  )}
                  <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
                    <span className="clip text-base font-semibold text-ink">{n.title}</span>
                    <span className="clip text-small text-ink-3">{n.meta}</span>
                    <Link
                      href={n.href}
                      className={cn(
                        "mt-2 inline-flex w-fit items-center gap-1 rounded-full px-[14px] py-[6px] text-small font-semibold no-underline hover:no-underline",
                        n.tone === "alert" ? "bg-night text-white" : n.cta === "Ouvrir" ? "bg-ok text-white" : "border border-line text-ink",
                      )}
                    >
                      {n.cta === "Ouvrir" ? <Icon name="check" size={14} strokeWidth={2.4} /> : null}
                      {n.cta}
                    </Link>
                  </span>
                </div>
              ))}
              {needs.length > 6 ? (
                <Link href="/approbations" className="mx-auto mt-1 rounded-full border border-line px-4 py-[7px] text-small font-medium text-ink no-underline hover:no-underline">
                  Voir les {needs.length - 6} autres
                </Link>
              ) : null}
            </div>
          )}
        </Panel>

      </div>

      {/* Audience et meilleure publication (relevés Metricool) */}
      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
        <Panel title="Croissance de l'audience" action={{ href: "/rapports", label: "Rapports", icon: "chart" }}>
          {aud && aud.points.length ? (
            <AudiencePanel data={aud} />
          ) : (
            <Empty
              text="Les abonnés de vos clients s'afficheront ici dès que Metricool sera raccordé et les clients reliés à leur marque."
              href="/reglages"
              cta="Raccorder Metricool"
            />
          )}
        </Panel>
        <Panel title="Meilleure publication du mois">
          {top ? (
            <a
              href={top.url ?? "#"}
              target="_blank"
              rel="noreferrer"
              className="group relative flex min-h-[300px] flex-1 flex-col justify-end overflow-hidden rounded-[22px] bg-night p-4 text-white no-underline hover:no-underline"
            >
              {top.imageUrl ? (
                // Image hébergée par le réseau social : pas d'optimisation Next possible.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={top.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-80 transition-opacity group-hover:opacity-90" referrerPolicy="no-referrer" />
              ) : null}
              <span className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0)_30%,rgba(0,0,0,.82))]" />
              {top.multiple && top.multiple >= 1.5 ? (
                <span className="absolute top-4 left-4 rounded-full bg-accent px-3 py-[3px] text-small font-semibold text-accent-ink">
                  {top.multiple.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}× la portée habituelle
                </span>
              ) : null}
              <span className="relative flex items-center gap-2 text-small">
                <ClientChip name={top.clientName} size={22} /> {top.clientName}
                <span className="ml-auto">
                  <NetworkDot network={top.network} size={22} />
                </span>
              </span>
              <p className="relative mt-2 mb-3 line-clamp-2 max-h-[2.9em] overflow-hidden text-base leading-[1.45] font-medium break-words">{top.text || "Publication sans texte"}</p>
              <span className="relative flex gap-6">
                <TopStat value={compact(Math.max(top.reach, top.views))} label={top.reach >= top.views ? "portée" : "vues"} />
                <TopStat value={compact(top.interactions)} label="interactions" />
                {top.saves ? <TopStat value={compact(top.saves)} label="enregistrements" /> : null}
              </span>
            </a>
          ) : (
            <Empty text="Aucune publication relevée ce mois-ci pour l'instant." />
          )}
        </Panel>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
        {/* Engagements du mois */}
        <Panel title={`Engagements · ${monthLabel(now)}`} action={{ href: "/avancement", label: "Avancement" }}>
          <div className="mb-3 flex items-baseline gap-3">
            <span className="text-[40px] leading-none font-bold tracking-[-0.03em]">{late.length}</span>
            <span className="text-base text-ink-2">
              client{late.length > 1 ? "s" : ""} en retard ou à risque sur {portfolio.filter((c) => c.contentTarget > 0).length}
            </span>
          </div>
          <p className="mb-4 text-small text-ink-3">
            Barre foncée : publié · barre claire : projection fin de mois · repère or : où l&apos;on devrait en être aujourd&apos;hui.
          </p>
          <div className="flex flex-col gap-4">
            {portfolio
              .filter((c) => c.contentTarget > 0)
              .sort((a, b) => a.pace.gap - b.pace.gap)
              .map((c) => (
                <Link key={c.id} href={`/clients/${c.id}`} className="grid grid-cols-[28px_minmax(0,140px)_minmax(0,1fr)_auto] items-center gap-3 text-ink no-underline hover:no-underline">
                  <ClientChip name={c.shortName} size={28} />
                  <span className="clip text-base font-medium">{c.shortName}</span>
                  <PacingBar fillPct={c.pace.fillPct} projPct={c.pace.projPct} markerLeft={c.pace.markerLeft} fillClass={c.pace.key === "late" ? "bg-alert" : c.pace.key === "risk" ? "bg-warn" : "bg-ink"} />
                  <span className="w-[70px] text-right text-small text-ink-2 tabular-nums">
                    {c.done} / {c.contentTarget}
                  </span>
                </Link>
              ))}
          </div>
        </Panel>

        {/* Tournages */}
        <Panel title="Tournages à venir" action={{ href: "/tournages", label: "Tournages" }}>
          {shoots.length === 0 ? (
            <Empty text="Aucun tournage dans les 14 prochains jours." href="/tournages" cta="Planifier" />
          ) : (
            <div className="flex flex-col gap-2">
              {shoots.slice(0, 4).map((s) => (
                <Link key={s.id} href={`/tournages/${s.id}`} className="flex items-center gap-3 rounded-[16px] border border-line p-3 text-ink no-underline hover:border-line-strong hover:no-underline">
                  <span className="flex w-12 flex-none flex-col items-center rounded-[12px] bg-mute py-1">
                    <span className="text-micro font-semibold text-ink-3 uppercase">{s.startsAt.toLocaleDateString("fr-FR", { weekday: "short" })}</span>
                    <span className="text-title leading-tight font-bold">{s.startsAt.getDate()}</span>
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="clip text-base font-semibold">{s.title}</span>
                    <span className="clip text-small text-ink-3">
                      {s.clientName} · {hhmm(s.startsAt)}
                      {s.place ? ` · ${s.place}` : ""}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "rounded-full px-[9px] py-[3px] text-small font-medium whitespace-nowrap",
                      s.status === "confirme" ? "bg-ok-bg text-ok" : s.status === "a_securiser" ? "bg-warn-bg text-warn" : "bg-mute text-ink-2",
                    )}
                  >
                    {s.status === "confirme" ? "Confirmé" : s.status === "a_securiser" ? "À sécuriser" : s.status === "realise" ? "Réalisé" : "En préparation"}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </Panel>
      </div>

      {/* La semaine */}
      <Panel title="La semaine" action={{ href: "/calendrier", label: "Calendrier", icon: "calendar" }} className="mt-5">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {days.map(({ d, items }, i) => (
            <div key={i} className={cn("flex min-h-[170px] flex-col rounded-[18px] border p-3", i === 0 ? "border-night bg-night text-white" : "border-line")}>
              <span className="mb-3 flex items-baseline justify-between">
                <span className={cn("text-base font-medium capitalize", i === 0 ? "text-white/80" : "text-ink-2")}>
                  {d.toLocaleDateString("fr-FR", { weekday: "short" })}
                </span>
                <span className="text-title font-bold">{d.getDate()}</span>
              </span>
              <div className="flex flex-col gap-[6px]">
                {items.slice(0, 3).map((c) => (
                  <Link
                    key={c.id}
                    href={`/contenu/${c.id}`}
                    title={`${c.clientName} · ${c.title}`}
                    className={cn(
                      "flex items-center justify-between gap-1 rounded-full py-[3px] pr-[3px] pl-3 text-small font-semibold no-underline hover:no-underline",
                      c.publishedAt ? "bg-ok text-white" : c.status === "pret" ? "bg-info text-white" : c.status === "validation" || c.status === "revision" ? "bg-accent text-accent-ink" : "bg-alert text-white",
                    )}
                  >
                    {hhmm(c.scheduledAt!)}
                    <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-white text-[9px] font-bold text-[#15161a]">
                      {c.clientName.slice(0, 2).toUpperCase()}
                    </span>
                  </Link>
                ))}
                {items.length > 3 ? (
                  <span className={cn("rounded-full py-[3px] text-center text-small font-semibold", i === 0 ? "bg-white/10" : "bg-mute text-ink-2")}>
                    +{items.length - 3}
                  </span>
                ) : null}
              </div>
              <span className={cn("mt-auto pt-3 text-small", i === 0 ? "text-white/60" : "text-ink-3")}>
                {items.length ? `${items.length} contenu${items.length > 1 ? "s" : ""}` : "Rien de prévu"}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-small text-ink-3">
          <Legend cls="bg-ok" label="Publié" />
          <Legend cls="bg-info" label="Prêt" />
          <Legend cls="bg-accent" label="En validation" />
          <Legend cls="bg-alert" label="Pas encore prêt" />
        </div>
      </Panel>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        {/* Réseaux */}
        <Panel title="Réseaux ce mois-ci" action={{ href: "/rapports", label: "Rapports", icon: "chart" }}>
          {networks.length === 0 ? (
            <Empty text="Aucun contenu ce mois-ci." />
          ) : (
            <div className="flex flex-col gap-4">
              {networks.map((n) => (
                <div key={n.network} className="grid grid-cols-[30px_minmax(0,1fr)_auto] items-center gap-3">
                  <NetworkDot network={n.network} size={30} />
                  <span className="flex min-w-0 flex-col gap-[6px]">
                    <span className="flex justify-between text-base">
                      <span className="font-medium">{networkLabel(n.network)}</span>
                      <span className="text-ink-2 tabular-nums">{n.total}</span>
                    </span>
                    <span className="relative block h-[6px] rounded-full bg-slot">
                      <span className="absolute inset-y-0 left-0 rounded-full bg-line-strong" style={{ width: `${(n.total / maxNet) * 100}%` }} />
                      <span className="absolute inset-y-0 left-0 rounded-full bg-info" style={{ width: `${(n.published / maxNet) * 100}%` }} />
                    </span>
                  </span>
                  <span className="w-[74px] text-right text-small text-ink-3 tabular-nums">{n.published} publiés</span>
                </div>
              ))}
            </div>
          )}
        </Panel>

        {/* À valider côté client */}
        <Panel title="Chez le client" action={{ href: "/approbations", label: "Validations" }}>
          <div className="mb-4 grid grid-cols-3 gap-2">
            <MiniStat n={approvals.filter((a) => a.content.status === "validation").length} label="à valider" />
            <MiniStat n={approvals.filter((a) => (a.waitingDays ?? 0) >= 3).length} label="depuis 3 j +" />
            <MiniStat n={approvals.filter((a) => a.content.status === "revision").length} label="en révision" />
          </div>
          <div className="flex flex-col gap-3">
            {approvals.slice(0, 4).map((a) => (
              <Link key={a.content.id} href={`/contenu/${a.content.id}`} className="flex items-center gap-3 text-ink no-underline hover:no-underline">
                <ClientChip name={a.clientName} size={34} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="clip text-base font-semibold">{a.content.title}</span>
                  <span className="clip text-small text-ink-3">
                    {a.clientName}
                    {a.waitingDays != null ? ` · attend depuis ${a.waitingDays} j` : ""}
                  </span>
                </span>
                <StatusTag status={a.content.status} />
              </Link>
            ))}
            {approvals.length === 0 ? <Empty text="Aucun contenu en attente de validation." /> : null}
          </div>
        </Panel>

        {/* Activité de l'équipe */}
        <Panel title="Activité de l'équipe" right={<Icon name="activity" size={18} className="text-ink-3" />}>
          {activity.length === 0 ? (
            <Empty text="Les actions de l'équipe apparaîtront ici." />
          ) : (
            <div className="flex flex-col">
              {activity.map((a) => (
                <div key={a.id} className="flex gap-3 border-b border-line py-3 last:border-none">
                  <Avatar initials={a.actorInitials ?? "·"} src={a.actorAvatar && a.actorId ? `/api/avatar/${a.actorId}` : null} size={32} />
                  <span className="flex min-w-0 flex-col">
                    <span className="text-base text-ink">
                      <b className="font-semibold">{a.actorName?.split(" ")[0] ?? a.actorLabel ?? "Pilot"}</b> {a.text}
                      {a.clientName ? <span className="text-ink-3"> · {a.clientName}</span> : null}
                    </span>
                    <span className="text-small text-ink-3">{ago(a.createdAt, now)}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

function Stat({ icon, value, label, pill }: { icon: "send" | "gauge" | "calendar" | "users"; value: string; label: string; pill?: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-11 w-11 flex-none items-center justify-center rounded-full border border-line bg-paper text-ink shadow-soft">
        <Icon name={icon} size={18} />
      </span>
      <span className="flex flex-col">
        <span className="flex items-center gap-2">
          <span className="text-[22px] leading-tight font-bold tracking-[-0.02em] tabular-nums">{value}</span>
          {pill ? <span className="rounded-full bg-ok px-2 py-[2px] text-micro font-bold text-white">{pill}</span> : null}
        </span>
        <span className="max-w-[190px] text-small leading-tight text-ink-3">{label}</span>
      </span>
    </div>
  );
}

function MiniStat({ n, label }: { n: number; label: string }) {
  return (
    <div className="flex flex-col rounded-[16px] border border-line px-3 py-2">
      <span className="text-title font-bold tabular-nums">{n}</span>
      <span className="text-small text-ink-3">{label}</span>
    </div>
  );
}

function Legend({ cls, label }: { cls: string; label: string }) {
  return (
    <span className="flex items-center gap-[6px]">
      <span className={cn("h-[9px] w-[9px] rounded-full", cls)} />
      {label}
    </span>
  );
}

function LiveDot() {
  return (
    <span className="flex items-center gap-[6px] rounded-full border border-line px-3 py-[5px] text-small text-ink-2">
      <span className="h-[7px] w-[7px] rounded-full bg-ok" /> File en direct
    </span>
  );
}

function Empty({ text, href, cta }: { text: string; href?: string; cta?: string }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-[18px] border border-dashed border-line-strong p-5 text-base text-ink-3">
      {text}
      {href && cta ? (
        <Link href={href} className="rounded-full border border-line px-4 py-[6px] text-small font-semibold text-ink no-underline hover:no-underline">
          {cta}
        </Link>
      ) : null}
    </div>
  );
}

function compact(n: number) {
  if (Math.abs(n) >= 10_000) return `${(n / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} k`;
  return n.toLocaleString("fr-FR");
}

function TopStat({ value, label }: { value: string; label: string }) {
  return (
    <span className="flex flex-col">
      <span className="text-[22px] leading-none font-bold tracking-[-0.02em]">{value}</span>
      <span className="text-micro text-white/70">{label}</span>
    </span>
  );
}
