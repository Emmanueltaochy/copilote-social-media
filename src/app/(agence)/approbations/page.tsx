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
      <PageHeader title="Approbations" sub={`${monthLabel()} · aucun contenu en attente`} />
      <EmptyState
        title="Rien à valider pour l&apos;instant"
        actionLabel={clients.length === 0 ? "Ajouter un client" : undefined}
        actionHref={clients.length === 0 ? "/clients" : undefined}
      >
        Les contenus arrivent ici dès qu&apos;ils passent en révision interne ou en validation client. Chaque visuel peut être annoté par pastille, et chaque version comparée à la précédente.
      </EmptyState>
    </>
  );
}
