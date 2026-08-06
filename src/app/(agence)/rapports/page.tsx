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
      <PageHeader title="Rapports" sub={`${monthLabel()} · aucun rapport`} />
      <EmptyState
        title="Aucun rapport à produire"
        actionLabel={clients.length === 0 ? "Ajouter un client" : undefined}
        actionHref={clients.length === 0 ? "/clients" : undefined}
      >
        Le rapport mensuel se construit à partir des contenus publiés et des statistiques saisies. Il faut d&apos;abord un client et des contenus.
      </EmptyState>
    </>
  );
}
