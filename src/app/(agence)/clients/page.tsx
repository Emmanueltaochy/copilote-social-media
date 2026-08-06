import Link from "next/link";
import { PageHeader } from "@/components/shell/Screen";
import { Card, CardHead } from "@/components/ui/Card";
import { PacingBar } from "@/components/ui/PacingBar";
import { Dot, Eyebrow, StatusPill } from "@/components/ui/primitives";
import { Num, TableHead, TableRow, Th } from "@/components/ui/Table";
import { requireStaff } from "@/lib/auth";
import { listClientsWithPace } from "@/db/queries";
import { euroFromCents, monthLabel } from "@/lib/pacing";
import { toneText } from "@/lib/tone";
import { cn } from "@/lib/cn";
import { ClientForm } from "./ClientForm";
import { createClient } from "./actions";

const COLS = "minmax(180px,1fr) minmax(120px,1fr) 120px 120px 130px";

export default async function ClientsPage() {
  await requireStaff();
  const clients = await listClientsWithPace();

  return (
    <>
      <PageHeader
        title="Clients"
        sub={`${monthLabel()} · ${clients.length} ${clients.length > 1 ? "comptes actifs" : "compte actif"}`}
      />

      <div className="min-h-0 flex-1 overflow-auto px-5 pt-4 pb-6">
        <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-4">
          {clients.length > 0 ? (
            <Card>
              <CardHead title="Portefeuille" meta="Le repère or marque le rythme attendu aujourd'hui" />
              <TableHead cols={COLS}>
                <Th>Client</Th>
                <Th>Avancement du mois</Th>
                <Th align="right">Forfait</Th>
                <Th align="right">Écart</Th>
                <Th align="right">État</Th>
              </TableHead>
              {clients.map((c) => (
                <TableRow key={c.id} cols={COLS}>
                  <span className="flex min-w-0 items-center gap-2">
                    <Dot tone={c.pace.tone} />
                    <Link
                      href={`/clients/${c.id}`}
                      className="clip text-base font-medium text-ink no-underline hover:underline"
                    >
                      {c.shortName}
                    </Link>
                  </span>
                  <PacingBar
                    fillPct={c.pace.fillPct}
                    projPct={c.pace.projPct}
                    markerLeft={c.pace.markerLeft}
                  />
                  <Num>{c.monthlyFeeCents > 0 ? euroFromCents(c.monthlyFeeCents) : "—"}</Num>
                  <Num className={cn("font-medium", toneText[c.pace.tone])}>
                    {c.pace.deltaLabel}
                  </Num>
                  <span className="flex justify-end">
                    <StatusPill tone={c.pace.tone}>{c.pace.label}</StatusPill>
                  </span>
                </TableRow>
              ))}
            </Card>
          ) : null}

          <Card className="p-5">
            <div className="mb-4 flex flex-col gap-1">
              <Eyebrow>Nouveau client</Eyebrow>
              <h2 className="text-title font-semibold">Ajouter un compte</h2>
              <p className="text-base text-ink-2">
                Le forfait et le nombre de contenus définissent l&apos;engagement du mois. Tout le
                pilotage en découle : sans eux, il n&apos;y a pas de rythme à comparer.
              </p>
            </div>
            <ClientForm action={createClient} submitLabel="Créer le client" />
          </Card>
        </div>
      </div>
    </>
  );
}
