import Link from "next/link";
import { PageHeader } from "@/components/shell/Screen";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Dot, Eyebrow } from "@/components/ui/primitives";
import { requireDepartment } from "@/lib/auth";
import { listClientOptions } from "@/db/queries";
import { listWebProjects } from "@/db/web-queries";
import { PROJECT_TYPE, WEB_PHASE, WEB_PHASES, phaseSuivante } from "@/data/web";
import { euroFromCents } from "@/lib/pacing";
import { updateProject } from "./actions";
import { ProjectForm } from "./ProjectForm";

export const dynamic = "force-dynamic";

/**
 * Le tableau des projets web.
 *
 * Même lecture que le pipeline social : des colonnes d'étape, et sur chaque
 * carte ce qui bloque. La différence tient à ce qui bloque — un projet web
 * s'enlise presque toujours du côté du client, sur les textes, les photos ou
 * une validation qui ne vient pas. La carte le dit donc en premier.
 */
export default async function WebPage() {
  await requireDepartment("web");
  const [clients, rows] = await Promise.all([listClientOptions(), listWebProjects()]);

  if (clients.length === 0) {
    return (
      <>
        <PageHeader title="Projets web" sub="Aucun client" />
        <EmptyState title="Aucun client" actionLabel="Ajouter un client" actionHref="/clients">
          Un projet web se rattache à un client, comme le reste : c&apos;est ce qui permet de
          retrouver son brief, ses fichiers et son portail.
        </EmptyState>
      </>
    );
  }

  const now = new Date();
  const enCours = rows.filter((r) => r.project.phase !== "en_ligne" && r.project.phase !== "maintenance");
  const attente = enCours.filter((r) => Number(r.attenteClient) > 0).length;
  const enRetard = enCours.filter((r) => r.project.dueAt && r.project.dueAt < now).length;

  return (
    <>
      <PageHeader
        title="Projets web"
        sub={
          rows.length === 0
            ? "Aucun projet"
            : `${enCours.length} en cours` +
              (enRetard > 0 ? ` · ${enRetard} en retard` : "") +
              (attente > 0 ? ` · ${attente} attendent le client` : "")
        }
      />

      <div className="min-h-0 flex-1 overflow-auto px-4 pt-4 pb-5 lg:px-5">
        <Card className="mb-4 flex flex-col gap-4 p-4">
          <Eyebrow>Nouveau projet</Eyebrow>
          <ProjectForm clients={clients} />
        </Card>

        {rows.length === 0 ? (
          <Card className="p-5">
            <p className="text-base text-ink-2">
              Aucun projet pour l&apos;instant. Un projet rassemble le brief du client, les jalons,
              les fichiers déposés, le domaine et l&apos;hébergement — et alimente le portail du
              client, qui suit l&apos;avancement sans avoir à le demander.
            </p>
          </Card>
        ) : (
          <div className="flex min-w-max items-start gap-3">
            {WEB_PHASES.map((phase) => {
              const cartes = rows.filter((r) => r.project.phase === phase);
              const suivante = phaseSuivante(phase);
              const info = WEB_PHASE[phase];

              return (
                <div
                  key={phase}
                  className="flex w-[290px] flex-none flex-col rounded-card border border-line bg-paper"
                >
                  <div className="flex flex-none flex-col gap-[2px] border-b border-line px-3 py-[10px]">
                    <span className="flex items-center justify-between gap-2">
                      <Eyebrow tone="ink">{info.label}</Eyebrow>
                      <span className="text-small text-ink-3 tabular-nums">{cartes.length}</span>
                    </span>
                    {info.attendClient ? (
                      <span className="text-micro text-warn">La balle est chez le client</span>
                    ) : null}
                  </div>

                  <div className="flex flex-col gap-2 p-2">
                    {cartes.map((r) => {
                      const retard = r.project.dueAt && r.project.dueAt < now && phase !== "en_ligne";
                      const total = Number(r.jalons);
                      const faits = Number(r.jalonsFaits);
                      return (
                        <div
                          key={r.project.id}
                          className="flex flex-col gap-[7px] rounded-card border border-line bg-paper p-[10px]"
                        >
                          <Link
                            href={`/web/${r.project.id}`}
                            className="flex flex-col gap-[2px] no-underline hover:no-underline"
                          >
                            <span className="clip text-micro text-ink-3">
                              {r.clientName} · {PROJECT_TYPE[r.project.type]?.short ?? r.project.type}
                            </span>
                            <span className="clip text-base font-medium text-ink">
                              {r.project.name}
                            </span>
                          </Link>

                          {total > 0 ? (
                            <span className="flex items-center gap-2">
                              <span className="h-[5px] flex-1 overflow-hidden rounded-full bg-slot">
                                <span
                                  className="block h-full rounded-full bg-gold"
                                  style={{ width: `${Math.round((faits / total) * 100)}%` }}
                                />
                              </span>
                              <span className="flex-none text-micro text-ink-3 tabular-nums">
                                {faits}/{total}
                              </span>
                            </span>
                          ) : null}

                          {Number(r.attenteClient) > 0 ? (
                            <span className="flex items-start gap-[6px]">
                              <Dot tone="warn" solid size={5} className="mt-[5px]" />
                              <span className="text-small leading-snug text-warn">
                                {r.attenteClient} point{Number(r.attenteClient) > 1 ? "s" : ""} en
                                attente du client
                              </span>
                            </span>
                          ) : null}

                          <span className="flex flex-wrap items-center gap-x-2 text-micro text-ink-3 tabular-nums">
                            {r.project.dueAt ? (
                              <span className={retard ? "font-medium text-alert" : ""}>
                                {retard ? "En retard depuis le " : "Mise en ligne "}
                                {r.project.dueAt.toLocaleDateString("fr-FR", {
                                  day: "numeric",
                                  month: "short",
                                })}
                              </span>
                            ) : (
                              <span>Sans date</span>
                            )}
                            {r.project.priceCents > 0 ? (
                              <span>· {euroFromCents(r.project.priceCents)}</span>
                            ) : null}
                            {r.ownerName ? <span>· {r.ownerName}</span> : null}
                          </span>

                          {suivante ? (
                            <form action={updateProject}>
                              <input type="hidden" name="id" value={r.project.id} />
                              <input type="hidden" name="phase" value={suivante} />
                              <button
                                type="submit"
                                className="w-full cursor-pointer rounded-control border border-line bg-paper px-2 py-1 text-small font-medium text-ink-2 hover:border-line-strong hover:text-ink"
                              >
                                → {WEB_PHASE[suivante].label}
                              </button>
                            </form>
                          ) : null}
                        </div>
                      );
                    })}

                    {cartes.length === 0 ? (
                      <p className="rounded-card border border-dashed border-line p-3 text-small leading-snug text-ink-3">
                        {info.aide}
                      </p>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
