import Link from "next/link";
import { PageHeader } from "@/components/shell/Screen";
import { Card, CardHead } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Eyebrow, StatusPill } from "@/components/ui/primitives";
import { PacingBar } from "@/components/ui/PacingBar";
import { requireStaff } from "@/lib/auth";
import { listCampaignsWithTotals, listClientOptions } from "@/db/queries";
import { euroFromCents, monthLabel, monthProgressLabel } from "@/lib/pacing";
import { budgetPace, CAMPAIGN_STATUS, derive, money, times } from "@/lib/ads";
import { toneText } from "@/lib/tone";
import { CampaignForm } from "./CampaignForm";

export const dynamic = "force-dynamic";

/**
 * Les campagnes, lues au même repère que le reste du produit : la part du mois
 * écoulée. Le budget est une ressource qui se consomme dans le temps, comme
 * l'engagement en contenus — seule la lecture de l'écart change de sens.
 */
export default async function AdsPage() {
  await requireStaff();
  const [clients, rows] = await Promise.all([listClientOptions(), listCampaignsWithTotals()]);

  if (clients.length === 0) {
    return (
      <>
        <PageHeader title="Campagnes ads" sub={monthLabel()} />
        <EmptyState title="Aucun client" actionLabel="Ajouter un client" actionHref="/clients">
          Une campagne se rattache à un client : c&apos;est ce qui permet de la comparer à son
          budget et de la faire apparaître dans son rapport mensuel.
        </EmptyState>
      </>
    );
  }

  const active = rows.filter((r) => r.campaign.status === "active");
  const budgetTotal = active.reduce((n, r) => n + r.campaign.budgetCents, 0);
  const spentTotal = active.reduce((n, r) => n + r.spendCents, 0);
  const alerts = active.filter((r) => {
    const p = budgetPace(r.spendCents, r.campaign.budgetCents);
    return p.tone === "alert" || p.tone === "warn";
  }).length;

  return (
    <>
      <PageHeader
        title="Campagnes ads"
        sub={
          rows.length === 0
            ? monthLabel()
            : `${active.length} active${active.length > 1 ? "s" : ""} · ${
                alerts === 0 ? "aucune alerte" : `${alerts} alerte${alerts > 1 ? "s" : ""}`
              } · budget ${euroFromCents(budgetTotal)} ce mois`
        }
      />

      <div className="min-h-0 flex-1 overflow-auto px-4 pt-4 pb-6 lg:px-5">
        <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-4">
          <Card className="flex flex-col gap-4 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <Eyebrow>Nouvelle campagne</Eyebrow>
              <span className="text-small text-ink-3">{monthProgressLabel()}</span>
            </div>
            <CampaignForm clients={clients} />
          </Card>

          {active.length > 0 ? (
            <Card className="flex flex-col gap-3 p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <span className="text-title font-semibold">Dépense du mois, toutes campagnes</span>
                <span className="text-base text-ink-2 tabular-nums">
                  {euroFromCents(spentTotal)} sur {euroFromCents(budgetTotal)}
                </span>
              </div>
              <PacingBar
                size="lg"
                fillPct={budgetPace(spentTotal, budgetTotal).fillPct}
                markerLeft={budgetPace(spentTotal, budgetTotal).markerLeft}
                markerLabel={`Rythme du mois · ${euroFromCents(
                  Math.round(budgetPace(spentTotal, budgetTotal).expectedCents),
                )}`}
              />
              <p className="text-small text-ink-3">
                Le repère or marque la part du mois écoulée. Dépasser à gauche veut dire que le
                budget s&apos;éteindra avant la fin du mois ; rester loin derrière veut dire
                qu&apos;il est payé sans travailler.
              </p>
            </Card>
          ) : null}

          {rows.length === 0 ? (
            <Card className="p-5">
              <p className="text-base text-ink-2">
                Aucune campagne pour l&apos;instant. Les chiffres se saisissent chaque semaine, à la
                main : une intégration en panne donne des chiffres faux sans le dire, et
                l&apos;agence relève de toute façon déjà ces nombres pour son reporting.
              </p>
            </Card>
          ) : (
            <Card>
              <CardHead title="Campagnes" meta={`${rows.length}`} />
              {rows.map((r) => {
                const p = budgetPace(r.spendCents, r.campaign.budgetCents);
                const d = derive(r);
                const status = CAMPAIGN_STATUS[r.campaign.status];
                const cplOff =
                  r.campaign.targetCplCents && d.cplCents
                    ? d.cplCents > r.campaign.targetCplCents
                    : false;
                return (
                  <Link
                    key={r.campaign.id}
                    href={`/ads/${r.campaign.id}`}
                    className="flex flex-col gap-2 border-b border-line px-[14px] py-3 no-underline hover:bg-canvas hover:no-underline"
                  >
                    <span className="flex items-center gap-4">
                      <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
                        <span className="clip text-micro text-ink-3">
                          {r.clientName} · {r.campaign.platform}
                        </span>
                        <span className="clip text-lead font-medium text-ink">
                          {r.campaign.name}
                        </span>
                      </span>

                      <span className="w-[110px] flex-none text-right text-base tabular-nums text-ink">
                        {euroFromCents(r.spendCents)}
                      </span>
                      <span className="w-[90px] flex-none text-right text-small tabular-nums text-ink-3">
                        {r.leads} lead{r.leads > 1 ? "s" : ""}
                      </span>
                      <span
                        className={`w-[90px] flex-none text-right text-small tabular-nums ${
                          cplOff ? "text-warn" : "text-ink-2"
                        }`}
                      >
                        {money(d.cplCents)}
                      </span>
                      <span className="w-[70px] flex-none text-right text-small tabular-nums text-ink-2">
                        {times(d.roas)}
                      </span>
                      <StatusPill tone={status.tone}>{status.label}</StatusPill>
                    </span>

                    {r.campaign.budgetCents > 0 ? (
                      <span className="flex items-center gap-3">
                        <span className="min-w-0 flex-1">
                          <PacingBar
                            fillPct={p.fillPct}
                            markerLeft={p.markerLeft}
                          />
                        </span>
                        <span className={`w-[200px] flex-none text-small ${toneText[p.tone]}`}>
                          {p.label}
                        </span>
                      </span>
                    ) : (
                      <span className="text-small text-ink-3">
                        Pas de budget mensuel renseigné : le rythme de dépense ne peut pas être
                        comparé.
                      </span>
                    )}
                  </Link>
                );
              })}
              <p className="px-[14px] py-3 text-small text-ink-3">
                Colonnes : dépense du mois, leads, coût par lead, retour sur dépense.
              </p>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
