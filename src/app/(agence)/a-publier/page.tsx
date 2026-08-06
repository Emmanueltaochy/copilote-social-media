import { PageHeader } from "@/components/shell/Screen";
import { Card, CardHead } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { TableRow } from "@/components/ui/Table";
import { requireStaff } from "@/lib/auth";
import { listClientsWithPace, listTodayQueue } from "@/db/queries";
import { cn } from "@/lib/cn";

export default async function APublierPage() {
  await requireStaff();
  const [clients, queue] = await Promise.all([listClientsWithPace(), listTodayQueue()]);

  const today = new Date().toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  if (clients.length === 0 || queue.length === 0) {
    return (
      <>
        <PageHeader title="À publier" sub={today} />
        <EmptyState
          title="Rien à publier aujourd'hui"
          actionLabel={clients.length === 0 ? "Ajouter un client" : undefined}
          actionHref={clients.length === 0 ? "/clients" : undefined}
        >
          Les contenus programmés pour aujourd&apos;hui apparaissent ici. Marquer un contenu comme
          publié demande le lien du post : c&apos;est ce qui rend la publication vérifiable, faute
          de connexion automatique aux réseaux.
        </EmptyState>
      </>
    );
  }

  const now = new Date();

  return (
    <>
      <PageHeader title="À publier" sub={`${today} · ${queue.length} contenus`} />
      <div className="min-h-0 flex-1 overflow-auto px-5 pt-4 pb-6">
        <div className="mx-auto w-full max-w-[1060px]">
          <Card>
            <CardHead title="File du jour" meta={`${queue.length}`} />
            {queue.map(({ content, clientName }) => {
              const overdue =
                !content.publishedAt && content.scheduledAt && content.scheduledAt < now;
              return (
                <TableRow
                  key={content.id}
                  cols="72px minmax(200px,1fr) 160px"
                  className={overdue ? "bg-alert-wash" : "bg-paper"}
                >
                  <span className="text-base font-medium tabular-nums">
                    {content.scheduledAt?.toLocaleTimeString("fr-FR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="clip text-base font-medium">{content.title}</span>
                    <span className="clip text-small text-ink-3">{clientName}</span>
                  </span>
                  <span
                    className={cn(
                      "text-right text-small font-medium",
                      content.publishedAt ? "text-ok" : overdue ? "text-alert" : "text-ink-2",
                    )}
                  >
                    {content.publishedAt ? "Publié" : overdue ? "En retard" : "Prêt"}
                  </span>
                </TableRow>
              );
            })}
          </Card>
        </div>
      </div>
    </>
  );
}
