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
      <PageHeader title="Contenu" sub={`${monthLabel()} · aucun contenu sélectionné`} />
      <EmptyState
        title="Aucun contenu ouvert"
        actionLabel={clients.length === 0 ? "Ajouter un client" : undefined}
        actionHref={clients.length === 0 ? "/clients" : undefined}
      >
        Cet écran affiche un contenu en détail : aperçu par réseau, légende, assets attachés, fil de commentaires et historique des versions.
      </EmptyState>
    </>
  );
}
