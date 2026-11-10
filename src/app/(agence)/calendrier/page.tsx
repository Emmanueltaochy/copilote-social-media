import Link from "next/link";
import { PageHeader } from "@/components/shell/Screen";
import { EmptyState } from "@/components/ui/EmptyState";
import { Cover } from "@/components/ui/Cover";
import { Icon, type IconName } from "@/components/ui/Icon";
import { requireDepartment } from "@/lib/auth";
import { coversFor, listClientOptions } from "@/db/queries";
import { networksOf } from "@/data/content";
import { cn } from "@/lib/cn";
import { ClientChip, NetworkDot, NetworkStack, StatusTag, hhmm, initialsOf, networkLabel } from "@/components/home/bits";
import { contentsBetween, unscheduled } from "./calendar-queries";

export const dynamic = "force-dynamic";

const WEEKDAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

type Row = Awaited<ReturnType<typeof contentsBetween>>[number];

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
/** Le lundi de la semaine de `d`. */
const monday = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** Même code couleur que « La semaine » de l'accueil. */
function tone(c: Row["content"]) {
  if (c.publishedAt) return "bg-ok text-white";
  if (c.status === "pret") return "bg-info text-white";
  if (c.status === "validation" || c.status === "revision") return "bg-accent text-accent-ink";
  return "bg-alert text-white";
}

function parseDate(s?: string) {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  const out = new Date(y, m - 1, d);
  return Number.isNaN(out.getTime()) ? null : out;
}

/**
 * Le calendrier éditorial, façon Murmura : semaine ou mois, un code couleur
 * par statut, et à côté le mini-calendrier, ce qui attend une date et la
 * répartition par réseau. `?vue=mois`, `?date=AAAA-MM-JJ`, `?client=`.
 */
export default async function CalendrierPage({
  searchParams,
}: {
  searchParams: Promise<{ vue?: string; date?: string; client?: string }>;
}) {
  await requireDepartment("social");
  const sp = await searchParams;
  const clients = await listClientOptions("social");

  if (clients.length === 0) {
    return (
      <>
        <PageHeader title="Calendrier éditorial" sub="Aucun client" />
        <EmptyState title="Rien à planifier" actionLabel="Ajouter un client" actionHref="/clients">
          Le calendrier affiche les contenus programmés, un par créneau. Il faut d&apos;abord un client.
        </EmptyState>
      </>
    );
  }

  const view = sp.vue === "mois" ? "mois" : "semaine";
  const clientId = clients.some((c) => c.id === sp.client) ? sp.client : undefined;
  const now = new Date();
  const today = startOfDay(now);
  const anchor = parseDate(sp.date) ?? today;

  // Plage affichée : la semaine du point d'ancrage, ou les six semaines de la
  // grille du mois (lundi avant le 1er → 42 jours).
  const monthStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const rangeStart = view === "semaine" ? monday(anchor) : monday(monthStart);
  const rangeDays = view === "semaine" ? 7 : 42;
  const rangeEnd = addDays(rangeStart, rangeDays);
  const weekStart = monday(today);

  const [rows, waiting, weekRows] = await Promise.all([
    contentsBetween(rangeStart, rangeEnd, clientId),
    unscheduled(clientId),
    contentsBetween(today < weekStart ? today : weekStart, addDays(today, 7) > addDays(weekStart, 7) ? addDays(today, 7) : addDays(weekStart, 7), clientId),
  ]);
  const covers = view === "semaine" ? await coversFor(rows.map((r) => r.content.id)) : new Map();

  const byDay = new Map<string, Row[]>();
  for (const r of rows) {
    const k = ymd(r.content.scheduledAt!);
    byDay.set(k, [...(byDay.get(k) ?? []), r]);
  }

  // Chiffres d'en-tête, sur la semaine en cours et les 7 prochains jours.
  const inThisWeek = weekRows.filter((r) => r.content.scheduledAt! >= weekStart && r.content.scheduledAt! < addDays(weekStart, 7));
  const scheduledWeek = inThisWeek.filter((r) => !r.content.publishedAt).length;
  const publishedWeek = inThisWeek.filter((r) => r.content.publishedAt).length;
  const awaiting = rows.filter((r) => r.content.status === "validation" || r.content.status === "revision").length;
  const next7 = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const emptyDays = next7.filter((d) => !weekRows.some((r) => sameDay(r.content.scheduledAt!, d))).length;

  const href = (o: { vue?: string; date?: Date | null; client?: string | null }) => {
    const q = new URLSearchParams();
    const v = o.vue ?? view;
    if (v === "mois") q.set("vue", "mois");
    const d = o.date === undefined ? (sp.date ? anchor : null) : o.date;
    if (d && !sameDay(d, today)) q.set("date", ymd(d));
    const c = o.client === undefined ? clientId : o.client;
    if (c) q.set("client", c);
    const s = q.toString();
    return `/calendrier${s ? `?${s}` : ""}`;
  };
  const prev = view === "semaine" ? addDays(anchor, -7) : new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1);
  const next = view === "semaine" ? addDays(anchor, 7) : new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1);
  const newHref = (d: Date) => `/contenu?date=${ymd(d)}${clientId ? `&client=${clientId}` : ""}`;

  const last = addDays(rangeEnd, -1);
  const title =
    view === "semaine"
      ? rangeStart.getMonth() === last.getMonth()
        ? `${rangeStart.getDate()} – ${last.getDate()} ${MONTHS[last.getMonth()]} ${last.getFullYear()}`
        : `${rangeStart.getDate()} ${MONTHS[rangeStart.getMonth()].slice(0, 4)}. – ${last.getDate()} ${MONTHS[last.getMonth()].slice(0, 4)}. ${last.getFullYear()}`
      : `${MONTHS[anchor.getMonth()].charAt(0).toUpperCase() + MONTHS[anchor.getMonth()].slice(1)} ${anchor.getFullYear()}`;
  const shown = view === "semaine" ? rows : rows.filter((r) => r.content.scheduledAt!.getMonth() === anchor.getMonth());
  const clientCount = new Set(shown.map((r) => r.content.clientId)).size;

  // Répartition par réseau de la période affichée.
  const nets = new Map<string, number>();
  for (const r of shown) for (const n of networksOf(r.content)) nets.set(n, (nets.get(n) ?? 0) + 1);
  const netRows = [...nets.entries()].sort((a, b) => b[1] - a[1]);
  const netMax = Math.max(1, ...netRows.map((n) => n[1]));

  return (
    <div className="min-h-0 flex-1 overflow-auto px-4 pt-1 pb-10 lg:px-7">
      {/* Titre + chiffres */}
      <div className="mb-4 flex flex-wrap items-center gap-x-8 gap-y-4">
        <h1 className="text-[34px] leading-[1.05] font-bold tracking-[-0.03em] lg:text-[40px]">
          Calendrier
          <br className="hidden lg:block" /> éditorial
        </h1>
        <div className="grid w-full grid-cols-2 gap-4 sm:flex sm:w-auto sm:flex-wrap sm:gap-x-8">
          <Stat icon="calendar" value={scheduledWeek} label="programmés cette semaine" />
          <Stat icon="check" value={awaiting} label="en validation sur la période" />
          <Stat icon="send" value={publishedWeek} label="publiés cette semaine" />
          <Stat icon="grid" value={emptyDays} label="jours vides sur les 7 prochains" />
        </div>
      </div>

      {/* Commandes */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="flex rounded-full bg-mute p-[3px]">
          {[
            ["semaine", "Semaine"],
            ["mois", "Mois"],
          ].map(([v, l]) => (
            <Link
              key={v}
              href={href({ vue: v })}
              className={cn(
                "rounded-full px-4 py-[7px] text-base font-medium no-underline hover:no-underline",
                view === v ? "bg-paper text-ink shadow-soft" : "text-ink-3 hover:text-ink",
              )}
            >
              {l}
            </Link>
          ))}
        </span>
        <Link href={href({ date: prev })} aria-label="Période précédente" className={roundBtn}>
          <Icon name="chevronDown" size={16} className="rotate-90" />
        </Link>
        <Link href={href({ date: null })} className="rounded-full border border-line bg-paper px-4 py-[8px] text-base font-medium text-ink no-underline hover:border-line-strong hover:no-underline">
          Aujourd&apos;hui
        </Link>
        <Link href={href({ date: next })} aria-label="Période suivante" className={roundBtn}>
          <Icon name="chevronDown" size={16} className="-rotate-90" />
        </Link>
        <Link
          href={newHref(anchor < today ? today : anchor)}
          className="ml-auto flex items-center gap-2 rounded-full bg-night px-5 py-[10px] text-base font-semibold text-white no-underline shadow-soft hover:no-underline hover:brightness-125"
        >
          <Icon name="plus" size={16} strokeWidth={2.2} /> Nouveau contenu
        </Link>
      </div>

      {/* Filtres client + légende */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Link
          href={href({ client: null })}
          className={cn(
            "flex items-center gap-2 rounded-full border px-3 py-[6px] text-small font-medium no-underline hover:no-underline",
            !clientId ? "border-ink bg-ink text-paper" : "border-line bg-paper text-ink hover:border-line-strong",
          )}
        >
          <Icon name="layers" size={14} /> Tous les clients
        </Link>
        {clients.map((c) => (
          <Link
            key={c.id}
            href={href({ client: clientId === c.id ? null : c.id })}
            title={c.name}
            className={cn(
              "flex items-center gap-2 rounded-full border py-[3px] pr-3 pl-[3px] text-small font-medium no-underline hover:no-underline",
              clientId === c.id ? "border-ink bg-ink text-paper" : "border-line bg-paper text-ink hover:border-line-strong",
            )}
          >
            <ClientChip name={c.name} size={22} /> {c.name}
          </Link>
        ))}
        <span className="mx-1 hidden h-5 w-px bg-line sm:block" />
        <Legend cls="bg-info" label="Prêt" />
        <Legend cls="bg-accent" label="En validation" />
        <Legend cls="bg-ok" label="Publié" />
        <Legend cls="bg-alert" label="Pas encore prêt" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        {/* --------------------------------------------- la grille -------- */}
        <section className="min-w-0 rounded-[26px] border border-line bg-paper p-4 shadow-soft sm:p-5">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-title font-bold tracking-[-0.02em]">{title}</h2>
            <span className="text-small text-ink-3">
              {shown.length} contenu{shown.length > 1 ? "s" : ""} · {clientCount} client{clientCount > 1 ? "s" : ""}
            </span>
          </div>

          {view === "semaine" ? (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-7">
              {Array.from({ length: 7 }, (_, i) => addDays(rangeStart, i)).map((d) => {
                const items = byDay.get(ymd(d)) ?? [];
                const isToday = sameDay(d, today);
                return (
                  <div
                    key={ymd(d)}
                    className={cn(
                      "group flex min-h-[150px] flex-col rounded-[20px] border p-[10px] lg:min-h-[420px]",
                      isToday ? "border-night bg-night text-white ring-1 ring-gold/50" : "border-line bg-paper",
                    )}
                  >
                    <div className="mb-3 flex items-start justify-between">
                      <span className="flex flex-col">
                        <span className={cn("text-micro font-semibold tracking-wide uppercase", isToday ? "text-white/70" : "text-ink-3")}>
                          {WEEKDAYS[(d.getDay() + 6) % 7]}
                        </span>
                        <span className="text-[24px] leading-tight font-bold">{d.getDate()}</span>
                      </span>
                      <Link
                        href={newHref(d)}
                        title="Nouveau contenu ce jour-là"
                        aria-label="Nouveau contenu ce jour-là"
                        className={cn(
                          "flex h-7 w-7 items-center justify-center rounded-full no-underline opacity-60 hover:no-underline hover:opacity-100",
                          isToday ? "bg-white/10 text-white" : "bg-mute text-ink",
                        )}
                      >
                        <Icon name="plus" size={14} strokeWidth={2.2} />
                      </Link>
                    </div>
                    <div className="flex flex-col gap-[6px]">
                      {items.map(({ content: c, clientName }) => (
                        <Link
                          key={c.id}
                          href={`/contenu/${c.id}`}
                          title={`${clientName} · ${c.title}`}
                          className={cn("flex flex-col gap-1 rounded-[14px] p-2 no-underline hover:no-underline hover:brightness-105", tone(c))}
                        >
                          <span className="flex items-start justify-between gap-1">
                            <span className="flex min-w-0 flex-col">
                              <span className="text-small font-bold tabular-nums">{hhmm(c.scheduledAt!)}</span>
                              <span className="line-clamp-2 text-small leading-tight font-medium">{c.title}</span>
                            </span>
                            {covers.get(c.id) ? <Cover asset={covers.get(c.id)} ratio="1/1" className="w-8 flex-none rounded-[8px]" label=" " /> : null}
                          </span>
                          <span className="flex items-center gap-1">
                            <span className="flex h-[20px] min-w-[20px] items-center justify-center rounded-full bg-paper px-1 text-[9px] font-bold text-ink">
                              {initialsOf(clientName)}
                            </span>
                            <NetworkStack networks={networksOf(c)} size={18} />
                          </span>
                        </Link>
                      ))}
                    </div>
                    <span className={cn("mt-auto pt-3 text-small", isToday ? "text-white/60" : "text-ink-3")}>
                      {items.length ? `${items.length} contenu${items.length > 1 ? "s" : ""}` : "Libre"}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-7 gap-1 sm:gap-2">
                {WEEKDAYS.map((w) => (
                  <span key={w} className="px-1 text-micro font-semibold tracking-wide text-ink-3 uppercase sm:px-2">
                    {w}
                  </span>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1 sm:gap-2">
                {Array.from({ length: 42 }, (_, i) => addDays(rangeStart, i)).map((d) => {
                  const items = byDay.get(ymd(d)) ?? [];
                  const inMonth = d.getMonth() === anchor.getMonth();
                  const isToday = sameDay(d, today);
                  return (
                    <div
                      key={ymd(d)}
                      className={cn(
                        "flex min-h-[64px] min-w-0 flex-col gap-1 rounded-[12px] border p-1 sm:min-h-[118px] sm:rounded-[16px] sm:p-2",
                        isToday ? "border-night bg-night text-white ring-1 ring-gold/50" : inMonth ? "border-line bg-paper" : "border-transparent bg-mute/50 text-ink-3",
                      )}
                    >
                      <Link
                        href={href({ vue: "semaine", date: d })}
                        className={cn("w-fit text-small font-semibold no-underline hover:underline", isToday ? "text-white" : inMonth ? "text-ink" : "text-ink-3")}
                      >
                        {d.getDate()}
                      </Link>
                      {/* Téléphone : des points, la place manque pour des pastilles. */}
                      <span className="flex flex-wrap gap-[3px] sm:hidden">
                        {items.slice(0, 6).map(({ content: c }) => (
                          <span key={c.id} className={cn("h-[7px] w-[7px] rounded-full", tone(c).split(" ")[0])} />
                        ))}
                      </span>
                      <span className="hidden flex-col gap-1 sm:flex">
                        {items.slice(0, 3).map(({ content: c, clientName }) => (
                          <Link
                            key={c.id}
                            href={`/contenu/${c.id}`}
                            title={`${clientName} · ${c.title}`}
                            className={cn(
                              "flex items-center justify-between gap-1 rounded-full py-[2px] pr-[2px] pl-2 text-micro font-semibold no-underline hover:no-underline",
                              tone(c),
                            )}
                          >
                            <span className="clip">{hhmm(c.scheduledAt!)}</span>
                            <span className="flex h-[18px] min-w-[18px] flex-none items-center justify-center rounded-full bg-paper px-[3px] text-[8.5px] font-bold text-ink">
                              {initialsOf(clientName)}
                            </span>
                          </Link>
                        ))}
                        {items.length > 3 ? (
                          <Link
                            href={href({ vue: "semaine", date: d })}
                            className={cn("rounded-full py-[2px] text-center text-micro font-semibold no-underline hover:no-underline", isToday ? "bg-white/10 text-white" : "bg-mute text-ink-2")}
                          >
                            +{items.length - 3}
                          </Link>
                        ) : null}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {shown.length === 0 ? (
            <p className="mt-4 text-base text-ink-2">
              Rien de programmé sur cette période. Les contenus datés apparaissent ici à leur date de publication.
            </p>
          ) : null}
        </section>

        {/* --------------------------------------------- à côté ----------- */}
        <aside className="flex min-w-0 flex-col gap-5 md:grid md:grid-cols-2 xl:flex">
          <MiniMonth anchor={anchor} today={today} href={(d) => href({ vue: "semaine", date: d })} monthHref={(d) => href({ date: d })} days={byDay} view={view} rangeStart={rangeStart} />

          <section className="flex flex-col gap-3 rounded-[26px] border border-line bg-paper p-5 shadow-soft">
            <div className="flex items-center justify-between">
              <h2 className="text-lead font-semibold">Sans date</h2>
              {waiting.length ? <span className="rounded-full bg-mute px-2 py-[1px] text-small font-semibold text-ink-2">{waiting.length}</span> : null}
            </div>
            <p className="-mt-2 text-small text-ink-3">En cours, en attente d&apos;un créneau.</p>
            {waiting.length ? (
              waiting.map((w) => (
                <Link
                  key={w.id}
                  href={`/contenu/${w.id}`}
                  className="flex items-center gap-3 rounded-[14px] border border-dashed border-line-strong p-2 pr-3 text-ink no-underline hover:border-ink-3 hover:no-underline"
                >
                  <ClientChip name={w.clientName} size={30} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="clip text-base font-medium">{w.title}</span>
                    <span className="text-micro text-ink-3">{w.clientName}</span>
                  </span>
                  <StatusTag status={w.status} className="px-[7px] py-[1px] text-micro" />
                </Link>
              ))
            ) : (
              <p className="text-small text-ink-2">Tout ce qui est en cours a une date.</p>
            )}
          </section>

          <section className="flex flex-col gap-3 rounded-[26px] border border-line bg-paper p-5 shadow-soft md:col-span-2 xl:col-span-1">
            <div>
              <h2 className="text-lead font-semibold">Par réseau</h2>
              <p className="text-small text-ink-3">
                {title} · {shown.length} contenu{shown.length > 1 ? "s" : ""}
              </p>
            </div>
            {netRows.length ? (
              netRows.map(([n, count]) => (
                <div key={n} className="grid grid-cols-[24px_80px_minmax(0,1fr)_28px] items-center gap-3">
                  <NetworkDot network={n} size={24} />
                  <span className="text-base">{networkLabel(n)}</span>
                  <span className="h-[6px] rounded-full bg-slot">
                    <span className="block h-full rounded-full bg-ink" style={{ width: `${(count / netMax) * 100}%` }} />
                  </span>
                  <span className="text-right text-base font-semibold tabular-nums">{count}</span>
                </div>
              ))
            ) : (
              <p className="text-small text-ink-2">Aucun contenu sur la période.</p>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

const roundBtn =
  "flex h-10 w-10 items-center justify-center rounded-full border border-line bg-paper text-ink no-underline hover:border-line-strong hover:no-underline";

function Stat({ icon, value, label }: { icon: IconName; value: number; label: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-11 w-11 flex-none items-center justify-center rounded-full border border-line bg-paper text-ink shadow-soft">
        <Icon name={icon} size={18} />
      </span>
      <span className="flex flex-col">
        <span className="text-[22px] leading-tight font-bold tracking-[-0.02em] tabular-nums">{value}</span>
        <span className="text-small text-ink-3">{label}</span>
      </span>
    </div>
  );
}

function Legend({ cls, label }: { cls: string; label: string }) {
  return (
    <span className="flex items-center gap-[6px] px-1 text-small text-ink-2">
      <span className={cn("h-[9px] w-[9px] rounded-full", cls)} /> {label}
    </span>
  );
}

function MiniMonth({
  anchor,
  today,
  href,
  monthHref,
  days,
  view,
  rangeStart,
}: {
  anchor: Date;
  today: Date;
  href: (d: Date) => string;
  monthHref: (d: Date) => string;
  days: Map<string, Row[]>;
  view: string;
  rangeStart: Date;
}) {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const start = monday(first);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const weekEnd = addDays(rangeStart, 7);
  return (
    <section className="flex flex-col gap-3 rounded-[26px] border border-line bg-paper p-5 shadow-soft">
      <div className="flex items-center justify-between">
        <h2 className="text-lead font-semibold capitalize">
          {MONTHS[anchor.getMonth()]} {anchor.getFullYear()}
        </h2>
        <span className="flex gap-1">
          <Link href={monthHref(new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1))} aria-label="Mois précédent" className={cn(roundBtn, "h-8 w-8")}>
            <Icon name="chevronDown" size={14} className="rotate-90" />
          </Link>
          <Link href={monthHref(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1))} aria-label="Mois suivant" className={cn(roundBtn, "h-8 w-8")}>
            <Icon name="chevronDown" size={14} className="-rotate-90" />
          </Link>
        </span>
      </div>
      <div className="grid grid-cols-7 gap-y-1 text-center">
        {WEEKDAYS.map((w) => (
          <span key={w} className="text-micro font-semibold text-ink-3">
            {w.charAt(0)}
          </span>
        ))}
        {cells.map((d) => {
          const inMonth = d.getMonth() === anchor.getMonth();
          const isToday = sameDay(d, today);
          const inWeek = view === "semaine" && d >= rangeStart && d < weekEnd;
          const has = (days.get(ymd(d)) ?? []).length > 0;
          return (
            <Link
              key={ymd(d)}
              href={href(d)}
              className={cn(
                "relative mx-auto flex h-8 w-8 flex-col items-center justify-center rounded-full text-small no-underline hover:bg-mute hover:no-underline",
                isToday ? "bg-ink font-bold text-paper hover:bg-ink" : inWeek ? "bg-mute font-semibold text-ink" : inMonth ? "text-ink" : "text-ink-3",
              )}
            >
              {d.getDate()}
              {has && !isToday ? <span className="absolute bottom-[2px] h-[4px] w-[4px] rounded-full bg-info" /> : null}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
