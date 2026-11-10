import Link from "next/link";
import { and, desc, eq, gte, isNotNull, lt, sql as raw } from "drizzle-orm";
import { db, activity, contents } from "@/db";
import { PacingBar } from "@/components/ui/PacingBar";
import { Icon, type IconName } from "@/components/ui/Icon";
import { NetworkDot, NetworkStack, Panel, StatusTag, countdown, networkLabel, whenLabel } from "@/components/home/bits";
import { fr, monthLabel, monthRange, pace } from "@/lib/pacing";
import { formatBytes } from "@/lib/storage";
import { actionsDuClient, compteursPortail, fichiersDuClient } from "@/db/web-queries";
import { coversFor, promosPourClient } from "@/db/queries";
import { Cover } from "@/components/ui/Cover";
import { CONTENT_KIND } from "@/data/content";
import { BanniereClient } from "./Banniere";
import { contextePortail } from "@/lib/portail";
import { versionVideo } from "@/lib/portail-video";
import { VideoAccueil } from "./VideoAccueil";
import { audience, topPostThisMonth } from "@/db/home-queries";
import { AudiencePanel } from "@/components/home/AudiencePanel";

export const dynamic = "force-dynamic";

/**
 * L'accueil du portail : ce qu'on attend du client, et où en est son mois.
 *
 * Rien d'autre. Les médias, les documents et les projets ont leur page — les
 * empiler ici obligeait à faire défiler dix écrans pour retrouver une photo.
 */
export default async function PortailPage() {
  const { user, client, config } = await contextePortail();
  const { start, end } = monthRange();

  const poles = client.departments?.length ? client.departments : ["social"];

  const [published, upcoming, aValider, answers, actions, compteurs, bannieres, fichiers, aud, top] = await Promise.all([
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
      .where(and(eq(contents.clientId, client.id), gte(contents.scheduledAt, new Date())))
      .orderBy(contents.scheduledAt)
      .limit(6),
    // Ce qui attend une réponse, en entier et non seulement compté : un
    // bandeau qui dit « 3 éléments attendent » oblige à cliquer pour savoir
    // lesquels, et c'est justement ce qu'on vient voir.
    db
      .select({ content: contents })
      .from(contents)
      .where(and(eq(contents.clientId, client.id), eq(contents.status, "validation")))
      .orderBy(desc(contents.submittedAt)),
    // Les réponses déjà données. Une confirmation qui disparaît avec la carte
    // ne prouve rien : passé le clic, le client doit pouvoir vérifier que sa
    // réponse est bien arrivée, même après avoir rechargé la page.
    db
      .select({ entry: activity })
      .from(activity)
      .where(and(eq(activity.clientId, client.id), raw`${activity.text} like '%par le client%'`))
      .orderBy(desc(activity.createdAt))
      .limit(5),
    actionsDuClient(client.id),
    compteursPortail(client.id),
    promosPourClient(poles),
    // Les derniers documents partagés, pour qu'un devis ou une charte se
    // retrouve depuis l'accueil sans passer par l'onglet.
    fichiersDuClient(client.id, true),
    // Les chiffres de ses réseaux (relevés Metricool), strictement les siens.
    audience(90, client.id),
    topPostThisMonth(new Date(), client.id),
  ]);

  // Les vignettes de ce qui attend : on ne juge pas un post sur son titre.
  const couvertures = await coversFor([
    ...aValider.map((a) => a.content.id),
    ...upcoming.map((u) => u.content.id),
  ]);
  const documents = fichiers.filter((f) => f.file.uploadedById !== user.id).slice(0, 4);
  const now = new Date();
  const [prochain, ...ensuite] = upcoming.map((u) => u.content);

  const p = pace(published.length, client.contentTarget);

  const reseaux = (c: (typeof upcoming)[number]["content"]) =>
    c.networks && c.networks.length ? c.networks : [c.network];

  return (
    <div className="flex flex-col gap-5">
      {/* Bonjour, et les trois chiffres qui comptent pour le client. */}
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-1">
          <span className="eyebrow text-ink-3">
            {client.shortName} · {monthLabel()}
          </span>
          <h1 className="text-[34px] leading-[1.05] font-bold tracking-[-0.03em] sm:text-[40px]">
            Bonjour {user.name}
          </h1>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:flex sm:gap-6">
          <Chiffre
            icon="check"
            valeur={compteurs.aValider}
            libelle={compteurs.aValider > 1 ? "attendent votre validation" : "attend votre validation"}
            alerte={compteurs.aValider > 0}
          />
          <Chiffre
            icon="send"
            valeur={client.contentTarget > 0 ? `${published.length}/${client.contentTarget}` : published.length}
            libelle={published.length > 1 ? "publiés ce mois" : "publié ce mois"}
          />
          <Chiffre icon="calendar" valeur={upcoming.length} libelle="à venir" />
        </div>
      </div>

      {/* La vidéo d'accueil : en grand à la première visite, puis une simple
          vignette pour la revoir, qui laisse remonter le reste. */}
      {versionVideo(config.portalVideoPath) ? (
        <VideoAccueil version={versionVideo(config.portalVideoPath)!} couleur={config.primaryColor} personne={user.id} />
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        {/* Ce qui attend une réponse passe devant tout le reste : c'est la
            seule raison pour laquelle un client ouvre son espace un mardi
            matin. Les contenus sont montrés, pas comptés — avec leur visuel,
            puisque c'est sur lui que porte la réponse. */}
        <Panel
          title={
            <span className="flex items-center gap-2">
              À valider
              {compteurs.aValider > 0 ? (
                <span className="flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-alert px-[6px] text-small font-bold text-white tabular-nums">
                  {compteurs.aValider}
                </span>
              ) : null}
            </span>
          }
          action={{ href: "/portail/valider", label: "Tout voir" }}
        >
          {compteurs.aValider === 0 ? (
            <p className="rounded-[18px] bg-mute px-4 py-5 text-base text-ink-2">
              Rien n&apos;attend votre réponse pour le moment. Vous recevrez un courriel dès
              qu&apos;un contenu ou une maquette sera prêt.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {aValider.map(({ content }) => (
                <Link
                  key={content.id}
                  href={`/portail/contenu/${content.id}`}
                  data-a-valider={content.id}
                  className="flex items-center gap-3 rounded-[18px] border border-line p-2 pr-3 no-underline hover:border-line-strong hover:no-underline"
                >
                  <Cover
                    asset={couvertures.get(content.id)}
                    ratio="1/1"
                    className="w-[56px] flex-none rounded-[12px] sm:w-[64px]"
                    label=""
                  />
                  <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
                    <span className="clip text-base font-semibold text-ink">{content.title}</span>
                    <span className="clip text-small text-ink-3">
                      {CONTENT_KIND[content.kind] ?? content.kind}
                      {content.scheduledAt
                        ? ` · prévu le ${content.scheduledAt.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}`
                        : ""}
                    </span>
                  </span>
                  <span className="flex flex-none items-center gap-1 rounded-full bg-night px-[14px] py-[7px] text-small font-semibold text-white">
                    <Icon name="eye" size={14} /> Voir
                  </span>
                </Link>
              ))}
              {compteurs.livrables > 0 ? (
                <Link
                  href="/portail/valider"
                  className="flex items-center justify-between gap-3 rounded-[18px] bg-mute px-4 py-3 text-base text-ink no-underline hover:no-underline"
                >
                  <span>
                    {compteurs.livrables} maquette{compteurs.livrables > 1 ? "s" : ""} à approuver
                  </span>
                  <Icon name="arrowUpRight" size={16} />
                </Link>
              ) : null}
            </div>
          )}
        </Panel>

        <div className="flex min-w-0 flex-col gap-5">
          {client.contentTarget > 0 || published.length > 0 ? (
            <Panel
              title="Votre mois en cours"
              right={
                <span className="text-small tabular-nums text-ink-3">
                  {now.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}
                </span>
              }
            >
              {client.contentTarget > 0 ? (
                <div className="flex flex-col gap-4">
                  <span className="flex items-baseline gap-2">
                    <span className="text-[34px] leading-none font-bold tracking-[-0.03em] tabular-nums">
                      {published.length}
                    </span>
                    <span className="text-base text-ink-2">
                      sur {client.contentTarget} contenu{client.contentTarget > 1 ? "s" : ""} · {p.diffLabel}
                    </span>
                  </span>
                  <PacingBar
                    size="lg"
                    fillPct={p.fillPct}
                    projPct={p.projPct}
                    markerLeft={p.markerLeft}
                    markerLabel={`Rythme prévu · ${fr(p.expected, 1)}`}
                  />
                </div>
              ) : (
                <span className="text-lead">
                  {published.length} contenu{published.length > 1 ? "s publiés" : " publié"} ce mois.
                </span>
              )}
            </Panel>
          ) : null}

          {actions.length > 0 ? (
            <Panel title="Ce que nous attendons de vous">
              <p className="-mt-2 mb-3 text-small text-ink-3">
                Tant que ces points ne sont pas réglés, le projet reste en attente de votre côté.
              </p>
              <div className="flex flex-col gap-2">
                {actions.map((a) => (
                  <a
                    key={a.id}
                    href={a.href}
                    className="flex items-center gap-3 rounded-[18px] border border-line px-4 py-3 no-underline hover:border-line-strong hover:no-underline"
                  >
                    <span className={`h-2 w-2 flex-none rounded-full ${a.urgent ? "bg-alert" : "bg-line-strong"}`} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="clip text-base font-semibold text-ink">{a.titre}</span>
                      <span className="clip text-small text-ink-3">{a.detail}</span>
                    </span>
                    <Icon name="arrowUpRight" size={16} className="flex-none text-ink-2" />
                  </a>
                ))}
              </div>
            </Panel>
          ) : null}
        </div>
      </div>

      {/* Les offres de l'agence viennent après ce qu'on attend du client : une
          bannière placée devant une validation en retard ferait manquer la
          validation, et c'est pour elle qu'il est venu. */}
      {bannieres.map((b) => (
        <BanniereClient key={b.id} banniere={b} accent={config.primaryColor} />
      ))}

      {prochain ? (
        <Panel title="Ce qui arrive">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
            {/* La prochaine publication, en grand, avec son compte à rebours. */}
            <Link
              href={`/portail/contenu/${prochain.id}`}
              className="flex gap-4 rounded-[22px] bg-night p-3 text-white no-underline hover:no-underline sm:p-4"
            >
              <Cover
                asset={couvertures.get(prochain.id)}
                ratio="4/5"
                className="w-[96px] flex-none rounded-[16px] sm:w-[140px]"
                label=""
              />
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-small text-night-ink">part dans</span>
                <span className="text-[26px] leading-none font-bold tracking-[-0.02em] tabular-nums sm:text-[32px]">
                  {countdown(prochain.scheduledAt!, now)}
                </span>
                <span className="flex items-center gap-1 text-small text-night-ink">
                  <Icon name="clock" size={14} /> {whenLabel(prochain.scheduledAt!, now)}
                </span>
                <span className="mt-1 line-clamp-2 text-base font-medium">{prochain.title}</span>
                <span className="mt-auto flex items-center gap-2 pt-2">
                  <NetworkStack networks={reseaux(prochain)} size={22} />
                </span>
              </span>
            </Link>

            {ensuite.length > 0 ? (
              <div className="flex flex-col gap-2">
                <span className="eyebrow text-ink-3">Ensuite</span>
                {ensuite.map((c) => (
                  <Link
                    key={c.id}
                    href={`/portail/contenu/${c.id}`}
                    className="flex items-center gap-3 rounded-[18px] border border-line p-2 pr-3 no-underline hover:border-line-strong hover:no-underline"
                  >
                    <Cover asset={couvertures.get(c.id)} ratio="1/1" className="w-[44px] flex-none rounded-[10px]" label="" />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="clip text-base font-semibold text-ink">{c.title}</span>
                      <span className="clip text-small text-ink-3">{whenLabel(c.scheduledAt!, now)}</span>
                    </span>
                    <StatusTag status={c.status} className="hidden sm:inline-flex" />
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        </Panel>
      ) : null}

      {/* Ses réseaux : rien ne s'affiche tant que le compte n'est pas relevé. */}
      {aud && aud.points.length ? (
        <div className={`grid gap-5 ${top ? "lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]" : ""}`}>
          <Panel title="Vos réseaux" action={{ href: "/portail/statistiques", label: "Vos statistiques", icon: "chart" }}>
            <div className="mb-5 flex flex-wrap gap-2">
              {aud.networks.map((n) => {
                const base = n.current - n.gained30;
                const pc = base > 0 ? (n.gained30 / base) * 100 : null;
                return (
                  <span key={n.network} className="flex items-center gap-3 rounded-[16px] border border-line px-3 py-2">
                    <NetworkDot network={n.network} size={26} />
                    <span className="flex flex-col leading-tight">
                      <span className="text-base font-bold tabular-nums">{n.current.toLocaleString("fr-FR")}</span>
                      <span className="text-micro text-ink-3">
                        {networkLabel(n.network)}
                        {pc != null ? (
                          <span className={n.gained30 >= 0 ? "text-ok" : "text-alert"}>
                            {" "}
                            · {n.gained30 >= 0 ? "+" : ""}
                            {pc.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} % en 30 j
                          </span>
                        ) : null}
                      </span>
                    </span>
                  </span>
                );
              })}
            </div>
            <AudiencePanel data={aud} />
          </Panel>
          {top ? (
            <Panel title="Votre meilleure publication du mois">
              <a
                href={top.url ?? "#"}
                target="_blank"
                rel="noreferrer"
                className="group relative flex min-h-[280px] flex-1 flex-col justify-end overflow-hidden rounded-[22px] bg-night p-4 text-white no-underline hover:no-underline"
              >
                {top.imageUrl ? (
                  // Image hébergée par le réseau social.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={top.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-80" referrerPolicy="no-referrer" />
                ) : null}
                <span className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0)_30%,rgba(0,0,0,.82))]" />
                {top.multiple && top.multiple >= 1.5 ? (
                  <span className="absolute top-4 left-4 rounded-full bg-accent px-3 py-[3px] text-small font-semibold text-accent-ink">
                    {top.multiple.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}× votre portée habituelle
                  </span>
                ) : null}
                <span className="relative flex items-center gap-2 text-small">
                  <NetworkDot network={top.network} size={22} />
                  {top.publishedAt.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}
                </span>
                <p className="relative mt-2 mb-3 line-clamp-2 text-base font-medium">{top.text || "Publication sans texte"}</p>
                <span className="relative flex gap-6">
                  <span className="flex flex-col">
                    <span className="text-[22px] leading-none font-bold">{Math.max(top.reach, top.views).toLocaleString("fr-FR")}</span>
                    <span className="text-micro text-white/70">{top.reach >= top.views ? "personnes touchées" : "vues"}</span>
                  </span>
                  <span className="flex flex-col">
                    <span className="text-[22px] leading-none font-bold">{top.interactions.toLocaleString("fr-FR")}</span>
                    <span className="text-micro text-white/70">interactions</span>
                  </span>
                </span>
              </a>
            </Panel>
          ) : null}
        </div>
      ) : null}

      <div
        className={`grid gap-5 ${
          [published.length > 0, documents.length > 0, answers.length > 0].filter(Boolean).length >= 3
            ? "lg:grid-cols-3"
            : [published.length > 0, documents.length > 0, answers.length > 0].filter(Boolean).length === 2
              ? "lg:grid-cols-2"
              : ""
        }`}
      >
        {published.length > 0 ? (
          <Panel title="Publié ce mois">
            <div className="flex flex-col">
              {published.map(({ content }) => (
                <div
                  key={content.id}
                  className="flex items-center gap-3 border-b border-line py-3 first:pt-0 last:border-b-0 last:pb-0"
                >
                  <span className="w-[52px] flex-none text-small font-semibold tabular-nums text-ink-3">
                    {content.publishedAt?.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                  </span>
                  <span className="clip min-w-0 flex-1 text-base text-ink">{content.title}</span>
                  {content.publishedUrl ? (
                    <a
                      href={content.publishedUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex-none rounded-full border border-line px-3 py-[5px] text-small font-medium text-ink no-underline hover:border-line-strong hover:no-underline"
                    >
                      Voir ↗
                    </a>
                  ) : null}
                </div>
              ))}
            </div>
          </Panel>
        ) : null}

        {documents.length > 0 ? (
          <Panel title="Derniers documents" action={{ href: "/portail/documents", label: "Vos documents" }}>
            <div className="flex flex-col gap-2">
              {documents.map((f) => (
                <a
                  key={f.file.id}
                  href={`/api/client-files/${f.file.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-3 rounded-[16px] border border-line px-3 py-[10px] no-underline hover:border-line-strong hover:no-underline"
                >
                  <span className="flex h-9 w-9 flex-none items-center justify-center rounded-[11px] bg-mute text-ink-2">
                    <Icon name="layers" size={16} />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="clip text-base font-medium text-ink">{f.file.label || f.file.filename}</span>
                    <span className="clip text-small text-ink-3">
                      {formatBytes(f.file.sizeBytes)} ·{" "}
                      {f.file.createdAt.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}
                    </span>
                  </span>
                </a>
              ))}
            </div>
          </Panel>
        ) : null}

        {answers.length > 0 ? (
          <Panel title="Vos dernières réponses">
            <div className="flex flex-col">
              {answers.map(({ entry }) => (
                <div key={entry.id} className="flex gap-3 border-b border-line py-3 first:pt-0 last:border-b-0 last:pb-0">
                  <span className="mt-[2px] flex h-7 w-7 flex-none items-center justify-center rounded-full bg-ok-bg text-ok">
                    <Icon name="check" size={14} />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-base text-ink">{entry.text}</span>
                    <span className="text-small tabular-nums text-ink-3">
                      {entry.createdAt.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </Panel>
        ) : null}
      </div>
    </div>
  );
}

/** Un chiffre clé de l'en-tête, façon Murmura : pastille ronde, valeur, légende. */
function Chiffre({
  icon,
  valeur,
  libelle,
  alerte = false,
}: {
  icon: IconName;
  valeur: number | string;
  libelle: string;
  alerte?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col items-start gap-2 rounded-[18px] border border-line bg-paper p-3 shadow-soft sm:flex-row sm:items-center sm:gap-3 sm:border-none sm:bg-transparent sm:p-0 sm:shadow-none">
      <span
        className={`flex h-10 w-10 flex-none items-center justify-center rounded-full ${alerte ? "bg-alert text-white" : "bg-paper text-ink shadow-soft"}`}
      >
        <Icon name={icon} size={17} />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-[22px] leading-none font-bold tracking-[-0.02em] tabular-nums">{valeur}</span>
        <span className="text-small leading-tight text-ink-3">{libelle}</span>
      </span>
    </div>
  );
}
