import Link from "next/link";
import { PageHeader } from "@/components/shell/Screen";
import { Card, CardHead } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { requireStaff } from "@/lib/auth";
import { listClientsWithPace, listTodayQueue } from "@/db/queries";
import { NETWORK_LABEL } from "@/data/content";
import { cn } from "@/lib/cn";
import { markPublished } from "../contenu/actions";

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
          actionLabel={clients.length === 0 ? "Ajouter un client" : "Nouveau contenu"}
          actionHref={clients.length === 0 ? "/clients" : "/contenu"}
        >
          Les contenus programmés pour aujourd&apos;hui apparaissent ici. Marquer un contenu comme
          publié demande le lien du post : c&apos;est ce qui rend la publication vérifiable, faute
          de connexion automatique aux réseaux.
        </EmptyState>
      </>
    );
  }

  const now = new Date();
  const done = queue.filter((q) => q.content.publishedAt).length;
  const late = queue.filter(
    (q) => !q.content.publishedAt && q.content.scheduledAt && q.content.scheduledAt < now,
  ).length;
  const ahead = queue.length - done - late;

  return (
    <>
      <PageHeader
        title="À publier"
        sub={`${today} · ${done} publié${done > 1 ? "s" : ""} · ${late} en retard · ${ahead} à venir`}
      />

      <div className="min-h-0 flex-1 overflow-auto px-4 pt-4 pb-6 lg:px-5">
        <div className="mx-auto w-full max-w-[1060px]">
          <Card>
            <CardHead title="File du jour" meta={`${queue.length}`} />
            {queue.map(({ content, clientName }) => {
              const overdue =
                !content.publishedAt && content.scheduledAt && content.scheduledAt < now;
              return (
                <div
                  key={content.id}
                  className={cn(
                    "grid items-center gap-3 border-b border-line px-[14px] py-3",
                    overdue ? "bg-alert-wash" : "bg-paper",
                  )}
                  style={{ gridTemplateColumns: "72px minmax(200px,1fr) 120px minmax(280px,1fr)" }}
                >
                  <span
                    className={cn(
                      "text-base font-medium tabular-nums",
                      overdue ? "text-alert" : content.publishedAt ? "text-ink-3" : "text-ink",
                    )}
                  >
                    {content.scheduledAt?.toLocaleTimeString("fr-FR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>

                  <span className="flex min-w-0 flex-col">
                    <Link
                      href={`/contenu/${content.id}`}
                      className="clip text-base font-medium text-ink no-underline hover:underline"
                    >
                      {content.title}
                    </Link>
                    <span className="clip text-small text-ink-3">
                      {clientName} · {NETWORK_LABEL[content.network]}
                    </span>
                  </span>

                  <span
                    className={cn(
                      "text-small font-medium",
                      content.publishedAt ? "text-ok" : overdue ? "text-alert" : "text-ink-2",
                    )}
                  >
                    {content.publishedAt ? "Publié" : overdue ? "En retard" : "Prêt"}
                  </span>

                  <span className="flex justify-end">
                    {content.publishedAt ? (
                      content.publishedUrl ? (
                        <a href={content.publishedUrl} target="_blank" rel="noreferrer" className="text-small">
                          Voir le post
                        </a>
                      ) : null
                    ) : (
                      <form action={markPublished} className="flex w-full items-center gap-2">
                        <input type="hidden" name="id" value={content.id} />
                        <input
                          name="url"
                          type="url"
                          required
                          placeholder="Coller le lien du post publié…"
                          className="min-w-0 flex-1 rounded-control border border-line bg-paper px-2 py-[6px] text-small outline-none focus:border-gold"
                        />
                        <button
                          type="submit"
                          className={cn(
                            "flex-none cursor-pointer rounded-control border px-[10px] py-[6px] text-small font-medium",
                            overdue
                              ? "border-ink bg-ink text-paper hover:bg-black"
                              : "border-line bg-paper text-ink-2 hover:border-line-strong hover:text-ink",
                          )}
                        >
                          Publié
                        </button>
                      </form>
                    )}
                  </span>
                </div>
              );
            })}
            <p className="px-[14px] py-3 text-small text-ink-3">
              Le lien est enregistré avec l&apos;heure et l&apos;auteur. C&apos;est cette
              publication qui compte dans l&apos;engagement du mois du client.
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}
