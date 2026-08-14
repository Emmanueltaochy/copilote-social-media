import Link from "next/link";
import { PageHeader } from "@/components/shell/Screen";
import { EmptyState } from "@/components/ui/EmptyState";
import { Eyebrow } from "@/components/ui/primitives";
import { Cover } from "@/components/ui/Cover";
import { requireDepartment } from "@/lib/auth";
import { coversFor, listClientsWithPace, listPipeline, listStaff } from "@/db/queries";
import { CONTENT_KIND, CONTENT_STAGES, CONTENT_STATUS } from "@/data/content";
import { monthLabel } from "@/lib/pacing";
import { moveStage } from "../contenu/actions";
import { AssignPicker } from "./AssignPicker";

export const dynamic = "force-dynamic";

export default async function ProductionPage() {
  await requireDepartment("social");
  const [clients, rows, staff] = await Promise.all([
    listClientsWithPace(new Date(), "social"),
    listPipeline(),
    listStaff(),
  ]);
  const covers = await coversFor(rows.map((r) => r.content.id));

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
      >
        <Link
          href="/contenu"
          className="rounded-control border border-ink bg-ink px-[11px] py-[7px] text-small font-medium text-paper no-underline hover:bg-black hover:no-underline"
        >
          Nouveau contenu
        </Link>
      </PageHeader>

      <div className="min-h-0 flex-1 overflow-auto px-4 pt-4 pb-5 lg:px-5">
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
                  {cards.map(({ content, clientName }) => {
                    const next = CONTENT_STAGES[CONTENT_STAGES.indexOf(stage) + 1];
                    return (
                      <div
                        key={content.id}
                        className="flex flex-col gap-[7px] rounded-card border border-line bg-paper p-[10px]"
                      >
                        <Link href={`/contenu/${content.id}`} className="no-underline">
                          <Cover
                            asset={covers.get(content.id)}
                            ratio="16/9"
                            label={CONTENT_STATUS[content.status].label}
                          />
                        </Link>
                        <span className="clip text-micro text-ink-3">
                          {clientName} · {CONTENT_KIND[content.kind] ?? content.kind}
                        </span>
                        <Link
                          href={`/contenu/${content.id}`}
                          className="text-base leading-tight font-medium text-ink no-underline hover:underline"
                        >
                          {content.title}
                        </Link>
                        <span className="flex items-center gap-2">
                          <span className="min-w-0 flex-1">
                            <AssignPicker
                              contentId={content.id}
                              ownerId={content.ownerId}
                              staff={staff}
                              compact
                            />
                          </span>
                          {content.scheduledAt ? (
                            <span className="flex-none text-small tabular-nums text-ink-2">
                              {content.scheduledAt.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}
                            </span>
                          ) : null}
                        </span>
                        {next ? (
                          <form action={moveStage}>
                            <input type="hidden" name="id" value={content.id} />
                            <input type="hidden" name="stage" value={next} />
                            <button
                              type="submit"
                              className="w-full cursor-pointer rounded-control border border-line bg-paper px-2 py-1 text-small font-medium text-ink-2 hover:border-line-strong hover:text-ink"
                            >
                              → {CONTENT_STATUS[next].label}
                            </button>
                          </form>
                        ) : null}
                      </div>
                    );
                  })}
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
