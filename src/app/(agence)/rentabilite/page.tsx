import { PageHeader } from "@/components/shell/Screen";
import { Card, CardHead, Kpi, KpiGrid } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Num, TableHead, TableRow, Th } from "@/components/ui/Table";
import { Eyebrow } from "@/components/ui/primitives";
import { requireDirection } from "@/lib/auth";
import { costByClient, listClientsWithPace, listRates } from "@/db/queries";
import { euroFromCents, fr, monthLabel, monthProgressLabel } from "@/lib/pacing";
import { formatDuration } from "@/lib/duration";
import { setRate } from "./actions";

export const dynamic = "force-dynamic";

const COLS = "minmax(160px,1fr) 110px 110px 110px 110px 110px 110px";

/**
 * La rentabilité réelle : forfait vendu moins coût des heures passées.
 *
 * Le coût vient des saisies de l'équipe valorisées au tarif horaire en vigueur
 * la semaine de la saisie. Tant que les heures ne sont pas saisies ou que les
 * tarifs ne sont pas posés, l'écran le dit au lieu d'afficher une marge égale
 * au forfait — ce qui serait à la fois faux et flatteur.
 */
export default async function RentabilitePage() {
  // Coûts internes et marges : direction uniquement.
  await requireDirection();

  const [clients, costs, rates] = await Promise.all([
    listClientsWithPace(),
    costByClient(),
    listRates(),
  ]);
  const byClient = new Map(costs.map((c) => [c.clientId, c]));

  if (clients.length === 0) {
    return (
      <>
        <PageHeader title="Rentabilité" sub={monthLabel()} />
        <EmptyState title="Rien à mesurer" actionLabel="Ajouter un client" actionHref="/clients">
          La rentabilité compare les heures passées au forfait vendu. Il faut des clients, leurs
          forfaits, et des heures saisies.
        </EmptyState>
      </>
    );
  }

  const billed = clients.filter((c) => c.monthlyFeeCents > 0);
  const totalFee = billed.reduce((n, c) => n + c.monthlyFeeCents, 0);
  const totalCost = costs.reduce((n, c) => n + c.costCents, 0);
  const totalMinutes = costs.reduce((n, c) => n + c.minutes, 0);
  const totalMargin = totalFee - totalCost;

  const ratesSet = rates.filter((r) => r.costPerHourCents !== null).length;
  const hoursEntered = totalMinutes > 0;

  return (
    <>
      <PageHeader
        title="Rentabilité"
        sub={`${monthLabel()} · ${billed.length} compte${billed.length > 1 ? "s" : ""} facturé${
          billed.length > 1 ? "s" : ""
        } · ${monthProgressLabel()}`}
      />

      <div className="min-h-0 flex-1 overflow-auto px-5 pt-4 pb-6">
        <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-4">
          {!hoursEntered || ratesSet === 0 ? (
            <Card className="border-warn bg-warn-bg px-5 py-4">
              <Eyebrow tone="warn">Chiffres incomplets</Eyebrow>
              <p className="mt-1 text-lead text-warn">
                {!hoursEntered
                  ? "Aucune heure n'a été saisie ce mois."
                  : "Aucun tarif horaire n'est renseigné."}{" "}
                La marge affichée est donc égale au forfait — c&apos;est faux, et flatteur.
                {!hoursEntered
                  ? " L'équipe saisit ses heures depuis « Mes heures »."
                  : " Les tarifs se posent en bas de cet écran."}
              </p>
            </Card>
          ) : null}

          <KpiGrid columns={4}>
            <Kpi label="Facturé ce mois" value={euroFromCents(totalFee)} meta="forfaits actifs" />
            <Kpi
              label="Coût des heures"
              value={euroFromCents(totalCost)}
              meta={formatDuration(totalMinutes)}
            />
            <Kpi
              label="Marge brute"
              value={euroFromCents(totalMargin)}
              valueTone={totalMargin < 0 ? "alert" : "ok"}
              meta={
                totalFee > 0
                  ? `${fr((totalMargin / totalFee) * 100, 0)} % du facturé`
                  : "aucun forfait"
              }
            />
            <Kpi
              label="Coût horaire moyen"
              value={totalMinutes > 0 ? euroFromCents(Math.round((totalCost * 60) / totalMinutes)) : "—"}
              meta="toutes personnes confondues"
            />
          </KpiGrid>

          <Card>
            <CardHead title="Par client" meta={`${clients.length}`} />
            <TableHead cols={COLS} sticky>
              <Th>Client</Th>
              <Th align="right">Forfait</Th>
              <Th align="right">H. vendues</Th>
              <Th align="right">H. passées</Th>
              <Th align="right">Reste</Th>
              <Th align="right">Coût</Th>
              <Th align="right">Marge</Th>
            </TableHead>
            {clients.map((c) => {
              const row = byClient.get(c.id);
              const minutes = row?.minutes ?? 0;
              const costCents = row?.costCents ?? 0;
              const spentHours = minutes / 60;
              const left = c.hoursSold - spentHours;
              const margin = c.monthlyFeeCents - costCents;
              const marginRatio = c.monthlyFeeCents > 0 ? margin / c.monthlyFeeCents : null;

              return (
                <TableRow key={c.id} cols={COLS}>
                  <span className="clip text-base font-medium">{c.shortName}</span>
                  <Num>{c.monthlyFeeCents > 0 ? euroFromCents(c.monthlyFeeCents) : "Interne"}</Num>
                  <Num className="text-ink-2">{c.hoursSold > 0 ? `${c.hoursSold} h` : "—"}</Num>
                  <Num>{minutes > 0 ? formatDuration(minutes) : "—"}</Num>
                  <Num
                    className={
                      c.hoursSold === 0 ? "text-ink-3" : left < 0 ? "font-medium text-alert" : "text-ink-2"
                    }
                  >
                    {c.hoursSold === 0 ? "—" : `${fr(left, 1)} h`}
                  </Num>
                  <Num className="text-ink-2">{costCents > 0 ? euroFromCents(costCents) : "—"}</Num>
                  <Num
                    className={
                      c.monthlyFeeCents === 0
                        ? "text-ink-3"
                        : margin < 0
                          ? "font-medium text-alert"
                          : marginRatio !== null && marginRatio < 0.3
                            ? "text-warn"
                            : "text-ok"
                    }
                  >
                    {c.monthlyFeeCents === 0 ? "—" : euroFromCents(margin)}
                  </Num>
                </TableRow>
              );
            })}
            <div className="px-[14px] py-[10px]">
              <span className="text-small text-ink-3">
                « Reste » compare les heures passées aux heures vendues : négatif, le compte
                consomme plus que ce qu&apos;il a acheté. La marge en dessous de 30 % du forfait
                passe en orange, négative en rouge.
              </span>
            </div>
          </Card>

          <Card>
            <CardHead
              title="Coût horaire de l'équipe"
              meta={`${ratesSet} / ${rates.length} renseignés`}
            />
            {rates.map((r) => (
              <form
                key={r.userId}
                action={setRate}
                className="flex items-center gap-3 border-b border-line px-[14px] py-[10px]"
              >
                <input type="hidden" name="userId" value={r.userId} />
                <span className="clip min-w-0 flex-1 text-base font-medium">{r.name}</span>
                <span className="w-[90px] flex-none text-small text-ink-3">
                  {r.role === "direction" ? "Direction" : "Équipe"}
                </span>
                <label className="flex items-center gap-2">
                  <span className="text-small text-ink-3">€ / heure</span>
                  <input
                    name="rate"
                    inputMode="decimal"
                    defaultValue={r.costPerHourCents !== null ? r.costPerHourCents / 100 : ""}
                    placeholder="35"
                    className="w-[90px] rounded-control border border-line bg-paper px-2 py-1 text-base tabular-nums outline-none focus:border-gold"
                  />
                </label>
                <label className="flex items-center gap-2">
                  <span className="text-small text-ink-3">à partir du</span>
                  <input
                    type="date"
                    name="effectiveFrom"
                    defaultValue={new Date().toISOString().slice(0, 10)}
                    className="rounded-control border border-line bg-paper px-2 py-1 text-small outline-none focus:border-gold"
                  />
                </label>
                <button
                  type="submit"
                  className="flex-none cursor-pointer rounded-control border border-line bg-paper px-[10px] py-1 text-small font-medium text-ink-2 hover:border-line-strong hover:text-ink"
                >
                  Enregistrer
                </button>
              </form>
            ))}
            <p className="px-[14px] py-3 text-small text-ink-3">
              Le tarif est historisé : une augmentation vaut à partir de sa date et ne réécrit pas
              la marge des mois déjà clos. C&apos;est un coût de revient interne — salaire chargé
              rapporté aux heures travaillées — pas un taux de facturation.
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}
