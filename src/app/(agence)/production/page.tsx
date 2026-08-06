import { PageHeader } from "@/components/shell/Screen";
import { EmptyState } from "@/components/ui/EmptyState";
import { Eyebrow, StatusPill } from "@/components/ui/primitives";
import { requireStaff } from "@/lib/auth";
import { listClientsWithPace, listPipeline } from "@/db/queries";
import { CONTENT_STAGES, CONTENT_STATUS } from "@/data/content";
import { monthLabel } from "@/lib/pacing";

export default async function ProductionPage() {
  await requireStaff();
  const [clients, rows] = await Promise.all([listClientsWithPace(), listPipeline()]);

  if (clients.length === 0) {
    return (
      <>
        <PageHeader title="Pipeline de production" sub={monthLabel()} />
        <EmptyState title="Aucun contenu en production" actionLabel="Ajouter un client" actionHref="/clients">
          Le pipeline suit chaque contenu de l&apos;idée à la publication, en neuf étapes. Il faut
          d&apos;abord un client à qui rattacher les contenus.
        </EmptyState>
      </>
    );
  }

  const inProgress = rows.filter((r) => r.content.status !== "publie");

  return (
    <>
      <PageHeader
        title="Pipeline de production"
        sub={`${monthLabel()} · ${inProgress.length} ${inProgress.length > 1 ? "contenus en cours" : "contenu en cours"} · 9 étapes`}
      />

      <div className="min-h-0 flex-1 overflow-auto px-5 pt-4 pb-5">
        <div className="flex h-full min-w-max items-start gap-3">
          {CONTENT_STAGES.map((stage) => {
            const cards = rows.filter((r) => r.content.status === stage);
            return (
              <div
                key={stage}
                className="flex max-h-full w-[264px] flex-none flex-col rounded-card border border-line bg-paper"
              >
                <div className="flex flex-none items-center justify-between gap-2 border-b border-line px-3 py-[10px]">
                  <Eyebrow tone="ink">{CONTENT_STATUS[stage].label}</Eyebrow>
                  <span className="text-small text-ink-3 tabular-nums">{cards.length}</span>
                </div>
                <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto p-2">
                  {cards.map(({ content, clientName, ownerName }) => (
                    <div
                      key={content.id}
                      className="flex flex-col gap-[7px] rounded-card border border-line bg-paper p-[10px]"
                    >
                      <span className="clip text-micro text-ink-3">{clientName}</span>
                      <span className="text-base leading-tight font-medium">{content.title}</span>
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-small text-ink-2">{ownerName ?? "Non assigné"}</span>
                        {content.dueAt ? (
                          <span className="text-small tabular-nums text-ink-2">
                            {content.dueAt.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}
                          </span>
                        ) : null}
                      </span>
                      <StatusPill tone={CONTENT_STATUS[content.status].tone} className="self-start">
                        {CONTENT_STATUS[content.status].label}
                      </StatusPill>
                    </div>
                  ))}
                  {cards.length === 0 ? (
                    <p className="rounded-card border border-dashed border-line p-3 text-small leading-snug text-ink-3">
                      Aucun contenu à cette étape.
                    </p>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
