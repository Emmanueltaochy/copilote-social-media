import { PageHeader } from "@/components/shell/Screen";
import { Card, CardHead, Kpi, KpiGrid } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PacingBar } from "@/components/ui/PacingBar";
import { Eyebrow, StatusPill } from "@/components/ui/primitives";
import { Num, TableHead, TableRow, TableScroll, Th } from "@/components/ui/Table";
import { requireDepartment } from "@/lib/auth";
import { byUrgency, listClientsWithPace } from "@/db/queries";
import { fr, monthLabel, monthProgressLabel } from "@/lib/pacing";
import { toneText } from "@/lib/tone";
import { cn } from "@/lib/cn";

const COLS = "minmax(180px,1fr) minmax(160px,1fr) 96px 96px 96px 120px";

export default async function AvancementPage() {
  await requireDepartment("social");
  const clients = byUrgency(await listClientsWithPace());
  const engaged = clients.filter((c) => c.contentTarget > 0);

  if (engaged.length === 0) {
    return (
      <>
        <PageHeader title="Suivi d'avancement" sub={`${monthLabel()} · ${monthProgressLabel()}`} />
        <EmptyState
          title="Aucun engagement à suivre"
          actionLabel="Ajouter un client"
          actionHref="/clients"
        >
          Cet écran compare, ligne par ligne, ce qui a été livré à ce qui aurait dû l&apos;être à
          cette date. Il faut au moins un client avec un nombre de contenus mensuel.
        </EmptyState>
      </>
    );
  }

  const totalTarget = engaged.reduce((n, c) => n + c.contentTarget, 0);
  const totalDone = engaged.reduce((n, c) => n + c.done, 0);
  const totalExpected = engaged.reduce((n, c) => n + c.pace.expected, 0);
  const behind = engaged.filter((c) => c.pace.key === "late" || c.pace.key === "risk").length;

  return (
    <>
      <PageHeader
        title="Suivi d'avancement"
        sub={`${monthLabel()} · ${monthProgressLabel()}`}
      />

      <div className="min-h-0 flex-1 overflow-auto px-4 pt-4 pb-6 lg:px-5">
        <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-4">
          <Card className="p-5">
            <Eyebrow>Tous engagements confondus</Eyebrow>
            <KpiGrid columns={4} className="mt-3">
              <Kpi label="Réalisé" value={`${totalDone} / ${totalTarget}`} meta="contenus publiés ce mois" />
              <Kpi label="Attendu à date" value={fr(totalExpected, 1)} meta="au rythme contractuel" />
              <Kpi
                label="Écart"
                value={fr(totalDone - totalExpected, 1)}
                valueTone={totalDone >= totalExpected ? "ok" : "warn"}
                meta="contenus"
              />
              <Kpi
                label="Comptes en difficulté"
                value={String(behind)}
                valueTone={behind > 0 ? "alert" : "ok"}
                meta={behind > 0 ? "à traiter en priorité" : "aucun retard"}
              />
            </KpiGrid>
          </Card>

          <Card>
            <CardHead
              title="Engagement client par client"
              meta="Le repère or marque le rythme attendu aujourd'hui"
            />
            <TableScroll min={780}>
            <TableHead cols={COLS} sticky>
              <Th>Client</Th>
              <Th>Avancement</Th>
              <Th align="right">Réalisé</Th>
              <Th align="right">Attendu</Th>
              <Th align="right">Écart</Th>
              <Th align="right">Fin de mois</Th>
            </TableHead>
            {engaged.map((c) => (
              <TableRow key={c.id} cols={COLS}>
                <span className="clip text-base font-medium">{c.shortName}</span>
                <PacingBar
                  fillPct={c.pace.fillPct}
                  projPct={c.pace.projPct}
                  markerLeft={c.pace.markerLeft}
                />
                <Num className="font-medium">{c.done}</Num>
                <Num className="text-ink-2">{fr(c.pace.expected, 1)}</Num>
                <Num className={cn("font-medium", toneText[c.pace.tone])}>{c.pace.deltaLabel}</Num>
                <span className="flex justify-end">
                  <StatusPill tone={c.pace.projected >= c.contentTarget ? "ok" : "warn"}>
                    {c.pace.projected} / {c.contentTarget}
                  </StatusPill>
                </span>
              </TableRow>
            ))}
            </TableScroll>
          </Card>
        </div>
      </div>
    </>
  );
}
