import { Card } from "@/components/ui/Card";
import { PROJECT_TYPE, WEB_PHASE } from "@/data/web";
import { jalonsVisibles, livrablesDuClient, projetsDuClient } from "@/db/web-queries";
import { contextePortail } from "@/lib/portail";
import { LivrableClient } from "../EspaceWeb";

export const dynamic = "force-dynamic";

/**
 * Les projets web du client : où en est son site.
 *
 * L'avancement se dit en jalons franchis, pas en pourcentage : « maquette
 * d'accueil validée » se vérifie, « 60 % » ne se vérifie pas. Ce qui attend le
 * client est signalé sur la ligne concernée — c'est presque toujours là que le
 * chantier s'arrête.
 */
export default async function ProjetsPage() {
  const { client, config } = await contextePortail();
  const [projets, livrables] = await Promise.all([
    projetsDuClient(client.id),
    livrablesDuClient(client.id),
  ]);

  const jalonsParProjet = new Map<string, Awaited<ReturnType<typeof jalonsVisibles>>>();
  for (const p of projets) jalonsParProjet.set(p.project.id, await jalonsVisibles(p.project.id));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-[2px]">
        <span className="eyebrow text-ink-3">{client.shortName}</span>
        <h1 className="text-display font-semibold tracking-[-0.01em]">Vos projets</h1>
      </div>

      {projets.length === 0 ? (
        <Card className="p-6">
          <p className="text-lead text-ink-2">Aucun projet en cours pour le moment.</p>
        </Card>
      ) : null}

      {projets.map(({ project, jalons, jalonsFaits }) => {
        const liste = jalonsParProjet.get(project.id) ?? [];
        const duProjet = livrables.filter((l) => l.projetId === project.id);
        return (
          <Card key={project.id} className="flex flex-col gap-4 p-4 sm:p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="flex min-w-0 flex-col">
                <span className="eyebrow text-ink-3">
                  {PROJECT_TYPE[project.type]?.label ?? project.type}
                </span>
                <span className="text-title font-semibold">{project.name}</span>
              </span>
              <span className="text-base text-ink-3">
                {WEB_PHASE[project.phase]?.label}
                {project.dueAt
                  ? ` · mise en ligne prévue le ${project.dueAt.toLocaleDateString("fr-FR")}`
                  : ""}
              </span>
            </div>

            {Number(jalons) > 0 ? (
              <span className="flex items-center gap-3">
                <span className="h-[6px] flex-1 overflow-hidden rounded-full bg-slot">
                  <span
                    className="block h-full rounded-full"
                    style={{
                      width: `${Math.round((Number(jalonsFaits) / Number(jalons)) * 100)}%`,
                      background: config.primaryColor,
                    }}
                  />
                </span>
                <span className="flex-none text-small tabular-nums text-ink-2">
                  {jalonsFaits}/{jalons}
                </span>
              </span>
            ) : null}

            {duProjet.map(({ livrable }) => (
              <LivrableClient
                key={livrable.id}
                id={livrable.id}
                label={livrable.label}
                note={livrable.note}
                href={livrable.url ?? `/api/client-files/${livrable.fileId}`}
                statut={livrable.status}
                remarque={livrable.clientNote}
                accent={config.primaryColor}
              />
            ))}

            {liste.length > 0 ? (
              <div className="flex flex-col gap-[3px]">
                {liste.map((j) => (
                  <span key={j.id} className="flex flex-wrap items-center gap-2 text-base">
                    <span className={j.done ? "text-ok" : "text-ink-3"}>{j.done ? "✓" : "○"}</span>
                    <span className={j.done ? "text-ink-3 line-through" : "text-ink-2"}>
                      {j.label}
                    </span>
                    {!j.done && j.waitingClient ? (
                      <span className="text-small text-warn">— nous attendons votre retour</span>
                    ) : null}
                  </span>
                ))}
              </div>
            ) : null}
          </Card>
        );
      })}
    </div>
  );
}
