import Link from "next/link";
import { PageHeader } from "@/components/shell/Screen";
import { Card, CardHead } from "@/components/ui/Card";
import { PacingBar } from "@/components/ui/PacingBar";
import { Dot, Eyebrow, StatusPill } from "@/components/ui/primitives";
import { Num, TableHead, TableRow, TableScroll, Th } from "@/components/ui/Table";
import { canSeeMoney, requireStaff } from "@/lib/auth";
import { listClientsWithPace } from "@/db/queries";
import { euroFromCents, monthLabel } from "@/lib/pacing";
import { toneText } from "@/lib/tone";
import { cn } from "@/lib/cn";
import { ClientForm } from "./ClientForm";
import { createClient } from "./actions";

const COLS_MONEY = "minmax(180px,1fr) minmax(120px,1fr) 120px 120px 130px";
const COLS_PLAIN = "minmax(180px,1fr) minmax(120px,1fr) 120px 130px";

export default async function ClientsPage() {
  const user = await requireStaff();
  const clients = await listClientsWithPace();
  // Les forfaits ne regardent que la direction : la colonne disparaît pour
  // l'équipe plutôt que d'afficher un tiret qui laisserait deviner un montant.
  const money = canSeeMoney(user);

  return (
    <>
      <PageHeader
        title="Clients"
        sub={`${monthLabel()} · ${clients.length} ${clients.length > 1 ? "comptes actifs" : "compte actif"}`}
      />

      <div className="min-h-0 flex-1 overflow-auto px-4 pt-4 pb-6 lg:px-5">
        <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-4">
          {clients.length > 0 ? (
            <Card>
              <CardHead title="Portefeuille" meta="Le repère or marque le rythme attendu aujourd'hui" />
              <TableScroll min={money ? 760 : 640}>
              <TableHead cols={money ? COLS_MONEY : COLS_PLAIN}>
                <Th>Client</Th>
                <Th>Avancement du mois</Th>
                {money ? <Th align="right">Forfait</Th> : null}
                <Th align="right">Écart</Th>
                <Th align="right">État</Th>
              </TableHead>
              {clients.map((c) => (
                <TableRow key={c.id} cols={money ? COLS_MONEY : COLS_PLAIN}>
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
                  {money ? (
                    <Num>{c.monthlyFeeCents > 0 ? euroFromCents(c.monthlyFeeCents) : "—"}</Num>
                  ) : null}
                  <Num className={cn("font-medium", toneText[c.pace.tone])}>
                    {c.pace.deltaLabel}
                  </Num>
                  <span className="flex justify-end">
                    <StatusPill tone={c.pace.tone}>{c.pace.label}</StatusPill>
                  </span>
                </TableRow>
              ))}
              </TableScroll>
            </Card>
          ) : null}

          <Card className="p-5">
            <div className="mb-4 flex flex-col gap-1">
              <Eyebrow>Nouveau client</Eyebrow>
              <h2 className="text-title font-semibold">Ajouter un compte</h2>
              <p className="text-base text-ink-2">
                {money
                  ? "Le forfait et le nombre de contenus définissent l'engagement du mois. Tout le pilotage en découle : sans eux, il n'y a pas de rythme à comparer."
                  : "Le nombre de contenus par mois définit l'engagement, et tout le pilotage en découle. Le forfait est renseigné par la direction."}
              </p>
            </div>
            <ClientForm action={createClient} submitLabel="Créer le client" showMoney={money} />
          </Card>
        </div>
      </div>
    </>
  );
}
