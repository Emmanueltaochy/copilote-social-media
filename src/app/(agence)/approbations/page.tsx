import Link from "next/link";
import { PageHeader } from "@/components/shell/Screen";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Eyebrow, StatusPill } from "@/components/ui/primitives";
import { requireStaff } from "@/lib/auth";
import { coversFor, listAwaitingApproval, listClientsWithPace } from "@/db/queries";
import { Cover } from "@/components/ui/Cover";
import { CONTENT_KIND, CONTENT_STATUS } from "@/data/content";
import { monthLabel } from "@/lib/pacing";
import { cn } from "@/lib/cn";
import { approveContent, requestChange } from "../contenu/actions";

const REASONS = ["Cadrage", "Texte", "Colorimétrie", "Hors marque"];

/** Au-delà de cinq jours d'attente, la validation devient un problème. */
const STALE_DAYS = 5;

export default async function ApprobationsPage() {
  await requireStaff();
  const [clients, rows] = await Promise.all([listClientsWithPace(), listAwaitingApproval()]);
  const covers = await coversFor(rows.map((r) => r.content.id));

  if (clients.length === 0 || rows.length === 0) {
    return (
      <>
        <PageHeader title="Approbations" sub={monthLabel()} />
        <EmptyState
          title="Rien à valider pour l'instant"
          actionLabel={clients.length === 0 ? "Ajouter un client" : "Nouveau contenu"}
          actionHref={clients.length === 0 ? "/clients" : "/contenu"}
        >
          Un contenu arrive ici dès qu&apos;il passe en révision interne ou en validation client.
          Valider le fait passer en « prêt à publier » ; demander une modification le renvoie en
          création et enregistre le motif.
        </EmptyState>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Approbations"
        sub={`${rows.length} ${rows.length > 1 ? "contenus en attente" : "contenu en attente"}`}
      />

      <div className="min-h-0 flex-1 overflow-auto px-5 pt-4 pb-6">
        <div className="mx-auto flex w-full max-w-[1000px] flex-col gap-4">
          {rows.map(({ content, clientName, waitingDays }) => {
            const days = waitingDays;
            const stale = days !== null && days >= STALE_DAYS;
            return (
              <Card key={content.id} className={cn("p-4", stale && "border-alert-line")}>
                <div className="flex items-start gap-4">
                  {/* Le visuel d'abord, et en grand : on ne valide pas un titre,
                      on valide ce que le client verra. */}
                  <Link href={`/contenu/${content.id}`} className="flex-none no-underline">
                    <Cover
                      asset={covers.get(content.id)}
                      ratio="4/5"
                      className="w-[200px]"
                      label="Visuel à rattacher"
                    />
                  </Link>

                  <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
                    <Eyebrow>
                      {clientName} · {CONTENT_KIND[content.kind] ?? content.kind}
                    </Eyebrow>
                    <Link
                      href={`/contenu/${content.id}`}
                      className="text-title font-semibold text-ink no-underline hover:underline"
                    >
                      {content.title}
                    </Link>
                    <span className={cn("text-small", stale ? "text-alert" : "text-ink-3")}>
                      {days === null
                        ? "Pas encore envoyé au client"
                        : days === 0
                          ? "Envoyé aujourd'hui"
                          : `En attente depuis ${days} jour${days > 1 ? "s" : ""}`}
                    </span>
                    {content.caption ? (
                      <p className="mt-2 line-clamp-3 text-base text-ink-2">{content.caption}</p>
                    ) : null}
                    {!covers.get(content.id) ? (
                      <p className="mt-2 text-small text-warn">
                        Aucun visuel rattaché : le client validera un titre sans voir ce qui sera
                        publié.
                      </p>
                    ) : null}
                  </div>

                  <StatusPill tone={CONTENT_STATUS[content.status].tone}>
                    {CONTENT_STATUS[content.status].label}
                  </StatusPill>
                </div>

                <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-line pt-4">
                  <form action={approveContent}>
                    <input type="hidden" name="id" value={content.id} />
                    <button
                      type="submit"
                      className="cursor-pointer rounded-control border border-ink bg-ink px-3 py-2 text-base font-medium text-paper hover:bg-black"
                    >
                      Valider
                    </button>
                  </form>

                  <form action={requestChange} className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="id" value={content.id} />
                    <label className="flex flex-col gap-1">
                      <span className="eyebrow text-ink-3">Motif</span>
                      <select
                        name="reason"
                        className="rounded-control border border-line bg-paper px-2 py-2 text-base outline-none focus:border-gold"
                      >
                        {REASONS.map((r) => (
                          <option key={r}>{r}</option>
                        ))}
                      </select>
                    </label>
                    <input
                      name="note"
                      placeholder="Précision (facultatif)"
                      className="w-[240px] rounded-control border border-line bg-paper px-3 py-2 text-base outline-none focus:border-gold"
                    />
                    <button
                      type="submit"
                      className="cursor-pointer rounded-control border border-line bg-paper px-3 py-2 text-base font-medium text-ink-2 hover:border-line-strong hover:text-ink"
                    >
                      Demander une modification
                    </button>
                  </form>
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </>
  );
}
