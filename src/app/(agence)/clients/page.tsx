import Link from "next/link";
import { PageHeader } from "@/components/shell/Screen";
import { Card, CardHead } from "@/components/ui/Card";
import { PacingBar } from "@/components/ui/PacingBar";
import { Dot, Eyebrow, StatusPill } from "@/components/ui/primitives";
import { Num, TableHead, TableRow, TableScroll, Th } from "@/components/ui/Table";
import { canSeeMoney, requireStaff } from "@/lib/auth";
import { polActif } from "@/lib/pole";
import { listClientsWithPace } from "@/db/queries";
import { recapWebParClient } from "@/db/web-queries";
import { euroFromCents, monthLabel } from "@/lib/pacing";
import { toneText } from "@/lib/tone";
import { cn } from "@/lib/cn";
import { ClientForm } from "./ClientForm";
import { createClient } from "./actions";

const COLS_MONEY = "minmax(180px,1fr) minmax(120px,1fr) 120px 120px 130px";
const COLS_PLAIN = "minmax(180px,1fr) minmax(120px,1fr) 120px 130px";
const WEB_MONEY = "minmax(180px,1fr) 120px 120px 130px 130px";
const WEB_PLAIN = "minmax(180px,1fr) 120px 130px";

export default async function ClientsPage() {
  const user = await requireStaff();
  const pole = await polActif(user);
  const clients = await listClientsWithPace(new Date(), pole);
  // Les forfaits ne regardent que la direction : la colonne disparaît pour
  // l'équipe plutôt que d'afficher un tiret qui laisserait deviner un montant.
  const money = canSeeMoney(user);
  // Le portefeuille ne se lit pas de la même façon des deux côtés. Le social se
  // juge au rythme du mois — d'où la barre d'avancement et l'écart. Le web se
  // juge à ses chantiers : combien sont ouverts, combien ils ont été vendus, ce
  // qui rentre chaque mois ensuite. Afficher une barre de contenus à un client
  // qui n'achète qu'un site montrerait un retard imaginaire.
  const web = pole === "web" ? await recapWebParClient() : null;

  const cols = web ? (money ? WEB_MONEY : WEB_PLAIN) : money ? COLS_MONEY : COLS_PLAIN;

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
              <CardHead
                title="Portefeuille"
                meta={
                  web
                    ? "Projets ouverts, montants vendus et abonnements en cours"
                    : "Le repère or marque le rythme attendu aujourd'hui"
                }
              />
              <TableScroll min={money ? 760 : 640}>
                {web ? (
                  <>
                    <TableHead cols={cols}>
                      <Th>Client</Th>
                      <Th align="right">Projets</Th>
                      {money ? <Th align="right">Vendu</Th> : null}
                      {money ? <Th align="right">Maintenance</Th> : null}
                      <Th align="right">État</Th>
                    </TableHead>
                    {clients.map((c) => {
                      const r = web.get(c.id);
                      const enCours = r?.enCours ?? 0;
                      const total = r?.total ?? 0;
                      // En régie, le montant n'est pas arrêté d'avance : c'est
                      // le temps passé, au tarif du client, qui le fait.
                      const enRegie = c.webBilling === "heure";
                      const montantCents = enRegie
                        ? Math.round(((r?.minutes ?? 0) / 60) * c.webHourlyRateCents)
                        : (r?.venduCents ?? 0);
                      return (
                        <TableRow key={c.id} cols={cols}>
                          <span className="flex min-w-0 items-center gap-2">
                            <Dot tone={enCours > 0 ? "info" : total > 0 ? "ok" : "muted"} />
                            <Link
                              href={`/clients/${c.id}`}
                              className="clip text-base font-medium text-ink no-underline hover:underline"
                            >
                              {c.shortName}
                            </Link>
                          </span>
                          <Num className="text-ink-2">{total > 0 ? `${enCours} / ${total}` : "—"}</Num>
                          {money ? (
                            <Num>
                              {montantCents > 0 ? euroFromCents(montantCents) : "—"}
                              {enRegie ? <span className="text-ink-3"> *</span> : null}
                            </Num>
                          ) : null}
                          {money ? (
                            <Num className="text-ink-2">
                              {c.webMaintenanceCents > 0
                                ? euroFromCents(c.webMaintenanceCents)
                                : "—"}
                            </Num>
                          ) : null}
                          <span className="flex justify-end">
                            {enCours > 0 ? (
                              <StatusPill tone="info">En chantier</StatusPill>
                            ) : total > 0 ? (
                              <StatusPill tone="ok">En ligne</StatusPill>
                            ) : (
                              <StatusPill tone="neutral">À lancer</StatusPill>
                            )}
                          </span>
                        </TableRow>
                      );
                    })}
                  </>
                ) : (
                  <>
                    <TableHead cols={cols}>
                      <Th>Client</Th>
                      <Th>Avancement du mois</Th>
                      {money ? <Th align="right">Forfait</Th> : null}
                      <Th align="right">Écart</Th>
                      <Th align="right">État</Th>
                    </TableHead>
                    {clients.map((c) => (
                      <TableRow key={c.id} cols={cols}>
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
                          <Num>
                            {c.monthlyFeeCents > 0 ? euroFromCents(c.monthlyFeeCents) : "—"}
                          </Num>
                        ) : null}
                        <Num className={cn("font-medium", toneText[c.pace.tone])}>
                          {c.pace.deltaLabel}
                        </Num>
                        <span className="flex justify-end">
                          <StatusPill tone={c.pace.tone}>{c.pace.label}</StatusPill>
                        </span>
                      </TableRow>
                    ))}
                  </>
                )}
              </TableScroll>
              {/* L'astérisque ne sert à rien si personne n'est en régie : la
                  note n'apparaît qu'au moment où elle explique quelque chose. */}
              {web && money && clients.some((c) => c.webBilling === "heure") ? (
                <p className="px-[14px] py-[10px] text-small text-ink-3">
                  * Facturé au temps passé : le montant est le cumul des heures saisies sous le
                  pôle web, au tarif horaire du client. Il bouge à chaque saisie.
                </p>
              ) : null}
            </Card>
          ) : null}

          <Card className="p-5">
            <div className="mb-4 flex flex-col gap-1">
              <Eyebrow>Nouveau client</Eyebrow>
              <h2 className="text-title font-semibold">Ajouter un compte</h2>
              <p className="text-base text-ink-2">
                {web
                  ? "Coche les pôles qui travaillent pour ce compte : le contrat n'a pas la même forme d'un côté et de l'autre, et les champs suivent. Le montant d'un site se saisit ensuite sur son projet."
                  : money
                    ? "Le forfait et le nombre de contenus définissent l'engagement du mois. Tout le pilotage en découle : sans eux, il n'y a pas de rythme à comparer."
                    : "Le nombre de contenus par mois définit l'engagement, et tout le pilotage en découle. Le forfait est renseigné par la direction."}
              </p>
            </div>
            {/* Le pôle actif est coché d'avance : on n'ouvre pas le tableau web
                pour y créer un client réseaux sociaux. */}
            <ClientForm
              action={createClient}
              submitLabel="Créer le client"
              showMoney={money}
              values={{ departments: [pole] }}
            />
          </Card>
        </div>
      </div>
    </>
  );
}
