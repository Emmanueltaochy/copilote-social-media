import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell/Screen";
import { Card, CardHead } from "@/components/ui/Card";
import { CheckBox, Dot, StatusPill } from "@/components/ui/primitives";
import { requireDepartment } from "@/lib/auth";
import { listTeam } from "@/db/queries";
import { getWebProject, listBriefs, listDeliverables, listMilestones } from "@/db/web-queries";
import { BRIEF_STATUS, PROJECT_TYPE, WEB_PHASE, WEB_PHASES } from "@/data/web";
import { toneText } from "@/lib/tone";
import {
  addMilestone,
  removeDeliverable,
  removeMilestone,
  resubmitDeliverable,
  toggleMilestone,
  updateProject,
} from "../actions";
import { BriefLauncher } from "../BriefLauncher";
import { AjoutLivrable } from "./Livrables";

export const dynamic = "force-dynamic";

const champ =
  "rounded-control border border-line bg-paper px-2 py-[6px] text-small outline-none focus:border-gold";

export default async function ProjetPage({ params }: { params: Promise<{ id: string }> }) {
  await requireDepartment("web");
  const { id } = await params;

  const row = await getWebProject(id);
  if (!row) notFound();

  const [jalons, staff, briefsDuProjet, livrables] = await Promise.all([
    listMilestones(id),
    listTeam(),
    listBriefs({ projectId: id }),
    listDeliverables(id),
  ]);

  const p = row.project;
  const faits = jalons.filter((j) => j.done).length;
  const attente = jalons.filter((j) => !j.done && j.waitingClient);

  return (
    <>
      <PageHeader
        title={p.name}
        sub={`${row.clientName} · ${PROJECT_TYPE[p.type]?.label ?? p.type} · ${faits}/${jalons.length} jalons`}
      >
        <Link href="/web" className="text-small">
          ← Tous les projets
        </Link>
      </PageHeader>

      <div className="min-h-0 flex-1 overflow-auto px-4 pt-4 pb-6 lg:px-5">
        <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-4">
          {attente.length > 0 ? (
            <Card className="border-warn bg-warn-bg p-4">
              <p className="text-base text-warn">
                {attente.length} point{attente.length > 1 ? "s" : ""} attend
                {attente.length > 1 ? "ent" : ""} le client : {attente.map((j) => j.label).join(" · ")}.
                Ils apparaissent dans son portail, dans « ce qu&apos;on attend de vous ».
              </p>
            </Card>
          ) : null}

          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
            <Card>
              <CardHead title="Le projet" meta={WEB_PHASE[p.phase]?.label} />
              <form action={updateProject} className="flex flex-col gap-3 p-[14px]">
                <input type="hidden" name="id" value={p.id} />

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="flex flex-col gap-1">
                    <span className="eyebrow text-ink-3">Étape</span>
                    <select name="phase" defaultValue={p.phase} className={champ}>
                      {WEB_PHASES.map((v) => (
                        <option key={v} value={v}>
                          {WEB_PHASE[v].label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className="eyebrow text-ink-3">Responsable</span>
                    <select name="ownerId" defaultValue={p.ownerId ?? ""} className={champ}>
                      <option value="">Toute l&apos;équipe</option>
                      {staff.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className="eyebrow text-ink-3">Mise en ligne visée</span>
                    <input
                      name="dueAt"
                      type="date"
                      defaultValue={p.dueAt ? p.dueAt.toISOString().slice(0, 10) : ""}
                      className={champ}
                    />
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className="eyebrow text-ink-3">Montant (€)</span>
                    <input
                      name="price"
                      type="number"
                      min={0}
                      step={100}
                      defaultValue={p.priceCents > 0 ? p.priceCents / 100 : ""}
                      className={champ}
                    />
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className="eyebrow text-ink-3">Nom de domaine</span>
                    <input name="domain" defaultValue={p.domain ?? ""} placeholder="capmarine.re" className={champ} />
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className="eyebrow text-ink-3">Hébergement</span>
                    <input name="hosting" defaultValue={p.hosting ?? ""} placeholder="Hostinger" className={champ} />
                  </label>

                  <label className="flex flex-col gap-1 sm:col-span-2">
                    <span className="eyebrow text-ink-3">Technologie</span>
                    <input name="stack" defaultValue={p.stack ?? ""} placeholder="WordPress, Shopify, sur-mesure…" className={champ} />
                  </label>
                </div>

                <label className="flex flex-col gap-1">
                  <span className="eyebrow text-ink-3">Notes internes</span>
                  <textarea name="note" rows={3} defaultValue={p.note ?? ""} className={champ} />
                </label>

                <div className="flex items-center justify-between gap-3">
                  <button
                    type="submit"
                    className="cursor-pointer rounded-control border border-ink bg-ink px-3 py-2 text-base font-medium text-paper hover:bg-black"
                  >
                    Enregistrer
                  </button>
                  {p.launchedAt ? (
                    <span className="text-small text-ok">
                      En ligne depuis le {p.launchedAt.toLocaleDateString("fr-FR")}
                    </span>
                  ) : null}
                </div>

                <p className="text-small text-ink-3">
                  Aucun mot de passe n&apos;est stocké ici : notez où sont les accès, pas les accès
                  eux-mêmes. Un identifiant d&apos;hébergeur dans une base est un identifiant qui
                  fuit avec elle.
                </p>
              </form>
            </Card>

            <div className="flex flex-col gap-4">
              <Card>
                <CardHead
                  title="Jalons"
                  meta={`${faits}/${jalons.length}`}
                />
                {jalons.length === 0 ? (
                  <p className="px-[14px] py-4 text-base text-ink-2">
                    Aucun jalon. Un projet sans jalon se suit au ressenti.
                  </p>
                ) : (
                  jalons.map((j) => (
                    <div key={j.id} className="flex items-center gap-3 border-b border-line px-[14px] py-2">
                      <form action={toggleMilestone} className="flex flex-none">
                        <input type="hidden" name="id" value={j.id} />
                        <input type="hidden" name="projectId" value={p.id} />
                        <button
                          type="submit"
                          aria-label={j.done ? `Décocher ${j.label}` : `Cocher ${j.label}`}
                          className="flex cursor-pointer items-center border-none bg-transparent p-0"
                        >
                          <CheckBox checked={j.done} />
                        </button>
                      </form>
                      <span className={`clip flex-1 text-base ${j.done ? "text-ink-3 line-through" : "text-ink"}`}>
                        {j.label}
                      </span>
                      {j.waitingClient && !j.done ? (
                        <span className="flex-none text-small text-warn">client</span>
                      ) : null}
                      <form action={removeMilestone} className="flex-none">
                        <input type="hidden" name="id" value={j.id} />
                        <input type="hidden" name="projectId" value={p.id} />
                        <button
                          type="submit"
                          title="Retirer"
                          className="cursor-pointer rounded-control border border-line bg-paper px-[6px] py-[2px] text-micro text-ink-3 hover:border-alert hover:text-alert"
                        >
                          ✕
                        </button>
                      </form>
                    </div>
                  ))
                )}

                <form action={addMilestone} className="flex flex-wrap items-center gap-2 px-[14px] py-3">
                  <input type="hidden" name="projectId" value={p.id} />
                  <input name="label" required placeholder="Maquette page contact validée" className={`min-w-0 flex-1 ${champ}`} />
                  <label className="flex flex-none cursor-pointer items-center gap-[6px] text-small text-ink-2">
                    <input type="checkbox" name="waitingClient" className="h-[15px] w-[15px] accent-ink" />
                    Attend le client
                  </label>
                  <button
                    type="submit"
                    className="flex-none cursor-pointer rounded-control border border-line bg-paper px-[10px] py-[6px] text-small font-medium text-ink-2 hover:border-line-strong hover:text-ink"
                  >
                    Ajouter
                  </button>
                </form>
              </Card>

              <Card>
                <CardHead title="Brief" meta={`${briefsDuProjet.length}`} />
                {briefsDuProjet.map(({ brief, total, remplis }) => (
                  <Link
                    key={brief.id}
                    href={`/web/briefs/${brief.id}`}
                    className="flex items-center gap-3 border-b border-line px-[14px] py-3 no-underline hover:bg-canvas hover:no-underline"
                  >
                    <Dot tone={BRIEF_STATUS[brief.status].tone} solid size={6} />
                    <span className="clip flex-1 text-base text-ink">{brief.title}</span>
                    <span className="flex-none text-small tabular-nums text-ink-3">
                      {remplis}/{total}
                    </span>
                    <StatusPill tone={BRIEF_STATUS[brief.status].tone}>
                      {BRIEF_STATUS[brief.status].label}
                    </StatusPill>
                  </Link>
                ))}
                <div className="px-[14px] py-3">
                  <BriefLauncher
                    clientId={p.clientId}
                    projectId={p.id}
                    type={p.type}
                    defaultTitle={`Brief — ${p.name}`}
                  />
                  <p className="mt-2 text-small text-ink-3">
                    Le brief reprend les questions du type « {PROJECT_TYPE[p.type]?.label} ». Vous
                    pouvez le remplir vous-même, l&apos;envoyer au client, ou les deux — c&apos;est
                    le même document.
                  </p>
                </div>
              </Card>
            </div>
          </div>

          <Card>
            <CardHead
              title="Livrables soumis au client"
              meta={
                livrables.length
                  ? `${livrables.filter((l) => l.livrable.status === "valide").length}/${livrables.length} validés`
                  : undefined
              }
            />

            {livrables.length === 0 ? (
              <p className="px-[14px] py-4 text-base text-ink-2">
                Rien de soumis pour l&apos;instant. Une maquette se montre au client sous la forme
                qui existe déjà : un lien Figma, une préproduction, ou un PDF déposé ici. Il la
                valide ou dit ce qui doit changer, depuis son espace.
              </p>
            ) : (
              livrables.map(({ livrable, filename }) => (
                <div key={livrable.id} className="flex flex-col gap-1 border-b border-line px-[14px] py-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="flex min-w-[180px] flex-1 flex-col">
                      <a
                        href={livrable.url ?? `/api/client-files/${livrable.fileId}`}
                        target="_blank"
                        rel="noreferrer"
                        className="clip text-base font-medium"
                      >
                        {livrable.label} ↗
                      </a>
                      <span className="clip text-small text-ink-3">
                        {livrable.url ? livrable.url : (filename ?? "fichier supprimé")}
                        {livrable.note ? ` · ${livrable.note}` : ""}
                      </span>
                    </span>

                    <StatusPill
                      tone={
                        livrable.status === "valide"
                          ? "ok"
                          : livrable.status === "modifications"
                            ? "alert"
                            : "warn"
                      }
                    >
                      {livrable.status === "valide"
                        ? "Validé"
                        : livrable.status === "modifications"
                          ? "À reprendre"
                          : "En attente"}
                    </StatusPill>

                    {livrable.status === "modifications" ? (
                      <form action={resubmitDeliverable} className="flex-none">
                        <input type="hidden" name="id" value={livrable.id} />
                        <input type="hidden" name="projectId" value={p.id} />
                        <button
                          type="submit"
                          className="cursor-pointer rounded-control border border-line bg-paper px-[10px] py-[6px] text-small font-medium text-ink-2 hover:border-line-strong hover:text-ink"
                        >
                          Resoumettre
                        </button>
                      </form>
                    ) : null}

                    <form action={removeDeliverable} className="flex-none">
                      <input type="hidden" name="id" value={livrable.id} />
                      <input type="hidden" name="projectId" value={p.id} />
                      <button
                        type="submit"
                        title="Retirer"
                        className="cursor-pointer rounded-control border border-line bg-paper px-[6px] py-[2px] text-micro text-ink-3 hover:border-alert hover:text-alert"
                      >
                        ✕
                      </button>
                    </form>
                  </div>

                  {livrable.clientNote ? (
                    <span className="rounded-control border border-alert-line bg-alert-bg px-3 py-2 text-base text-alert">
                      Le client demande : « {livrable.clientNote} »
                    </span>
                  ) : null}
                </div>
              ))
            )}

            <AjoutLivrable projectId={p.id} clientId={p.clientId} />
          </Card>

          <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
            <span className="text-small text-ink-2">
              Le client suit ce projet depuis son portail :{" "}
              {jalons.filter((j) => j.clientVisible).length} jalon
              {jalons.filter((j) => j.clientVisible).length > 1 ? "s" : ""} visible
              {jalons.filter((j) => j.clientVisible).length > 1 ? "s" : ""}.
            </span>
            <span className={`text-small ${toneText[WEB_PHASE[p.phase]?.tone ?? "muted"]}`}>
              {WEB_PHASE[p.phase]?.aide}
            </span>
          </Card>
        </div>
      </div>
    </>
  );
}
