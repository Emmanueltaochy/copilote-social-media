import Link from "next/link";
import { PageHeader } from "@/components/shell/Screen";
import { Card, CardHead } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusPill } from "@/components/ui/primitives";
import { requireDepartment } from "@/lib/auth";
import { listClientsWithPace } from "@/db/queries";
import { fr, monthLabel } from "@/lib/pacing";

export const dynamic = "force-dynamic";

/**
 * L'entrée des rapports mensuels : un client, un rapport.
 *
 * Le rapport lui-même vit sur sa propre page, en pleine largeur et sans la
 * coquille de l'application — c'est un document qu'on imprime et qu'on envoie,
 * pas un écran de pilotage.
 */
export default async function RapportsPage() {
  await requireDepartment("social");
  const clients = await listClientsWithPace();

  if (clients.length === 0) {
    return (
      <>
        <PageHeader title="Rapports" sub={monthLabel()} />
        <EmptyState title="Aucun rapport à produire" actionLabel="Ajouter un client" actionHref="/clients">
          Le rapport mensuel se construit à partir des contenus publiés, des statistiques saisies,
          des campagnes et des tournages du mois. Il faut d&apos;abord un client.
        </EmptyState>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Rapports" sub={`${monthLabel()} · ${clients.length} client${clients.length > 1 ? "s" : ""}`} />

      <div className="min-h-0 flex-1 overflow-auto px-4 pt-4 pb-6 lg:px-5">
        <div className="mx-auto flex w-full max-w-[900px] flex-col gap-4">
          <Card>
            <CardHead title={`Rapport de ${monthLabel()}`} meta={`${clients.length}`} />
            {clients.map((c) => (
              <Link
                key={c.id}
                href={`/rapports/${c.id}`}
                className="flex items-center gap-4 border-b border-line px-[14px] py-3 no-underline hover:bg-canvas hover:no-underline"
              >
                <span className="clip min-w-0 flex-1 text-lead font-medium text-ink">
                  {c.shortName}
                </span>
                <span className="w-[170px] flex-none text-right text-base tabular-nums text-ink-2">
                  {c.done} / {c.contentTarget} publiés
                </span>
                <span className="w-[130px] flex-none text-right text-small tabular-nums text-ink-3">
                  attendu {fr(c.pace.expected, 1)}
                </span>
                <StatusPill tone={c.pace.tone}>{c.pace.label}</StatusPill>
              </Link>
            ))}
            <p className="px-[14px] py-3 text-small text-ink-3">
              Le rapport s&apos;ouvre en document imprimable : la commande d&apos;impression du
              navigateur produit le PDF à envoyer au client. Les statistiques de chaque publication
              se saisissent depuis le rapport lui-même.
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}
