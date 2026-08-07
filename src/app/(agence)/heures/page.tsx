import { PageHeader } from "@/components/shell/Screen";
import { Card, CardHead } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Eyebrow } from "@/components/ui/primitives";
import { requireStaff } from "@/lib/auth";
import { listClientOptions, listTimeEntries } from "@/db/queries";
import { monthLabel } from "@/lib/pacing";
import { formatDuration } from "@/lib/duration";
import { mondayOf, weekLabel } from "@/lib/ads";
import { HoursForm } from "./HoursForm";
import { removeHours } from "./actions";

export const dynamic = "force-dynamic";

/**
 * La saisie des heures.
 *
 * C'est la seule source du coût interne : sans elle, la marge affichée dans
 * l'écran de rentabilité serait une fiction. L'écran est donc ouvert à toute
 * l'équipe — chacun saisit les siennes — alors que la rentabilité, qui montre
 * des coûts et des marges, reste à la direction.
 */
export default async function HeuresPage() {
  const user = await requireStaff();
  const [clients, entries] = await Promise.all([listClientOptions(), listTimeEntries(user.id)]);

  if (clients.length === 0) {
    return (
      <>
        <PageHeader title="Mes heures" sub={monthLabel()} />
        <EmptyState title="Aucun client" actionLabel="Ajouter un client" actionHref="/clients">
          Une heure se rattache à un client : c&apos;est ce qui permet de comparer le temps passé
          au forfait vendu.
        </EmptyState>
      </>
    );
  }

  const totalMinutes = entries.reduce((n, e) => n + e.entry.minutes, 0);

  // Regroupé par semaine, du plus récent au plus ancien : c'est la maille de
  // saisie, et celle à laquelle on se souvient de ce qu'on a fait.
  const weeks = new Map<string, typeof entries>();
  for (const e of entries) {
    weeks.set(e.entry.weekStart, [...(weeks.get(e.entry.weekStart) ?? []), e]);
  }

  return (
    <>
      <PageHeader
        title="Mes heures"
        sub={`${monthLabel()} · ${formatDuration(totalMinutes)} saisies ce mois`}
      />

      <div className="min-h-0 flex-1 overflow-auto px-4 pt-4 pb-6 lg:px-5">
        <div className="mx-auto flex w-full max-w-[900px] flex-col gap-4">
          <Card className="flex flex-col gap-4 p-4">
            <div>
              <Eyebrow>Nouvelle saisie</Eyebrow>
              <p className="mt-1 text-base text-ink-2">
                La durée s&apos;écrit comme on la dit : <strong>3</strong>, <strong>3,5</strong>,{" "}
                <strong>3h30</strong> ou <strong>45min</strong>.
              </p>
            </div>
            <HoursForm clients={clients} defaultWeek={mondayOf()} />
          </Card>

          {entries.length === 0 ? (
            <Card className="p-5">
              <p className="text-base text-ink-2">
                Aucune heure saisie ce mois. Tant qu&apos;elles ne le sont pas, la rentabilité
                affiche un coût nul — et une marge sans coût ne veut rien dire.
              </p>
            </Card>
          ) : (
            [...weeks].map(([week, rows]) => {
              const minutes = rows.reduce((n, e) => n + e.entry.minutes, 0);
              return (
                <Card key={week}>
                  <CardHead
                    title={weekLabel(week)}
                    meta={formatDuration(minutes)}
                  />
                  {rows.map(({ entry, clientName }) => (
                    <div
                      key={entry.id}
                      className="flex items-center gap-4 border-b border-line px-[14px] py-[10px]"
                    >
                      <span className="clip w-[160px] flex-none text-base font-medium">
                        {clientName}
                      </span>
                      <span className="clip min-w-0 flex-1 text-base text-ink-2">
                        {entry.activity ?? "—"}
                      </span>
                      <span className="w-[90px] flex-none text-right text-base tabular-nums">
                        {formatDuration(entry.minutes)}
                      </span>
                      <form action={removeHours} className="flex-none">
                        <input type="hidden" name="id" value={entry.id} />
                        <button
                          type="submit"
                          title="Retirer cette saisie"
                          className="cursor-pointer rounded-control border border-line bg-paper px-[6px] py-[2px] text-micro text-ink-3 hover:border-alert hover:text-alert"
                        >
                          ✕
                        </button>
                      </form>
                    </div>
                  ))}
                </Card>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}
