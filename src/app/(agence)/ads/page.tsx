import { PageHeader } from "@/components/shell/Screen";
import { EmptyState } from "@/components/ui/EmptyState";
import { requireStaff } from "@/lib/auth";
import { listClientsWithPace } from "@/db/queries";
import { monthLabel } from "@/lib/pacing";

export default async function Page() {
  await requireStaff();
  const clients = await listClientsWithPace();

  return (
    <>
      <PageHeader title="Campagnes ads" sub={`${monthLabel()} · aucune campagne`} />
      <EmptyState
        title="Aucune campagne pour l&apos;instant"
        actionLabel={clients.length === 0 ? "Ajouter un client" : undefined}
        actionHref={clients.length === 0 ? "/clients" : undefined}
      >
        Une campagne se pilote au même repère que les contenus : la dépense attendue à ce jour du mois, comparée à la dépense réelle. Les chiffres se saisissent chaque semaine.
      </EmptyState>
    </>
  );
}
