import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell/Screen";
import { Card, CardHead, Kpi, KpiGrid } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/primitives";
import { PacingBar } from "@/components/ui/PacingBar";
import { requireStaff } from "@/lib/auth";
import { getClientWithPace, monthlyReport } from "@/db/queries";
import { euroFromCents, fr, monthLabel, monthProgressLabel } from "@/lib/pacing";
import { derive, money, percent, sumTotals, times } from "@/lib/ads";
import { SHOOT_STATUS, slotLabel } from "@/data/shoot";
import { PrintButton } from "./PrintButton";
import { saveStats } from "../actions";

export const dynamic = "force-dynamic";

const NETWORK: Record<string, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
  google: "Google",
};

/**
 * Le rapport mensuel d'un client.
 *
 * Il montre ce que le client a acheté et ce qu'il a reçu, dans cet ordre : le
 * rythme d'abord, les publications ensuite, puis ce qui a été produit autour
 * (tournages, médias) et enfin les campagnes. Aucun coût interne n'y figure —
 * c'est un document qui part chez le client.
 *
 * Les statistiques se saisissent directement dans le tableau : les relever
 * ailleurs puis les recopier ici est le meilleur moyen de ne jamais les
 * relever.
 */
export default async function RapportPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;

  const client = await getClientWithPace(id);
  if (!client) notFound();

  const { published, shoots, mediaCount, campaigns } = await monthlyReport(id);
  const { pace } = client;

  const measured = published.filter((p) => p.stats?.reach != null);
  const totalReach = measured.reduce((n, p) => n + (p.stats?.reach ?? 0), 0);
  const totalEngagement = measured.reduce((n, p) => n + (p.stats?.engagement ?? 0), 0);
  const engagementRate = totalReach > 0 ? totalEngagement / totalReach : null;

  const adTotals = sumTotals(campaigns);
  const adDerived = derive(adTotals);

  return (
    <>
      <PageHeader title={`Rapport · ${client.shortName}`} sub={`${monthLabel()} · ${monthProgressLabel()}`}>
        <PrintButton />
        <Link
          href="/rapports"
          className="print:hidden rounded-control border border-line bg-paper px-[11px] py-[7px] text-small font-medium text-ink-2 no-underline hover:border-line-strong hover:text-ink hover:no-underline"
        >
          Retour
        </Link>
      </PageHeader>

      <div className="min-h-0 flex-1 overflow-auto px-5 pt-4 pb-6 print:overflow-visible print:p-0">
        <div className="mx-auto flex w-full max-w-[900px] flex-col gap-4">
          {/* En-tête du document : visible seulement à l'impression, là où la
              barre latérale et le titre de l'écran n'existent plus. */}
          <div className="hidden print:mb-6 print:block">
            <span className="eyebrow text-ink-3">Taochy Consulting</span>
            <h1 className="text-display font-semibold">
              {client.name} · {monthLabel()}
            </h1>
          </div>

          <Card className="flex flex-col gap-4 p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <span className="text-title font-semibold">Le mois en un coup d&apos;œil</span>
              <StatusPill tone={pace.tone}>{pace.label}</StatusPill>
            </div>

            {client.contentTarget > 0 ? (
              <>
                <PacingBar
                  size="lg"
                  fillPct={pace.fillPct}
                  projPct={pace.projPct}
                  markerLeft={pace.markerLeft}
                  markerLabel={`Rythme prévu · ${fr(pace.expected, 1)}`}
                />
                <KpiGrid columns={4}>
                  <Kpi
                    label="Publiés"
                    value={`${client.done} / ${client.contentTarget}`}
                    meta="contenus du mois"
                  />
                  <Kpi label="Attendu à date" value={fr(pace.expected, 1)} meta="au rythme contractuel" />
                  <Kpi label="Écart" value={pace.deltaLabel} valueTone={pace.tone} meta={pace.diffLabel} />
                  <Kpi
                    label="Projection"
                    value={`${pace.projected} / ${client.contentTarget}`}
                    valueTone={pace.projected >= client.contentTarget ? "ok" : "warn"}
                    meta="en fin de mois"
                  />
                </KpiGrid>
              </>
            ) : (
              <p className="text-base text-ink-2">
                {client.done} contenu{client.done > 1 ? "s publiés" : " publié"} ce mois. Ce compte
                n&apos;a pas d&apos;engagement chiffré.
              </p>
            )}
          </Card>

          {measured.length > 0 ? (
            <KpiGrid columns={3}>
              <Kpi label="Portée cumulée" value={fr(totalReach)} meta={`${measured.length} publication${measured.length > 1 ? "s" : ""} mesurée${measured.length > 1 ? "s" : ""}`} />
              <Kpi label="Interactions" value={fr(totalEngagement)} meta="likes, commentaires, partages" />
              <Kpi
                label="Taux d'engagement"
                value={engagementRate !== null ? percent(engagementRate) : "—"}
                meta="interactions sur portée"
              />
            </KpiGrid>
          ) : null}

          <Card>
            <CardHead
              title="Publications du mois"
              meta={`${published.length}${
                published.length > measured.length
                  ? ` · ${published.length - measured.length} sans chiffres`
                  : ""
              }`}
            />
            {published.length === 0 ? (
              <p className="px-[14px] py-4 text-base text-ink-2">
                Aucune publication enregistrée ce mois. Une publication compte à partir du moment où
                elle est marquée publiée avec son lien.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] border-collapse">
                  <thead>
                    <tr className="border-b border-line">
                      {["Date", "Publication", "Réseau", "Portée", "Interactions", "Clics", "Enreg.", ""].map(
                        (h) => (
                          <th
                            key={h}
                            className="px-[10px] py-2 text-left text-micro font-semibold tracking-[0.08em] text-ink-3 uppercase"
                          >
                            {h}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {published.map(({ content, stats }) => (
                      <tr key={content.id} className="border-b border-line align-middle">
                        <td className="px-[10px] py-2 text-small tabular-nums whitespace-nowrap">
                          {content.publishedAt?.toLocaleDateString("fr-FR", {
                            day: "2-digit",
                            month: "short",
                          })}
                        </td>
                        <td className="max-w-[240px] px-[10px] py-2 text-small">
                          {content.publishedUrl ? (
                            <a
                              href={content.publishedUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="clip block font-medium text-ink no-underline hover:underline"
                            >
                              {content.title}
                            </a>
                          ) : (
                            <span className="clip block font-medium">{content.title}</span>
                          )}
                        </td>
                        <td className="px-[10px] py-2 text-small text-ink-2">
                          {NETWORK[content.network] ?? content.network}
                        </td>
                        {/* Les quatre champs forment un seul formulaire par ligne :
                            on saisit au clavier et on valide d'un Entrée. */}
                        <td colSpan={5} className="px-[10px] py-2">
                          <form action={saveStats} className="flex items-center gap-2">
                            <input type="hidden" name="contentId" value={content.id} />
                            {(
                              [
                                ["reach", stats?.reach],
                                ["engagement", stats?.engagement],
                                ["clicks", stats?.clicks],
                                ["saves", stats?.saves],
                              ] as const
                            ).map(([name, value]) => (
                              <input
                                key={name}
                                name={name}
                                inputMode="numeric"
                                defaultValue={value ?? ""}
                                placeholder="—"
                                className="w-[80px] rounded-control border border-line bg-paper px-2 py-1 text-small tabular-nums outline-none focus:border-gold print:border-none"
                              />
                            ))}
                            <button
                              type="submit"
                              className="print:hidden cursor-pointer rounded-control border border-line bg-paper px-2 py-1 text-micro font-medium text-ink-2 hover:border-line-strong hover:text-ink"
                            >
                              OK
                            </button>
                          </form>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="print:hidden px-[14px] py-3 text-small text-ink-3">
              Un champ laissé vide reste une valeur inconnue, pas un zéro : les moyennes ne sont
              calculées que sur les publications réellement mesurées.
            </p>
          </Card>

          {campaigns.length > 0 ? (
            <Card>
              <CardHead title="Campagnes publicitaires" meta={`${campaigns.length}`} />
              {campaigns.map((c) => {
                const cd = derive(c);
                return (
                  <div
                    key={c.campaign.id}
                    className="flex items-center gap-4 border-b border-line px-[14px] py-[10px]"
                  >
                    <span className="clip min-w-0 flex-1 text-base font-medium">
                      {c.campaign.name}
                    </span>
                    <span className="w-[100px] flex-none text-right text-base tabular-nums">
                      {euroFromCents(c.spendCents)}
                    </span>
                    <span className="w-[90px] flex-none text-right text-small tabular-nums text-ink-2">
                      {fr(c.leads)} lead{c.leads > 1 ? "s" : ""}
                    </span>
                    <span className="w-[90px] flex-none text-right text-small tabular-nums text-ink-2">
                      {money(cd.cplCents)}
                    </span>
                    <span className="w-[70px] flex-none text-right text-small tabular-nums text-ink-2">
                      {times(cd.roas)}
                    </span>
                  </div>
                );
              })}
              <div className="flex items-center gap-4 px-[14px] py-[10px]">
                <span className="min-w-0 flex-1 text-base font-medium">Total</span>
                <span className="w-[100px] flex-none text-right text-base font-medium tabular-nums">
                  {euroFromCents(adTotals.spendCents)}
                </span>
                <span className="w-[90px] flex-none text-right text-small tabular-nums">
                  {fr(adTotals.leads)} lead{adTotals.leads > 1 ? "s" : ""}
                </span>
                <span className="w-[90px] flex-none text-right text-small tabular-nums">
                  {money(adDerived.cplCents)}
                </span>
                <span className="w-[70px] flex-none text-right text-small tabular-nums">
                  {times(adDerived.roas)}
                </span>
              </div>
            </Card>
          ) : null}

          {shoots.length > 0 || mediaCount > 0 ? (
            <Card>
              <CardHead title="Production" meta={`${mediaCount} média${mediaCount > 1 ? "s" : ""}`} />
              {shoots.map((s) => (
                <div key={s.id} className="flex items-center gap-4 border-b border-line px-[14px] py-[10px]">
                  <span className="w-[190px] flex-none text-small tabular-nums text-ink-2">
                    {slotLabel(s.startsAt, s.endsAt)}
                  </span>
                  <span className="clip min-w-0 flex-1 text-base">{s.title}</span>
                  <StatusPill tone={SHOOT_STATUS[s.status].tone}>
                    {SHOOT_STATUS[s.status].label}
                  </StatusPill>
                </div>
              ))}
              <p className="px-[14px] py-3 text-base text-ink-2">
                {mediaCount === 0
                  ? "Aucun média ajouté à la bibliothèque ce mois."
                  : `${mediaCount} média${mediaCount > 1 ? "s ont été ajoutés" : " a été ajouté"} à votre bibliothèque ce mois. Ils sont consultables depuis votre portail.`}
              </p>
            </Card>
          ) : null}

        </div>
      </div>
    </>
  );
}
