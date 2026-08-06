import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell/Screen";
import { Card, CardHead, Kpi, KpiGrid } from "@/components/ui/Card";
import { Eyebrow, StatusPill } from "@/components/ui/primitives";
import { PacingBar } from "@/components/ui/PacingBar";
import { requireStaff } from "@/lib/auth";
import { getCampaign } from "@/db/queries";
import { euroFromCents, fr, monthRange } from "@/lib/pacing";
import {
  budgetPace,
  CAMPAIGN_STATUS,
  CAMPAIGN_STATUSES,
  derive,
  money,
  mondayOf,
  percent,
  sumTotals,
  times,
  weekLabel,
} from "@/lib/ads";
import { toneText } from "@/lib/tone";
import { MetricsForm } from "./MetricsForm";
import { addAdSet, deleteCampaign, removeAdSet, removeMetrics, updateCampaign } from "../actions";

export const dynamic = "force-dynamic";

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;

  const data = await getCampaign(id);
  if (!data) notFound();

  const { campaign, client, sets, metrics } = data;
  const status = CAMPAIGN_STATUS[campaign.status];
  const setName = new Map(sets.map((s) => [s.id, s.name]));

  const { start, end } = monthRange();
  const from = start.toISOString().slice(0, 10);
  const to = end.toISOString().slice(0, 10);

  const monthRows = metrics.filter((m) => m.metric.weekStart >= from && m.metric.weekStart < to);
  const monthTotals = sumTotals(monthRows.map((m) => m.metric));
  const d = derive(monthTotals);
  const p = budgetPace(monthTotals.spendCents, campaign.budgetCents);

  // Comparaison avec la période précédente : un CPL de 14 € ne dit rien seul,
  // il dit quelque chose face aux 11 € de la semaine d'avant.
  const weeks = [...new Set(metrics.map((m) => m.metric.weekStart))].sort().reverse();
  const lastWeek = weeks[0];
  const prevWeek = weeks[1];
  const lastTotals = sumTotals(metrics.filter((m) => m.metric.weekStart === lastWeek).map((m) => m.metric));
  const prevTotals = sumTotals(metrics.filter((m) => m.metric.weekStart === prevWeek).map((m) => m.metric));
  const lastD = derive(lastTotals);
  const prevD = derive(prevTotals);

  const trend = (now: number | null, before: number | null, lowerIsBetter: boolean) => {
    if (now === null || before === null || before === 0) return null;
    const delta = (now - before) / before;
    const good = lowerIsBetter ? delta < 0 : delta > 0;
    return {
      label: `${delta >= 0 ? "+" : "−"}${fr(Math.abs(delta) * 100, 0)} %`,
      tone: Math.abs(delta) < 0.05 ? ("muted" as const) : good ? ("ok" as const) : ("warn" as const),
    };
  };

  const cplTrend = trend(lastD.cplCents, prevD.cplCents, true);
  const roasTrend = trend(lastD.roas, prevD.roas, false);

  const cplOff =
    campaign.targetCplCents && d.cplCents ? d.cplCents > campaign.targetCplCents : false;

  return (
    <>
      <PageHeader
        title={campaign.name}
        sub={`${client.shortName} · ${campaign.platform}${
          campaign.budgetCents > 0 ? ` · ${euroFromCents(campaign.budgetCents)} par mois` : ""
        }`}
      >
        <StatusPill tone={status.tone}>{status.label}</StatusPill>
        <Link
          href="/ads"
          className="rounded-control border border-line bg-paper px-[11px] py-[7px] text-small font-medium text-ink-2 no-underline hover:border-line-strong hover:text-ink hover:no-underline"
        >
          Retour aux campagnes
        </Link>
      </PageHeader>

      <div className="min-h-0 flex-1 overflow-auto px-5 pt-4 pb-6">
        <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-4">
          {campaign.budgetCents > 0 ? (
            <Card className="flex flex-col gap-3 p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <span className="text-title font-semibold">Rythme de dépense</span>
                <span className={`text-base ${toneText[p.tone]}`}>{p.label}</span>
              </div>
              <PacingBar
                size="lg"
                fillPct={p.fillPct}
                markerLeft={p.markerLeft}
                markerLabel={`Attendu à ce jour · ${euroFromCents(Math.round(p.expectedCents))}`}
              />
              <span className="text-base text-ink-2 tabular-nums">{p.detail}</span>
              <span className="text-small text-ink-3">
                Au rythme actuel, la campagne aura dépensé {euroFromCents(p.projectedCents)} en fin
                de mois.
              </span>
            </Card>
          ) : (
            <Card className="p-5">
              <p className="text-base text-ink-2">
                Aucun budget mensuel renseigné : sans lui, la dépense ne peut pas être comparée à un
                rythme attendu. Il se saisit plus bas.
              </p>
            </Card>
          )}

          <KpiGrid columns={4}>
            <Kpi
              label="Dépense du mois"
              value={euroFromCents(monthTotals.spendCents)}
              meta={`${monthRows.length} semaine${monthRows.length > 1 ? "s" : ""} saisie${
                monthRows.length > 1 ? "s" : ""
              }`}
            />
            <Kpi
              label="Coût par lead"
              value={money(d.cplCents)}
              valueTone={cplOff ? "warn" : "ink"}
              meta={
                campaign.targetCplCents
                  ? `objectif ${money(campaign.targetCplCents)}`
                  : `${monthTotals.leads} lead${monthTotals.leads > 1 ? "s" : ""}`
              }
            />
            <Kpi
              label="Coût par vente"
              value={money(d.cpaCents)}
              meta={`${monthTotals.conversions} vente${monthTotals.conversions > 1 ? "s" : ""}`}
            />
            <Kpi
              label="Retour sur dépense"
              value={times(d.roas)}
              valueTone={d.roas !== null && d.roas >= 1 ? "ok" : d.roas !== null ? "warn" : "ink"}
              meta={`${euroFromCents(monthTotals.revenueCents)} générés`}
            />
          </KpiGrid>

          <KpiGrid columns={3}>
            <Kpi label="Impressions" value={fr(monthTotals.impressions)} meta={`CPM ${money(d.cpmCents)}`} />
            <Kpi label="Clics" value={fr(monthTotals.clicks)} meta={`CPC ${money(d.cpcCents)}`} />
            <Kpi label="Taux de clic" value={percent(d.ctr)} meta="clics sur impressions" />
          </KpiGrid>

          {prevWeek ? (
            <Card className="flex flex-wrap items-center gap-6 p-5">
              <div className="flex flex-col gap-[2px]">
                <Eyebrow>Dernière semaine</Eyebrow>
                <span className="text-base text-ink-2">
                  {weekLabel(lastWeek)} contre {weekLabel(prevWeek)}
                </span>
              </div>
              <div className="flex flex-col gap-[2px]">
                <span className="eyebrow text-ink-3">Coût par lead</span>
                <span className="text-lead tabular-nums">
                  {money(lastD.cplCents)}{" "}
                  {cplTrend ? (
                    <span className={`text-base ${toneText[cplTrend.tone]}`}>{cplTrend.label}</span>
                  ) : null}
                </span>
              </div>
              <div className="flex flex-col gap-[2px]">
                <span className="eyebrow text-ink-3">Retour sur dépense</span>
                <span className="text-lead tabular-nums">
                  {times(lastD.roas)}{" "}
                  {roasTrend ? (
                    <span className={`text-base ${toneText[roasTrend.tone]}`}>{roasTrend.label}</span>
                  ) : null}
                </span>
              </div>
            </Card>
          ) : null}

          <Card>
            <CardHead title="Ensembles de publicités" meta={`${sets.length}`} />
            {sets.length === 0 ? (
              <p className="px-[14px] py-4 text-base text-ink-2">
                Aucun ensemble. Les chiffres se saisissent par ensemble : c&apos;est le niveau où
                une audience se compare à une autre, et où l&apos;on décide de couper ou de
                réallouer.
              </p>
            ) : (
              sets.map((s) => {
                const t = sumTotals(
                  monthRows.filter((m) => m.metric.adSetId === s.id).map((m) => m.metric),
                );
                const sd = derive(t);
                return (
                  <div
                    key={s.id}
                    className="flex items-center gap-4 border-b border-line px-[14px] py-[10px]"
                  >
                    <span className="clip min-w-0 flex-1 text-base font-medium">{s.name}</span>
                    <span className="w-[100px] flex-none text-right text-base tabular-nums">
                      {euroFromCents(t.spendCents)}
                    </span>
                    <span className="w-[80px] flex-none text-right text-small tabular-nums text-ink-3">
                      {t.leads} lead{t.leads > 1 ? "s" : ""}
                    </span>
                    <span className="w-[90px] flex-none text-right text-small tabular-nums text-ink-2">
                      {money(sd.cplCents)}
                    </span>
                    <form action={removeAdSet} className="flex-none">
                      <input type="hidden" name="id" value={s.id} />
                      <input type="hidden" name="campaignId" value={campaign.id} />
                      <button
                        type="submit"
                        title="Retirer"
                        className="cursor-pointer rounded-control border border-line bg-paper px-[6px] py-[2px] text-micro text-ink-3 hover:border-alert hover:text-alert"
                      >
                        ✕
                      </button>
                    </form>
                  </div>
                );
              })
            )}
            <form action={addAdSet} className="flex flex-wrap items-center gap-2 px-[14px] py-3">
              <input type="hidden" name="campaignId" value={campaign.id} />
              <input
                name="name"
                required
                placeholder="Audience large · 25-54 ans"
                className="min-w-0 flex-1 rounded-control border border-line bg-paper px-2 py-[6px] text-small outline-none focus:border-gold"
              />
              <button
                type="submit"
                className="cursor-pointer rounded-control border border-line bg-paper px-[10px] py-[6px] text-small font-medium text-ink-2 hover:border-line-strong hover:text-ink"
              >
                Ajouter un ensemble
              </button>
            </form>
          </Card>

          {sets.length > 0 ? (
            <Card className="flex flex-col gap-4 p-5">
              <div>
                <Eyebrow>Saisie hebdomadaire</Eyebrow>
                <h2 className="text-title font-semibold">Relever les chiffres de la semaine</h2>
                <p className="mt-1 text-base text-ink-2">
                  Six nombres suffisent : tout le reste — CPC, CPL, coût par vente, retour sur
                  dépense — s&apos;en déduit. Ressaisir une semaine déjà enregistrée la corrige au
                  lieu d&apos;en créer une seconde.
                </p>
              </div>
              <MetricsForm campaignId={campaign.id} sets={sets} defaultWeek={mondayOf()} />
            </Card>
          ) : null}

          {metrics.length > 0 ? (
            <Card>
              <CardHead title="Historique des saisies" meta={`${metrics.length}`} />
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] border-collapse">
                  <thead>
                    <tr className="border-b border-line">
                      {["Semaine", "Ensemble", "Dépense", "Impr.", "Clics", "Leads", "Ventes", "CA", "CPL", ""].map(
                        (h) => (
                          <th
                            key={h}
                            className="px-[10px] py-2 text-left text-micro font-semibold tracking-[0.08em] text-ink-3 uppercase last:w-8"
                          >
                            {h}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.map(({ metric: m, capturedByName }) => {
                      const md = derive(m);
                      return (
                        <tr key={`${m.adSetId}-${m.weekStart}`} className="border-b border-line">
                          <td className="px-[10px] py-2 text-small tabular-nums">
                            {weekLabel(m.weekStart)}
                          </td>
                          <td className="clip max-w-[180px] px-[10px] py-2 text-small text-ink-2">
                            {setName.get(m.adSetId) ?? "—"}
                          </td>
                          <td className="px-[10px] py-2 text-small tabular-nums">
                            {euroFromCents(m.spendCents)}
                          </td>
                          <td className="px-[10px] py-2 text-small tabular-nums text-ink-2">
                            {fr(m.impressions)}
                          </td>
                          <td className="px-[10px] py-2 text-small tabular-nums text-ink-2">
                            {fr(m.clicks)}
                          </td>
                          <td className="px-[10px] py-2 text-small tabular-nums">{fr(m.leads)}</td>
                          <td className="px-[10px] py-2 text-small tabular-nums">
                            {fr(m.conversions)}
                          </td>
                          <td className="px-[10px] py-2 text-small tabular-nums text-ink-2">
                            {euroFromCents(m.revenueCents)}
                          </td>
                          <td className="px-[10px] py-2 text-small tabular-nums">
                            {money(md.cplCents)}
                          </td>
                          <td className="px-[10px] py-2">
                            <form action={removeMetrics}>
                              <input type="hidden" name="adSetId" value={m.adSetId} />
                              <input type="hidden" name="weekStart" value={m.weekStart} />
                              <input type="hidden" name="campaignId" value={campaign.id} />
                              <button
                                type="submit"
                                title={`Supprimer la saisie${capturedByName ? ` de ${capturedByName}` : ""}`}
                                className="cursor-pointer rounded-control border border-line bg-paper px-[6px] py-[2px] text-micro text-ink-3 hover:border-alert hover:text-alert"
                              >
                                ✕
                              </button>
                            </form>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : null}

          <Card className="flex flex-col gap-4 p-5">
            <div>
              <Eyebrow>Réglages</Eyebrow>
              <h2 className="text-title font-semibold">Budget, objectif et état</h2>
            </div>
            <form action={updateCampaign} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="id" value={campaign.id} />
              <label className="flex flex-col gap-[6px]">
                <span className="eyebrow text-ink-3">État</span>
                <select
                  name="status"
                  defaultValue={campaign.status}
                  className="rounded-control border border-line bg-paper px-3 py-2 text-base outline-none focus:border-gold"
                >
                  {CAMPAIGN_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {CAMPAIGN_STATUS[s].label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-[6px]">
                <span className="eyebrow text-ink-3">Régie</span>
                <input
                  name="platform"
                  defaultValue={campaign.platform}
                  className="rounded-control border border-line bg-paper px-3 py-2 text-base outline-none focus:border-gold"
                />
              </label>
              <label className="flex w-[150px] flex-col gap-[6px]">
                <span className="eyebrow text-ink-3">Budget / mois (€)</span>
                <input
                  name="budget"
                  inputMode="decimal"
                  defaultValue={campaign.budgetCents ? campaign.budgetCents / 100 : ""}
                  className="rounded-control border border-line bg-paper px-3 py-2 text-base tabular-nums outline-none focus:border-gold"
                />
              </label>
              <label className="flex w-[150px] flex-col gap-[6px]">
                <span className="eyebrow text-ink-3">CPL visé (€)</span>
                <input
                  name="targetCpl"
                  inputMode="decimal"
                  defaultValue={campaign.targetCplCents ? campaign.targetCplCents / 100 : ""}
                  className="rounded-control border border-line bg-paper px-3 py-2 text-base tabular-nums outline-none focus:border-gold"
                />
              </label>
              <button
                type="submit"
                className="cursor-pointer rounded-control border border-ink bg-ink px-3 py-2 text-base font-medium text-paper hover:bg-black"
              >
                Enregistrer
              </button>
            </form>
          </Card>

          <Card className="flex items-center justify-between gap-4 p-5">
            <p className="text-base text-ink-2">
              Supprimer la campagne efface aussi ses ensembles et toutes les saisies
              hebdomadaires. Pour une campagne terminée, préférer l&apos;état « Arrêtée » :
              l&apos;historique reste dans les rapports.
            </p>
            <form action={deleteCampaign}>
              <input type="hidden" name="id" value={campaign.id} />
              <button
                type="submit"
                className="flex-none cursor-pointer rounded-control border border-line bg-paper px-3 py-2 text-base text-ink-3 hover:border-alert hover:text-alert"
              >
                Supprimer
              </button>
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}
