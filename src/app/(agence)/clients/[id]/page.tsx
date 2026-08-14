import { headers } from "next/headers";
import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/shell/Screen";
import { Card, CardHead, Kpi, KpiGrid } from "@/components/ui/Card";
import { PacingBar } from "@/components/ui/PacingBar";
import { Eyebrow, StatusPill } from "@/components/ui/primitives";
import { requireStaff, canSeeMoney } from "@/lib/auth";
import { getClientWithPace, listContractLines } from "@/db/queries";
import { CONTENT_KIND, networksLabel } from "@/data/content";
import { BRIEF_STATUS, PROJECT_TYPE, WEB_PHASE } from "@/data/web";
import { listBriefs, listWebProjects } from "@/db/web-queries";
import { BriefLauncher } from "../../web/BriefLauncher";
import { CharteClient } from "@/app/portail/EspaceWeb";
import { brands } from "@/db/schema";
import { db } from "@/db";
import { eq } from "drizzle-orm";
import { ContractLineForm } from "../ContractLineForm";
import { euroFromCents, fr, monthLabel } from "@/lib/pacing";
import { ClientForm } from "../ClientForm";
import { ClientAccessForm } from "../ClientAccess";
import { InviteLink } from "@/components/ui/InviteLink";
import { SendByEmail } from "@/components/ui/SendByEmail";
import {
  archiveClient,
  deleteClientFile,
  removeContractLine,
  revokeClientAccess,
  updateClient,
} from "../actions";
import { FilesCard } from "./FilesCard";
import { listClientAccess, listClientFiles } from "@/db/queries";

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireStaff();
  const { id } = await params;

  const client = await getClientWithPace(id);
  if (!client) notFound();

  const [lines, access, files, projetsWeb, briefsDuClient, charteRows] = await Promise.all([
    listContractLines(id),
    listClientAccess(id),
    listClientFiles(id),
    listWebProjects(id),
    listBriefs({ clientId: id }),
    db.select().from(brands).where(eq(brands.clientId, id)).limit(1),
  ]);
  const charte = charteRows[0];
  const { pace } = client;

  // Adresse publique du site, telle que le navigateur l'a demandée. Derrière
  // nginx, c'est l'en-tête transmis qui porte le vrai domaine : sans lui, le
  // lien d'invitation pointerait vers l'adresse interne du conteneur.
  const head = await headers();
  const host = head.get("x-forwarded-host") ?? head.get("host") ?? "";
  const scheme = head.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  const origin = host ? `${scheme}://${host}` : "";

  return (
    <>
      <PageHeader
        title={client.shortName}
        sub={`${client.sector ?? "Secteur à renseigner"} · ${monthLabel()}`}
      />

      <div className="min-h-0 flex-1 overflow-auto px-4 pt-4 pb-6 lg:px-5">
        <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-4">
          <Card className="flex flex-col gap-4 p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-[2px]">
                <Eyebrow>Engagement du mois</Eyebrow>
                <span className="text-display font-semibold tracking-[-0.01em]">
                  {client.name}
                </span>
              </div>
              <StatusPill tone={pace.tone}>{pace.label}</StatusPill>
            </div>

            {client.contentTarget > 0 ? (
              <>
                <PacingBar
                  size="lg"
                  fillPct={pace.fillPct}
                  projPct={pace.projPct}
                  markerLeft={pace.markerLeft}
                  markerLabel={`Attendu aujourd'hui · ${fr(pace.expected, 1)}`}
                />
                <KpiGrid columns={4}>
                  <Kpi label="Réalisé" value={`${client.done} / ${client.contentTarget}`} meta="contenus publiés" />
                  <Kpi label="Attendu à date" value={fr(pace.expected, 1)} meta="au rythme contractuel" />
                  <Kpi label="Écart" value={pace.deltaLabel} valueTone={pace.tone} meta={pace.diffLabel} />
                  <Kpi
                    label="Projection"
                    value={`${pace.projected} / ${client.contentTarget}`}
                    valueTone={pace.projected >= client.contentTarget ? "ok" : "warn"}
                    meta="en fin de mois"
                  />
                </KpiGrid>
              </>
            ) : (
              <p className="text-base text-ink-2">
                Ce compte n&apos;a pas d&apos;engagement chiffré. Renseigne un nombre de contenus
                par mois pour activer le pilotage du rythme.
              </p>
            )}

            {canSeeMoney(user) ? (
              <div className="flex items-center gap-4 border-t border-line pt-3 text-base">
                <span className="text-ink-2">
                  Forfait{" "}
                  <strong className="font-medium text-ink">
                    {client.monthlyFeeCents > 0 ? euroFromCents(client.monthlyFeeCents) : "—"}
                  </strong>
                </span>
                <span className="text-ink-2">
                  Heures vendues{" "}
                  <strong className="font-medium text-ink">{client.hoursSold} h</strong>
                </span>
              </div>
            ) : null}
          </Card>

          <Card>
            <CardHead
              title="Décomposition de l'engagement"
              meta={lines.length ? `${lines.length} lignes` : undefined}
            />
            {lines.length === 0 ? (
              <p className="px-[14px] py-4 text-base text-ink-2">
                Aucune ligne pour l&apos;instant. La décomposition (posts feed, stories, reels…)
                permet de suivre l&apos;engagement type par type — et surtout de{" "}
                <Link href="/preparer">préparer le mois</Link> en un clic plutôt que de ressaisir
                les mêmes contenus tous les trente jours.
              </p>
            ) : (
              lines.map((l) => (
                <div
                  key={l.id}
                  className="flex h-11 items-center gap-3 border-b border-line px-[14px]"
                >
                  <span className="clip min-w-0 flex-1 text-base">{l.label}</span>
                  <span className="flex-none text-small text-ink-3">
                    {CONTENT_KIND[l.kind] ?? l.kind} · {networksLabel(l)}
                  </span>
                  <span className="flex-none text-base tabular-nums">{l.monthlyTarget} / mois</span>
                  <form action={removeContractLine} className="flex-none">
                    <input type="hidden" name="id" value={l.id} />
                    <input type="hidden" name="clientId" value={client.id} />
                    <button
                      type="submit"
                      title="Retirer cette ligne"
                      className="cursor-pointer rounded-control border border-line bg-paper px-[6px] py-[2px] text-micro text-ink-3 hover:border-alert hover:text-alert"
                    >
                      ✕
                    </button>
                  </form>
                </div>
              ))
            )}

            <ContractLineForm clientId={client.id} />
          </Card>

          <Card className="p-5">
            <div className="mb-4">
              <Eyebrow>Contrat</Eyebrow>
              <h2 className="text-title font-semibold">Modifier la fiche</h2>
            </div>
            <ClientForm
              action={updateClient}
              submitLabel="Enregistrer"
              showMoney={canSeeMoney(user)}
              values={{
                id: client.id,
                name: client.name,
                shortName: client.shortName,
                sector: client.sector ?? "",
                monthlyFee: Math.round(client.monthlyFeeCents / 100),
                contentTarget: client.contentTarget,
                shootsIncluded: client.shootsIncluded,
                hoursSold: client.hoursSold,
                adsBudgetLabel: client.adsBudgetLabel ?? "",
              }}
            />
          </Card>

          <FilesCard clientId={client.id} files={files} onDelete={deleteClientFile} />

          <Card className="flex flex-col gap-4 p-5">
            <div>
              <Eyebrow>Portail client</Eyebrow>
              <h2 className="text-title font-semibold">Accès du client</h2>
              <p className="mt-1 text-base text-ink-2">
                Le contact reçoit un lien d&apos;invitation et choisit son mot de passe. Il ne verra
                que son propre espace : ses contenus, son mois, ses médias — jamais les coûts ni les
                autres clients.
              </p>
            </div>

            {access.length > 0 ? (
              <div className="overflow-hidden rounded-card border border-line">
                {access.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center gap-3 border-b border-line px-3 py-[10px]"
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="clip text-base font-medium">{a.name}</span>
                      <span className="clip text-small text-ink-3">{a.email}</span>
                    </span>
                    {a.inviteToken ? (
                      <>
                        <InviteLink url={`${origin}/invitation/${a.inviteToken}`} />
                        <SendByEmail kind="invitation" id={a.id} defaultTo={a.email} label="Envoyer" />
                      </>
                    ) : (
                      <span className="text-small text-ok">Compte actif</span>
                    )}
                    <form action={revokeClientAccess}>
                      <input type="hidden" name="userId" value={a.id} />
                      <input type="hidden" name="clientId" value={client.id} />
                      <button
                        type="submit"
                        className="cursor-pointer rounded-control border border-line bg-paper px-2 py-1 text-small text-ink-3 hover:border-alert hover:text-alert"
                      >
                        Révoquer
                      </button>
                    </form>
                  </div>
                ))}
              </div>
            ) : null}

            <ClientAccessForm clientId={client.id} />
          </Card>

          {/* La charte graphique, écrite des deux côtés. Le client renseigne ce
              qu'il sait depuis son portail, l'agence complète ici : c'est le
              même document, pas deux versions à réconcilier ensuite. */}
          <Card>
            <CardHead title="Charte graphique" meta="partagée avec le client" />
            <CharteClient
              clientId={client.id}
              couleurs={charte?.palette ?? []}
              polices={charte?.fonts ?? null}
              ton={charte?.voice ?? null}
              accent="#121212"
            />
          </Card>

          {/* Le pôle web depuis la fiche : c'est ici qu'on est quand on décide
              de lancer un site pour un client, et non sur le tableau des
              projets. */}
          <Card>
            <CardHead title="Web" meta={projetsWeb.length ? `${projetsWeb.length} projet${projetsWeb.length > 1 ? "s" : ""}` : undefined} />
            {projetsWeb.map(({ project }) => (
              <Link
                key={project.id}
                href={`/web/${project.id}`}
                className="flex flex-wrap items-center gap-3 border-b border-line px-[14px] py-3 no-underline hover:bg-canvas hover:no-underline"
              >
                <span className="clip min-w-0 flex-1 text-base font-medium text-ink">
                  {project.name}
                </span>
                <span className="flex-none text-small text-ink-3">
                  {PROJECT_TYPE[project.type]?.short ?? project.type} · {WEB_PHASE[project.phase]?.label}
                </span>
              </Link>
            ))}

            {briefsDuClient.length > 0 ? (
              <div className="flex flex-col">
                {briefsDuClient.map(({ brief, total, remplis }) => (
                  <Link
                    key={brief.id}
                    href={`/web/briefs/${brief.id}`}
                    className="flex flex-wrap items-center gap-3 border-b border-line px-[14px] py-[10px] no-underline hover:bg-canvas hover:no-underline"
                  >
                    <span className="clip min-w-0 flex-1 text-base text-ink-2">{brief.title}</span>
                    <span className="flex-none text-small tabular-nums text-ink-3">
                      {remplis}/{total} réponses
                    </span>
                    <StatusPill tone={BRIEF_STATUS[brief.status].tone}>
                      {BRIEF_STATUS[brief.status].label}
                    </StatusPill>
                  </Link>
                ))}
              </div>
            ) : null}

            <div className="px-[14px] py-3">
              <BriefLauncher
                clientId={client.id}
                type="vitrine"
                defaultTitle={`Brief web — ${client.shortName}`}
              />
              <p className="mt-2 text-small text-ink-3">
                Un brief créé ici n&apos;est rattaché à aucun projet : utile pour cadrer une
                demande avant de savoir ce qu&apos;on vend. Depuis un projet, les questions
                s&apos;adaptent à son type.
              </p>
            </div>
          </Card>

          <Card className="flex items-center justify-between gap-4 p-5">
            <div>
              <h3 className="text-base font-medium">Archiver ce client</h3>
              <p className="text-small text-ink-2">
                Le compte disparaît des écrans de pilotage, mais son historique reste intact pour
                les rapports et la rentabilité des mois passés.
              </p>
            </div>
            <form action={archiveClient}>
              <input type="hidden" name="id" value={client.id} />
              <button
                type="submit"
                className="cursor-pointer rounded-control border border-line bg-paper px-3 py-2 text-base font-medium text-alert hover:border-alert"
              >
                Archiver
              </button>
            </form>
          </Card>

          <Link href="/clients" className="text-base">← Tous les clients</Link>
        </div>
      </div>
    </>
  );
}
