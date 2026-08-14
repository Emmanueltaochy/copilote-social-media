import Link from "next/link";
import { PageHeader } from "@/components/shell/Screen";
import { Card, CardHead } from "@/components/ui/Card";
import { Dot, StatusPill } from "@/components/ui/primitives";
import { requireDepartment } from "@/lib/auth";
import { listBriefs } from "@/db/web-queries";
import { BRIEF_STATUS } from "@/data/web";

export const dynamic = "force-dynamic";

/**
 * Tous les briefs, celui qu'on attend en premier.
 *
 * Un brief non rempli est la cause n° 1 d'un projet qui n'avance pas : il
 * mérite son écran, pas une ligne perdue dans une fiche.
 */
export default async function BriefsPage() {
  await requireDepartment("web");
  const rows = await listBriefs();

  const attendus = rows.filter((r) => r.brief.status === "envoye" || r.brief.status === "en_cours");
  const autres = rows.filter((r) => !attendus.includes(r));

  return (
    <>
      <PageHeader
        title="Briefs"
        sub={
          rows.length === 0
            ? "Aucun brief"
            : `${attendus.length} en attente de réponse · ${rows.length} au total`
        }
      />

      <div className="min-h-0 flex-1 overflow-auto px-4 pt-4 pb-6 lg:px-5">
        <div className="mx-auto flex w-full max-w-[1000px] flex-col gap-4">
          {rows.length === 0 ? (
            <Card className="p-5">
              <p className="text-base text-ink-2">
                Aucun brief. Un brief se crée depuis un projet ou depuis la fiche d&apos;un client :
                il reprend les questions du type de projet, se remplit à quatre mains, et
                s&apos;envoie au client en un clic.
              </p>
            </Card>
          ) : null}

          {[
            { titre: "En attente du client", items: attendus },
            { titre: "Brouillons et briefs complets", items: autres },
          ]
            .filter((g) => g.items.length > 0)
            .map((groupe) => (
              <Card key={groupe.titre}>
                <CardHead title={groupe.titre} meta={`${groupe.items.length}`} />
                {groupe.items.map(({ brief, clientName, projectName, total, remplis, manquantsObligatoires }) => (
                  <Link
                    key={brief.id}
                    href={`/web/briefs/${brief.id}`}
                    className="flex flex-wrap items-center gap-3 border-b border-line px-[14px] py-3 no-underline hover:bg-canvas hover:no-underline"
                  >
                    <Dot tone={BRIEF_STATUS[brief.status].tone} solid size={6} />
                    <span className="flex min-w-[180px] flex-1 flex-col">
                      <span className="clip text-base font-medium text-ink">{brief.title}</span>
                      <span className="clip text-small text-ink-3">
                        {clientName}
                        {projectName ? ` · ${projectName}` : ""}
                        {brief.sentAt ? ` · envoyé le ${brief.sentAt.toLocaleDateString("fr-FR")}` : ""}
                      </span>
                    </span>
                    <span className="flex-none text-small tabular-nums text-ink-2">
                      {remplis}/{total} réponses
                    </span>
                    {Number(manquantsObligatoires) > 0 ? (
                      <span className="flex-none text-small text-warn tabular-nums">
                        {manquantsObligatoires} obligatoire{Number(manquantsObligatoires) > 1 ? "s" : ""} manquante{Number(manquantsObligatoires) > 1 ? "s" : ""}
                      </span>
                    ) : null}
                    <StatusPill tone={BRIEF_STATUS[brief.status].tone}>
                      {BRIEF_STATUS[brief.status].label}
                    </StatusPill>
                  </Link>
                ))}
              </Card>
            ))}
        </div>
      </div>
    </>
  );
}
