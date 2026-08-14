import Link from "next/link";
import { PageHeader } from "@/components/shell/Screen";
import { Card, CardHead } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PacingBar } from "@/components/ui/PacingBar";
import { Dot, StatusPill } from "@/components/ui/primitives";
import { Num, TableHead, TableRow, TableScroll, Th } from "@/components/ui/Table";
import { requireDepartment } from "@/lib/auth";
import { byUrgency, countMissedPublications, listAwaitingApproval, listClientsWithPace, listTodayQueue, listUpcomingShoots } from "@/db/queries";
import { cn } from "@/lib/cn";
import { monthLabel, monthProgressLabel } from "@/lib/pacing";
import { toneText } from "@/lib/tone";

const COLS = "190px minmax(80px,1fr) 132px 96px 136px";

export default async function CockpitPage() {
  await requireDepartment("social");
  const clients = await listClientsWithPace(new Date(), "social");

  if (clients.length === 0) {
    return (
      <>
        <PageHeader
          title="Cockpit agence"
          sub={`${monthLabel()} · ${monthProgressLabel()}`}
        />
        <EmptyState
          eyebrow="Premier pas"
          title="Aucun client pour l'instant"
          actionLabel="Ajouter un client"
          actionHref="/clients"
        >
          Le cockpit compare, pour chaque client, ce qui a été publié à ce qui aurait dû
          l&apos;être à cette date du mois. Commence par créer un client et son engagement
          mensuel : tout le reste en découle.
        </EmptyState>
      </>
    );
  }

  const [queue, approvals, shoots, missed] = await Promise.all([
    listTodayQueue(),
    listAwaitingApproval(),
    listUpcomingShoots(),
    countMissedPublications(),
  ]);

  const late = clients.filter((c) => c.pace.key === "late" || c.pace.key === "risk").length;
  const rows = byUrgency(clients);

  return (
    <>
      <PageHeader
        title="Cockpit agence"
        sub={`${monthLabel()} · ${monthProgressLabel()} · ${clients.length} ${clients.length > 1 ? "clients actifs" : "client actif"}`}
      />

      <div className="flex flex-none items-stretch overflow-x-auto border-b border-line bg-paper px-5">
        {[
          { n: late, label: late > 1 ? "clients en retard sur leur engagement" : "client en retard sur son engagement", tone: "alert" as const, href: "/avancement" },
          { n: missed, label: missed > 1 ? "contenus non publiés à l'heure prévue" : "contenu non publié à l'heure prévue", tone: "alert" as const, href: "/a-publier" },
          { n: approvals.length, label: "contenus en attente de validation", tone: "warn" as const, href: "/approbations" },
          { n: shoots.length, label: "tournages à venir", tone: "neutral" as const, href: "/tournages" },
        ].map((a) => (
          <Link
            key={a.label}
            href={a.href}
            className="mr-[18px] flex flex-none items-center gap-[10px] border-r border-line py-[10px] pr-[18px] no-underline hover:opacity-70 hover:no-underline"
          >
            <span className={cn("text-title leading-tight font-semibold tabular-nums", a.n > 0 ? toneText[a.tone] : "text-ink-3")}>
              {a.n}
            </span>
            <span className="max-w-[150px] text-small leading-tight text-ink-2">{a.label}</span>
          </Link>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-4 pt-4 pb-7 lg:px-5">
        <Card>
          <CardHead
            title="Pilotage des engagements · trié par urgence"
            meta="Le repère or marque le rythme attendu aujourd'hui"
          />
          <TableScroll min={740}>
          <TableHead cols={COLS} sticky>
            <Th>Client</Th>
            <Th>Avancement du mois</Th>
            <Th>Réalisé / attendu</Th>
            <Th align="right">Écart</Th>
            <Th align="right">État</Th>
          </TableHead>
          {rows.map((c) => (
            <TableRow key={c.id} cols={COLS}>
              <span className="flex min-w-0 items-center gap-2">
                <Dot tone={c.pace.tone} />
                <Link href={`/clients/${c.id}`} className="clip text-base font-medium text-ink no-underline hover:underline">
                  {c.shortName}
                </Link>
              </span>
              <PacingBar
                className="min-w-[60px]"
                fillPct={c.pace.fillPct}
                projPct={c.pace.projPct}
                markerLeft={c.pace.markerLeft}
              />
              <span className="text-base text-ink-2 tabular-nums">{c.pace.doneLabel}</span>
              <Num className={cn("font-medium", toneText[c.pace.tone])}>{c.pace.deltaLabel}</Num>
              <span className="flex justify-end">
                <StatusPill tone={c.pace.tone}>{c.pace.label}</StatusPill>
              </span>
            </TableRow>
          ))}
          </TableScroll>
          <div className="flex flex-wrap items-center justify-between gap-2 px-[14px] py-[10px]">
            <span className="text-small text-ink-3">
              Barre grise claire = projection au rythme actuel en fin de mois
            </span>
            <Link href="/clients" className="text-small font-medium">Gérer les clients</Link>
          </div>
        </Card>

        {queue.length > 0 ? (
          <Card className="mt-4">
            <CardHead title="À publier aujourd'hui" meta={`${queue.length}`} />
            {queue.map(({ content, clientName }) => (
              <TableRow key={content.id} cols="72px 1fr 160px">
                <span className="text-base font-medium tabular-nums">
                  {content.scheduledAt?.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                </span>
                <span className="clip text-base">{clientName} · {content.title}</span>
                <span className={cn("text-right text-small font-medium", content.publishedAt ? "text-ok" : "text-ink-2")}>
                  {content.publishedAt ? "Publié" : "À publier"}
                </span>
              </TableRow>
            ))}
          </Card>
        ) : null}
      </div>
    </>
  );
}
