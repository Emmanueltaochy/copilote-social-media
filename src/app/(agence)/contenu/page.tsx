import { PageHeader } from "@/components/shell/Screen";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Eyebrow } from "@/components/ui/primitives";
import { requireDepartment } from "@/lib/auth";
import { listClientOptions } from "@/db/queries";
import { ContentForm } from "./ContentForm";
import { createContent } from "./actions";

export default async function NouveauContenuPage() {
  await requireDepartment("social");
  const clients = await listClientOptions();

  if (clients.length === 0) {
    return (
      <>
        <PageHeader title="Nouveau contenu" sub="Un contenu appartient toujours à un client" />
        <EmptyState title="Aucun client" actionLabel="Ajouter un client" actionHref="/clients">
          Un contenu se rattache à un client : c&apos;est ce qui permet de le compter dans son
          engagement du mois.
        </EmptyState>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Nouveau contenu" sub="Il démarre à l'étape « Idée »" />
      <div className="min-h-0 flex-1 overflow-auto px-4 pt-4 pb-6 lg:px-5">
        <div className="mx-auto w-full max-w-[760px]">
          <Card className="p-5">
            <div className="mb-4">
              <Eyebrow>Créer</Eyebrow>
              <h2 className="text-title font-semibold">Nouveau contenu</h2>
            </div>
            <ContentForm action={createContent} clients={clients} submitLabel="Créer le contenu" />
          </Card>
        </div>
      </div>
    </>
  );
}
