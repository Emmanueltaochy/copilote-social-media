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
      <PageHeader title="Planning tournages" sub={`${monthLabel()} · aucun tournage prévu`} />
      <EmptyState
        title="Aucun tournage planifié"
        actionLabel={clients.length === 0 ? "Ajouter un client" : undefined}
        actionHref={clients.length === 0 ? "/clients" : undefined}
      >
        Une fiche tournage rassemble le lieu, le créneau, l&apos;équipe, le matériel, la shotlist cochable et les autorisations de droit à l&apos;image.
      </EmptyState>
    </>
  );
}
