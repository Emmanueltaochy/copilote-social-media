import { PageHeader } from "@/components/shell/Screen";
import { Card, CardHead } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Num, TableHead, TableRow, Th } from "@/components/ui/Table";
import { requireDirection } from "@/lib/auth";
import { hoursByClient, listClientsWithPace } from "@/db/queries";
import { euroFromCents, monthLabel } from "@/lib/pacing";

const COLS = "minmax(180px,1fr) 120px 120px 120px 120px";

export default async function RentabilitePage() {
  // Coûts internes et marges : direction uniquement.
  await requireDirection();

  const [clients, hours] = await Promise.all([listClientsWithPace(), hoursByClient()]);
  const minutesByClient = new Map(hours.map((h) => [h.clientId, h.minutes]));

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

  return (
    <>
      <PageHeader
        title="Rentabilité"
        sub={`${monthLabel()} · ${billed.length} comptes facturés`}
      />

      <div className="min-h-0 flex-1 overflow-auto px-5 pt-4 pb-6">
        <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-4">
          <Card>
            <CardHead
              title="Heures consommées contre forfait vendu"
              meta={`Facturé ce mois : ${euroFromCents(totalFee)}`}
            />
            <TableHead cols={COLS} sticky>
              <Th>Client</Th>
              <Th align="right">Forfait</Th>
              <Th align="right">Heures vendues</Th>
              <Th align="right">Heures passées</Th>
              <Th align="right">Reste</Th>
            </TableHead>
            {clients.map((c) => {
              const spent = Math.round((minutesByClient.get(c.id) ?? 0) / 60);
              const left = c.hoursSold - spent;
              return (
                <TableRow key={c.id} cols={COLS}>
                  <span className="clip text-base font-medium">{c.shortName}</span>
                  <Num>{c.monthlyFeeCents > 0 ? euroFromCents(c.monthlyFeeCents) : "Interne"}</Num>
                  <Num className="text-ink-2">{c.hoursSold} h</Num>
                  <Num>{spent} h</Num>
                  <Num className={left < 0 ? "text-alert font-medium" : "text-ink-2"}>
                    {left < 0 ? `${left} h` : `${left} h`}
                  </Num>
                </TableRow>
              );
            })}
            <div className="px-[14px] py-[10px]">
              <span className="text-small text-ink-3">
                Les heures passées viennent des saisies hebdomadaires. Tant qu&apos;elles ne sont
                pas renseignées, la colonne reste à zéro — une marge calculée sans elles serait une
                fiction.
              </span>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
