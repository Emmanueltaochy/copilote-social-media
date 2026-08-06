import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/shell/Screen";
import { Card, CardHead, Kpi, KpiGrid } from "@/components/ui/Card";
import { PacingBar } from "@/components/ui/PacingBar";
import { Eyebrow, StatusPill } from "@/components/ui/primitives";
import { requireStaff, canSeeMoney } from "@/lib/auth";
import { getClientWithPace, listContractLines } from "@/db/queries";
import { euroFromCents, fr, monthLabel } from "@/lib/pacing";
import { ClientForm } from "../ClientForm";
import { archiveClient, updateClient } from "../actions";

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireStaff();
  const { id } = await params;

  const client = await getClientWithPace(id);
  if (!client) notFound();

  const lines = await listContractLines(id);
  const { pace } = client;

  return (
    <>
      <PageHeader
        title={client.shortName}
        sub={`${client.sector ?? "Secteur à renseigner"} · ${monthLabel()}`}
      />

      <div className="min-h-0 flex-1 overflow-auto px-5 pt-4 pb-6">
        <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-4">
          <Card className="flex flex-col gap-4 p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-[2px]">
                <Eyebrow>Engagement du mois</Eyebrow>
                <span className="text-display font-semibold tracking-[-0.01em]">
                  {client.name}
                </span>
              </div>
              <StatusPill tone={pace.tone}>{pace.label}</StatusPill>
            </div>

            {client.contentTarget > 0 ? (
              <>
                <PacingBar
                  size="lg"
                  fillPct={pace.fillPct}
                  projPct={pace.projPct}
                  markerLeft={pace.markerLeft}
                  markerLabel={`Attendu aujourd'hui · ${fr(pace.expected, 1)}`}
                />
                <KpiGrid columns={4}>
                  <Kpi label="Réalisé" value={`${client.done} / ${client.contentTarget}`} meta="contenus publiés" />
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
                Ce compte n&apos;a pas d&apos;engagement chiffré. Renseigne un nombre de contenus
                par mois pour activer le pilotage du rythme.
              </p>
            )}

            {canSeeMoney(user) ? (
              <div className="flex items-center gap-4 border-t border-line pt-3 text-base">
                <span className="text-ink-2">
                  Forfait{" "}
                  <strong className="font-medium text-ink">
                    {client.monthlyFeeCents > 0 ? euroFromCents(client.monthlyFeeCents) : "—"}
                  </strong>
                </span>
                <span className="text-ink-2">
                  Heures vendues{" "}
                  <strong className="font-medium text-ink">{client.hoursSold} h</strong>
                </span>
              </div>
            ) : null}
          </Card>

          <Card>
            <CardHead
              title="Décomposition de l'engagement"
              meta={lines.length ? `${lines.length} lignes` : undefined}
            />
            {lines.length === 0 ? (
              <p className="px-[14px] py-4 text-base text-ink-2">
                Aucune ligne pour l&apos;instant. La décomposition (posts feed, stories, reels…)
                permet de suivre l&apos;engagement type par type, et pas seulement en total.
              </p>
            ) : (
              lines.map((l) => (
                <div
                  key={l.id}
                  className="flex h-11 items-center justify-between border-b border-line px-[14px]"
                >
                  <span className="text-base">{l.label}</span>
                  <span className="text-base tabular-nums">{l.monthlyTarget} / mois</span>
                </div>
              ))
            )}
          </Card>

          <Card className="p-5">
            <div className="mb-4">
              <Eyebrow>Contrat</Eyebrow>
              <h2 className="text-title font-semibold">Modifier la fiche</h2>
            </div>
            <ClientForm
              action={updateClient}
              submitLabel="Enregistrer"
              values={{
                id: client.id,
                name: client.name,
                shortName: client.shortName,
                sector: client.sector ?? "",
                monthlyFee: Math.round(client.monthlyFeeCents / 100),
                contentTarget: client.contentTarget,
                shootsIncluded: client.shootsIncluded,
                hoursSold: client.hoursSold,
                adsBudgetLabel: client.adsBudgetLabel ?? "",
              }}
            />
          </Card>

          <Card className="flex items-center justify-between gap-4 p-5">
            <div>
              <h3 className="text-base font-medium">Archiver ce client</h3>
              <p className="text-small text-ink-2">
                Le compte disparaît des écrans de pilotage, mais son historique reste intact pour
                les rapports et la rentabilité des mois passés.
              </p>
            </div>
            <form action={archiveClient}>
              <input type="hidden" name="id" value={client.id} />
              <button
                type="submit"
                className="cursor-pointer rounded-control border border-line bg-paper px-3 py-2 text-base font-medium text-alert hover:border-alert"
              >
                Archiver
              </button>
            </form>
          </Card>

          <Link href="/clients" className="text-base">← Tous les clients</Link>
        </div>
      </div>
    </>
  );
}
