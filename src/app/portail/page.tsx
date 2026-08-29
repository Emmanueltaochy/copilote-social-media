import Image from "next/image";
import { redirect } from "next/navigation";
import { and, desc, eq, gte, isNotNull, lt, sql as raw } from "drizzle-orm";
import { db, activity, assets, clients, contents } from "@/db";
import { coversFor, linksFor, slidesFor } from "@/db/queries";
import { requireUser } from "@/lib/auth";
import { logout } from "@/app/connexion/actions";
import { Card } from "@/components/ui/Card";
import { PacingBar } from "@/components/ui/PacingBar";
import { Eyebrow } from "@/components/ui/primitives";
import { CONTENT_KIND, CONTENT_STATUS } from "@/data/content";
import { fr, monthLabel, monthRange, pace } from "@/lib/pacing";
import { isVideo } from "@/lib/storage";
import { ValidationCard } from "./ValidationCard";
import { toneText } from "@/lib/tone";
import {
  actionsDuClient,
  fichiersDuClient,
  jalonsVisibles,
  livrablesDuClient,
  projetsDuClient,
  reglages,
} from "@/db/web-queries";
import { WEB_PHASE, PROJECT_TYPE } from "@/data/web";
import { brands } from "@/db/schema";
import { formatBytes } from "@/lib/storage";
import { BoutonRetirer, CharteClient, DepotFichiers, LivrableClient } from "./EspaceWeb";

export const dynamic = "force-dynamic";

/**
 * Le portail client.
 *
 * Mêmes chiffres que les écrans de l'agence, aucun rouage interne : ni coûts,
 * ni marges, ni assignations, ni étapes de production. Le client voit ce qui
 * l'attend, où en est son mois, et ses médias.
 */
export default async function PortailPage() {
  const user = await requireUser();
  // Un compte interne n'a pas de portail à lui : on le renvoie à son outil.
  if (user.role !== "client" || !user.clientId) redirect("/");

  const [client] = await db.select().from(clients).where(eq(clients.id, user.clientId)).limit(1);
  if (!client) redirect("/connexion");

  const { start, end } = monthRange();

  const [published, waiting, upcoming, media, answers] = await Promise.all([
    db
      .select({ content: contents })
      .from(contents)
      .where(
        and(
          eq(contents.clientId, client.id),
          isNotNull(contents.publishedAt),
          gte(contents.publishedAt, start),
          lt(contents.publishedAt, end),
        ),
      )
      .orderBy(desc(contents.publishedAt)),
    db
      .select({ content: contents })
      .from(contents)
      .where(and(eq(contents.clientId, client.id), eq(contents.status, "validation")))
      .orderBy(desc(contents.submittedAt)),
    db
      .select({ content: contents })
      .from(contents)
      .where(and(eq(contents.clientId, client.id), gte(contents.scheduledAt, new Date())))
      .orderBy(contents.scheduledAt)
      .limit(6),
    db
      .select({ asset: assets })
      .from(assets)
      .where(eq(assets.clientId, client.id))
      .orderBy(desc(assets.createdAt))
      .limit(12),
    // Les réponses déjà données. Une confirmation qui disparaît avec la carte
    // ne prouve rien : passé le clic, le client doit pouvoir vérifier que sa
    // réponse est bien arrivée, même après avoir rechargé la page.
    db
      .select({ entry: activity })
      .from(activity)
      .where(and(eq(activity.clientId, client.id), raw`${activity.text} like '%par le client%'`))
      .orderBy(desc(activity.createdAt))
      .limit(5),
  ]);

  // Le visuel de ce qui attend une réponse : on ne valide pas un titre.
  const covers = await coversFor(waiting.map((w) => w.content.id));
  // Un carrousel se juge vue par vue : le client doit pouvoir le balayer
  // comme le fera son audience, pas deviner sur la première image.
  const slides = await slidesFor(waiting.map((w) => w.content.id));
  // Une vidéo trop lourde pour être hébergée ici vit sur un Drive : le lien
  // est alors la seule chose à montrer, et sans lui la carte demande une
  // validation à l'aveugle.
  const links = await linksFor(waiting.map((w) => w.content.id));

  // Le pôle web : ce qu'on attend du client, ses projets, ses fichiers, sa
  // charte. Tout est chargé même s'il n'a pas de projet — les sections vides ne
  // s'affichent pas, mais le dépôt de fichiers et la charte servent aux deux
  // métiers.
  const [config, actions, projets, fichiers, charteRows, livrables] = await Promise.all([
    reglages(),
    actionsDuClient(client.id),
    projetsDuClient(client.id),
    fichiersDuClient(client.id, true),
    db.select().from(brands).where(eq(brands.clientId, client.id)).limit(1),
    livrablesDuClient(client.id),
  ]);
  const charte = charteRows[0];
  const jalonsParProjet = new Map<string, Awaited<ReturnType<typeof jalonsVisibles>>>();
  for (const p of projets) jalonsParProjet.set(p.project.id, await jalonsVisibles(p.project.id));

  const p = pace(published.length, client.contentTarget);

  return (
    <main className="min-h-screen bg-canvas">
      {/* Le bandeau prend les couleurs réglées par l'agence : le portail est un
          prolongement de sa marque, pas un outil générique où le client se
          demande chez qui il est. */}
      <div
        className="flex items-center justify-between gap-4 px-4 py-3 sm:px-6"
        style={{ background: config.darkColor }}
      >
        <span className="flex items-center gap-[10px]">
          <span className="h-2 w-2 rounded-[2px]" style={{ background: config.primaryColor }} />
          <Eyebrow className="text-paper">{config.agencyName}</Eyebrow>
        </span>
        <form action={logout}>
          <button
            type="submit"
            className="cursor-pointer rounded-control border border-ink-2 bg-transparent px-[10px] py-[6px] text-small font-medium text-night-ink hover:border-ink-3 hover:text-paper"
          >
            Se déconnecter
          </button>
        </form>
      </div>

      <div className="mx-auto flex w-full max-w-[1040px] flex-col gap-6 p-4 sm:p-6">
        <div className="flex flex-col gap-[2px]">
          <Eyebrow>
            {client.shortName} · {monthLabel()}
          </Eyebrow>
          <h1 className="text-display font-semibold tracking-[-0.01em]">Bonjour {user.name}</h1>
        </div>

        {waiting.length > 0 ? (
          <Card>
            <div className="flex items-center justify-between gap-4 border-b border-line px-6 py-5">
              <span className="text-title font-semibold">
                {waiting.length} contenu{waiting.length > 1 ? "s attendent" : " attend"} votre
                validation
              </span>
            </div>
            {waiting.map(({ content }) => (
              <ValidationCard
                key={content.id}
                id={content.id}
                title={content.title}
                kind={CONTENT_KIND[content.kind] ?? content.kind}
                cover={covers.get(content.id)}
                slides={content.kind === "carrousel" ? (slides.get(content.id) ?? []) : []}
                links={links.get(content.id) ?? []}
                scheduled={
                  content.scheduledAt
                    ? content.scheduledAt.toLocaleDateString("fr-FR", {
                        day: "numeric",
                        month: "long",
                      })
                    : null
                }
                waitingSince={
                  content.submittedAt ? content.submittedAt.toLocaleDateString("fr-FR") : null
                }
              />
            ))}
            <p className="px-6 py-4 text-base text-ink-3">
              Une validation programme la publication. Une demande de modification renvoie le
              contenu en fabrication avec votre remarque.
            </p>
          </Card>
        ) : null}

        {answers.length > 0 ? (
          <Card>
            <div className="border-b border-line px-6 py-5">
              <span className="text-title font-semibold">Vos dernières réponses</span>
            </div>
            {answers.map(({ entry }) => (
              <div key={entry.id} className="flex flex-wrap items-baseline gap-x-4 border-b border-line px-4 py-3 sm:px-6">
                <span className="w-[110px] flex-none text-base tabular-nums text-ink-3">
                  {entry.createdAt.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}
                </span>
                <span className="min-w-0 flex-1 text-base text-ink-2">{entry.text}</span>
              </div>
            ))}
          </Card>
        ) : null}

        <Card className="flex flex-col gap-4 p-6">
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-title font-semibold">Votre mois en cours</span>
            <span className="text-base text-ink-3 tabular-nums">
              {new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}
            </span>
          </div>
          {client.contentTarget > 0 ? (
            <>
              <PacingBar
                size="lg"
                fillPct={p.fillPct}
                projPct={p.projPct}
                markerLeft={p.markerLeft}
                markerLabel={`Rythme prévu · ${fr(p.expected, 1)}`}
              />
              <span className="text-lead tabular-nums">
                {published.length} contenu{published.length > 1 ? "s publiés" : " publié"} sur{" "}
                {client.contentTarget} · {p.diffLabel}
              </span>
            </>
          ) : (
            <span className="text-lead">
              {published.length} contenu{published.length > 1 ? "s publiés" : " publié"} ce mois.
            </span>
          )}
        </Card>

        {upcoming.length > 0 ? (
          <Card>
            <div className="border-b border-line px-6 py-5">
              <span className="text-title font-semibold">Ce qui arrive</span>
            </div>
            {upcoming.map(({ content }) => (
              <div key={content.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line px-4 py-4 sm:px-6">
                <span className="w-[160px] flex-none text-base font-medium text-ink-2 tabular-nums">
                  {content.scheduledAt?.toLocaleDateString("fr-FR", {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                  })}
                </span>
                <span className="clip flex-1 text-lead">{content.title}</span>
                <span className={`text-base ${toneText[CONTENT_STATUS[content.status].tone]}`}>
                  {CONTENT_STATUS[content.status].label}
                </span>
              </div>
            ))}
          </Card>
        ) : null}

        {media.length > 0 ? (
          <Card>
            <div className="flex items-center justify-between gap-4 border-b border-line px-6 py-5">
              <span className="text-title font-semibold">Vos médias</span>
              <span className="text-base text-ink-3">{media.length} derniers</span>
            </div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3 p-6">
              {media.map(({ asset }) => (
                <a
                  key={asset.id}
                  href={`/api/media/${asset.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex flex-col overflow-hidden rounded-card border border-line no-underline hover:border-line-strong hover:no-underline"
                >
                  <span className="relative block aspect-4/5 bg-slot">
                    {isVideo(asset.mimeType) ? (
                      <span className="flex h-full items-center justify-center">
                        <Eyebrow>Vidéo</Eyebrow>
                      </span>
                    ) : (
                      <Image
                        src={`/api/media/${asset.id}?format=thumb`}
                        alt={asset.filename}
                        fill
                        sizes="180px"
                        className="object-cover"
                        unoptimized
                      />
                    )}
                  </span>
                  <span className="clip px-2 py-2 text-small text-ink">{asset.filename}</span>
                </a>
              ))}
            </div>
          </Card>
        ) : null}

        {published.length > 0 ? (
          <Card>
            <div className="border-b border-line px-6 py-5">
              <span className="text-title font-semibold">Publié ce mois</span>
            </div>
            {published.map(({ content }) => (
              <div key={content.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line px-4 py-4 sm:px-6">
                <span className="w-[120px] flex-none text-base text-ink-2 tabular-nums">
                  {content.publishedAt?.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                </span>
                <span className="clip flex-1 text-lead">{content.title}</span>
                {content.publishedUrl ? (
                  <a href={content.publishedUrl} target="_blank" rel="noreferrer" className="text-base">
                    Voir
                  </a>
                ) : null}
              </div>
            ))}
          </Card>
        ) : null}

        {actions.length > 0 ? (
          <Card>
            <div className="border-b border-line px-4 py-5 sm:px-6">
              <span className="text-title font-semibold">Ce que nous attendons de vous</span>
              <p className="mt-1 text-base text-ink-2">
                Tant que ces points ne sont pas réglés, le projet reste en attente de votre côté.
              </p>
            </div>
            {actions.map((a) => (
              <a
                key={a.id}
                href={a.href}
                className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-4 no-underline hover:bg-canvas hover:no-underline sm:px-6"
              >
                <span
                  className="h-2 w-2 flex-none rounded-full"
                  style={{ background: a.urgent ? config.primaryColor : "#C9C6BF" }}
                />
                <span className="flex min-w-[180px] flex-1 flex-col">
                  <span className="clip text-lead font-medium text-ink">{a.titre}</span>
                  <span className="clip text-small text-ink-3">{a.detail}</span>
                </span>
                <span className="flex-none text-base" style={{ color: config.primaryColor }}>
                  Ouvrir →
                </span>
              </a>
            ))}
          </Card>
        ) : null}

        {projets.length > 0 ? (
          // L'ancre sert aux liens « ce qu'on attend de vous » : ils mènent au
          // projet concerné plutôt qu'en haut d'une page qu'il faut parcourir.
          <div id="projets">
          <Card>
            <div className="border-b border-line px-4 py-5 sm:px-6">
              <span className="text-title font-semibold">Vos projets web</span>
            </div>
            {projets.map(({ project, jalons, jalonsFaits }) => {
              const liste = jalonsParProjet.get(project.id) ?? [];
              return (
                <div key={project.id} className="flex flex-col gap-3 border-b border-line px-4 py-5 sm:px-6">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="flex min-w-0 flex-col">
                      <span className="eyebrow text-ink-3">
                        {PROJECT_TYPE[project.type]?.label ?? project.type}
                      </span>
                      <span className="text-lead font-medium">{project.name}</span>
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

                  {livrables
                    .filter((l) => l.projetId === project.id)
                    .map(({ livrable }) => (
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
                        <span key={j.id} className="flex items-center gap-2 text-base">
                          <span className={j.done ? "text-ok" : "text-ink-3"}>
                            {j.done ? "✓" : "○"}
                          </span>
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
                </div>
              );
            })}
          </Card>
          </div>
        ) : null}

        <Card>
          <div className="border-b border-line px-4 py-5 sm:px-6">
            <span className="text-title font-semibold">Vos documents</span>
            <p className="mt-1 text-base text-ink-2">
              Les documents que nous partageons avec vous — devis, chartes, livrables — et tout
              ce que vous souhaitez nous transmettre : logo, photos, textes.
            </p>
          </div>
          <DepotFichiers clientId={client.id} accent={config.primaryColor} />
          {fichiers.length > 0 ? (
            <div className="flex flex-col">
              {fichiers.map(({ file, auteur }) => {
                const àMoi = file.uploadedById === user.id;
                return (
                <div
                  key={file.id}
                  className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-3 sm:px-6"
                >
                  <a
                    href={`/api/client-files/${file.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="clip min-w-[160px] flex-1 text-base"
                  >
                    {file.filename}
                  </a>
                  <span className="flex-none text-small text-ink-3">
                    {formatBytes(file.sizeBytes)} ·{" "}
                    {àMoi ? "déposé par vous" : auteur ? `déposé par ${auteur}` : "déposé par l'agence"}
                  </span>
                  {àMoi ? <BoutonRetirer id={file.id} /> : null}
                </div>
                );
              })}
            </div>
          ) : null}
        </Card>

        <Card>
          <div className="border-b border-line px-4 py-5 sm:px-6">
            <span className="text-title font-semibold">Votre charte graphique</span>
            <p className="mt-1 text-base text-ink-2">
              Remplissez ce que vous savez — nous complétons le reste. C&apos;est le même document
              des deux côtés.
            </p>
          </div>
          <CharteClient
            couleurs={charte?.palette ?? []}
            polices={charte?.fonts ?? null}
            ton={charte?.voice ?? null}
            accent={config.primaryColor}
          />
        </Card>

        <p className="pb-6 text-base text-ink-3">
          {config.portalWelcome ?? "Une question ? Écrivez à votre interlocuteur habituel."}
        </p>
      </div>
    </main>
  );
}
