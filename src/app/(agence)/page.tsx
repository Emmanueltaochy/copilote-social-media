import Link from "next/link";
import { requireDepartment } from "@/lib/auth";
import { CeMatin } from "@/components/home/CeMatin";
import { ceMatin } from "@/lib/ce-matin";
import { encartRevenu } from "@/lib/revenu";
import { coversFor, listAwaitingApproval, listClientsWithPace } from "@/db/queries";
import { missedRecently, publishedThisMonth, shootsSoon, teamActivity, upNext, weekAhead } from "@/db/home-queries";
import { ScopeNotice } from "@/components/shell/ScopeNotice";
import { CONTENT_STATUS } from "@/data/content";
import { devisNouveaux } from "@/db/queries";
import { monthLabel } from "@/lib/pacing";
import { networksOf } from "@/data/content";
import { cn } from "@/lib/cn";
import { Cover } from "@/components/ui/Cover";
import { Icon } from "@/components/ui/Icon";
import { PacingBar } from "@/components/ui/PacingBar";
import { Avatar } from "@/components/ui/primitives";
import { ClientChip, NetworkStack, Panel, StatusTag, ago, countdown, hhmm, whenLabel } from "@/components/home/bits";

/**
 * Aujourd'hui — l'accueil de l'agence.
 *
 * Une seule question : quoi faire maintenant ? Dans l'ordre : « Ce matin »
 * (à qui répondre, l'argent, les actions), ce qui attend en production, ce
 * qui part, la semaine, puis le rythme du mois et les tournages.
 *
 * Les chiffres d'audience (abonnés, meilleure publication, réseaux) vivent
 * dans « Statistiques » : ils disent comment ça va, pas quoi faire.
 *
 * L'accueil montre toujours toute l'agence. Le filtre client choisi sur les
 * écrans de production ne s'y applique pas (on y découvrait un « Bonjour »
 * réduit à un seul client sans l'avoir demandé) ; seul un lien explicite
 * `/?client=…` le filtre, et le dit.
 */
export default async function AujourdhuiPage({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  const user = await requireDepartment("social");
  const demande = (await searchParams).client;
  const scopeId = demande && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(demande) ? demande : undefined;
  const now = new Date();
  const [next, missed, approvals, week, published, activity, shoots, portfolio, devis] = await Promise.all([
    upNext(now, 9, scopeId),
    missedRecently(now, scopeId),
    listAwaitingApproval(scopeId),
    weekAhead(now, scopeId),
    publishedThisMonth(now, scopeId),
    teamActivity(8, scopeId),
    shootsSoon(now, scopeId),
    listClientsWithPace(now, "social", scopeId),
    devisNouveaux(scopeId),
  ]);
  // « Ce matin » : l'argent ne se charge que pour qui peut le voir, et les
  // lignes marquées « Traité » sont rangées à part.
  const matin = await ceMatin(user, now, scopeId);
  // Le revenu mensuel (GoCardless) : direction seulement, lu en base.
  const revenu = user.role === "direction" && !scopeId ? await encartRevenu(now) : null;
  const covers = await coversFor([...next.map((c) => c.id), ...approvals.map((a) => a.content.id)]);

  const scopeName = scopeId ? (portfolio.find((c) => c.id === scopeId)?.shortName ?? null) : null;
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
  const engages = portfolio.filter((c) => c.contentTarget > 0);

  return (
    <div className="min-h-0 flex-1 overflow-auto px-4 pt-1 pb-10 lg:px-7">
      {/* Bonjour, trois repères du mois, et le geste le plus courant. */}
      <div className="mb-5 flex flex-wrap items-end gap-x-8 gap-y-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-[34px] leading-[1.05] font-bold tracking-[-0.03em] lg:text-[40px]">
            {greeting}, {firstName}
          </h1>
          <ScopeNotice name={scopeName} />
        </div>
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
          <Stat
            icon="send"
            value={`${published} / ${sold}`}
            href="/avancement"
            label={`publiés en ${monthLabel(now).split(" ")[0]}, sur ${sold} vendus`}
          />
          <Stat
            icon="gauge"
            value={`${late.length}`}
            tone={late.length ? "alert" : undefined}
            href="/avancement"
            label={`client${late.length > 1 ? "s" : ""} en retard ou à risque sur ${engages.length}`}
          />
          <Stat icon="calendar" value={`${thisWeek}`} href="/calendrier" label="contenus prévus sur 7 jours" />
          {revenu ? <RevenuStat revenu={revenu} /> : null}
        </div>
        <Link
          href="/contenu"
          className="flex min-h-11 items-center gap-2 rounded-full bg-night px-5 text-base font-semibold text-white no-underline shadow-soft hover:no-underline hover:brightness-125 sm:ml-auto"
        >
          <Icon name="plus" size={17} strokeWidth={2.2} /> Nouveau contenu
        </Link>
      </div>

      <CeMatin matin={matin} />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
        {/* À traiter : en premier sur téléphone, c'est la liste qui demande un geste. */}
        <Panel
          title="À traiter"
          right={needs.length ? <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-alert px-2 text-small font-bold text-white">{needs.length}</span> : null}
          className="bg-[linear-gradient(180deg,var(--c-paper),var(--c-paper)_60%,var(--c-gold-wash))] xl:order-2"
        >
          {needs.length === 0 ? (
            <Empty text="Rien n'attend personne. Belle journée." />
          ) : (
            <div className="flex flex-col gap-2">
              {needs.slice(0, 6).map((n) => (
                <div key={n.key} className="flex items-start gap-3 rounded-[18px] border border-line bg-paper p-3">
                  {n.coverId ? (
                    <Cover asset={covers.get(n.coverId)} ratio="1/1" sizes="44px" className="w-11 flex-none rounded-[12px]" label=" " />
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
                        "mt-2 inline-flex min-h-9 w-fit items-center gap-1 rounded-full px-[14px] text-small font-semibold no-underline hover:no-underline",
                        n.tone === "alert" ? "bg-night text-white" : "border border-line text-ink hover:border-line-strong",
                      )}
                    >
                      {n.cta}
                    </Link>
                  </span>
                </div>
              ))}
              {needs.length > 6 ? (
                <div className="mt-1 flex flex-wrap justify-center gap-2">
                  {missed.length ? (
                    <Link href="/a-publier" className="flex min-h-11 items-center rounded-full border border-line px-4 text-small font-medium text-ink no-underline hover:no-underline lg:min-h-9">
                      {missed.length} à publier
                    </Link>
                  ) : null}
                  {approvals.length ? (
                    <Link href="/approbations" className="flex min-h-11 items-center rounded-full border border-line px-4 text-small font-medium text-ink no-underline hover:no-underline lg:min-h-9">
                      {approvals.length} à valider
                    </Link>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}
        </Panel>

        {/* À venir */}
        <Panel title="À venir" action={{ href: "/calendrier", label: "Calendrier" }} className="xl:order-1">
          {hero ? (
            <Link
              href={`/contenu/${hero.id}`}
              className="group grid gap-5 rounded-[22px] bg-night p-4 text-white no-underline hover:no-underline sm:grid-cols-[200px_minmax(0,1fr)]"
            >
              <Cover asset={covers.get(hero.id)} ratio="4/5" sizes="200px" className="rounded-[16px] max-sm:hidden" label={hero.kind === "reel" ? "Reel" : "Visuel à venir"} />
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
      </div>

      {/* La semaine */}
      <Panel title="La semaine" action={{ href: "/suivi", label: "Suivi de la semaine" }} className="mt-5">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {days.map(({ d, items }, i) => (
            <div key={i} className={cn("flex min-h-[150px] flex-col rounded-[18px] border p-3", i === 0 ? "border-night bg-night text-white" : "border-line")}>
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
                      "flex min-h-8 items-center justify-between gap-1 rounded-full py-[3px] pr-[3px] pl-3 text-small font-semibold no-underline hover:no-underline",
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
          <Legend cls="bg-ok" label={CONTENT_STATUS.publie.label} />
          <Legend cls="bg-info" label={CONTENT_STATUS.pret.label} />
          <Legend cls="bg-accent" label={`${CONTENT_STATUS.validation.label} ou ${CONTENT_STATUS.revision.label.toLowerCase()}`} />
          <Legend cls="bg-alert" label="Pas encore prêt" />
        </div>
      </Panel>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        {/* Le rythme du mois : seulement les clients qui demandent un geste ;
            le tableau complet est dans « Engagements du mois ». */}
        <Panel title={`Engagements · ${monthLabel(now)}`} action={{ href: "/avancement", label: "Tous les engagements" }}>
          {late.length === 0 ? (
            <Empty text={engages.length ? "Tous les clients sont dans le rythme du mois." : "Aucun client n'a d'engagement chiffré."} />
          ) : (
            <>
              <p className="mb-4 text-small text-ink-3">
                {late.length} client{late.length > 1 ? "s" : ""} en retard ou à risque sur {engages.length}. Barre foncée : publié · claire : projection · repère or : attendu aujourd&apos;hui.
              </p>
              <div className="flex flex-col gap-3">
                {late
                  .sort((a, b) => a.pace.gap - b.pace.gap)
                  .slice(0, 6)
                  .map((c) => (
                    <Link
                      key={c.id}
                      href={`/contacts/${c.id}?onglet=contrat`}
                      className="grid min-h-11 grid-cols-[28px_minmax(0,120px)_minmax(0,1fr)_auto] items-center gap-3 text-ink no-underline hover:no-underline"
                    >
                      <ClientChip name={c.shortName} size={28} />
                      <span className="clip text-base font-medium">{c.shortName}</span>
                      <PacingBar fillPct={c.pace.fillPct} projPct={c.pace.projPct} markerLeft={c.pace.markerLeft} fillClass={c.pace.key === "late" ? "bg-alert" : "bg-warn"} />
                      <span className="w-[60px] text-right text-small text-ink-2 tabular-nums">
                        {c.done} / {c.contentTarget}
                      </span>
                    </Link>
                  ))}
              </div>
            </>
          )}
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

      {/* Activité de l'équipe : en dernier, c'est du contexte. */}
      <Panel title="Activité de l'équipe" right={<Icon name="activity" size={18} className="text-ink-3" />} className="mt-5">
        {activity.length === 0 ? (
          <Empty text="Les actions de l'équipe apparaîtront ici." />
        ) : (
          <div className="grid gap-x-6 lg:grid-cols-2">
            {activity.map((a) => (
              <div key={a.id} className="flex gap-3 border-b border-line py-3">
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
  );
}

function Stat({ icon, value, label, href, tone }: { icon: "send" | "gauge" | "calendar"; value: string; label: string; href: string; tone?: "alert" }) {
  return (
    <Link href={href} className="flex min-h-11 items-center gap-3 rounded-full text-ink no-underline hover:no-underline">
      <span
        className={cn(
          "flex h-11 w-11 flex-none items-center justify-center rounded-full border shadow-soft",
          tone === "alert" ? "border-alert bg-alert text-white" : "border-line bg-paper text-ink",
        )}
      >
        <Icon name={icon} size={18} />
      </span>
      <span className="flex flex-col">
        <span className="text-[22px] leading-tight font-bold tracking-[-0.02em] tabular-nums">{value}</span>
        <span className="max-w-[200px] text-small leading-tight text-ink-3">{label}</span>
      </span>
    </Link>
  );
}


/** Direction : le revenu mensuel prélevé et l'objectif, une ligne qui mène à la page. */
function RevenuStat({ revenu }: { revenu: { montant: string; detail: string; pourcentage: number; ht: boolean } }) {
  return (
    <Link href="/revenu" className="flex min-h-11 items-center gap-3 rounded-full text-ink no-underline hover:no-underline" data-encart-revenu>
      <span
        className="flex h-11 w-11 flex-none items-center justify-center rounded-full border border-line bg-paper text-ink shadow-soft"
        style={{ background: `conic-gradient(var(--c-gold) ${Math.min(100, revenu.pourcentage) * 3.6}deg, var(--c-slot) 0deg)` }}
        aria-hidden
      >
        <span className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-paper">
          <Icon name="euro" size={16} />
        </span>
      </span>
      <span className="flex flex-col">
        <span className="text-[22px] leading-tight font-bold tracking-[-0.02em] tabular-nums">{revenu.montant}</span>
        <span className="max-w-[280px] text-small leading-tight text-ink-3">
          revenu mensuel{revenu.ht ? " HT" : ""} · {revenu.detail.split(" · ")[0]}
          <span className="block">{revenu.detail.split(" · ").slice(1).join(" · ")}</span>
        </span>
      </span>
    </Link>
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


