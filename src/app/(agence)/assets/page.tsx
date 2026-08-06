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
      <PageHeader title="Bibliothèque d'assets" sub={`${monthLabel()} · aucun média`} />
      <EmptyState
        title="Aucun média pour l&apos;instant"
        actionLabel={clients.length === 0 ? "Ajouter un client" : undefined}
        actionHref={clients.length === 0 ? "/clients" : undefined}
      >
        Les photos et vidéos issues des tournages se rangent ici, avec leurs droits d&apos;utilisation et la liste des contenus où elles ont déjà servi.
      </EmptyState>
    </>
  );
}
