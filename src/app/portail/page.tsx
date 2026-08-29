import Link from "next/link";
import { and, desc, eq, gte, isNotNull, lt, sql as raw } from "drizzle-orm";
import { db, activity, contents } from "@/db";
import { Card } from "@/components/ui/Card";
import { PacingBar } from "@/components/ui/PacingBar";
import { Eyebrow } from "@/components/ui/primitives";
import { CONTENT_STATUS } from "@/data/content";
import { fr, monthLabel, monthRange, pace } from "@/lib/pacing";
import { toneText } from "@/lib/tone";
import { actionsDuClient, compteursPortail } from "@/db/web-queries";
import { contextePortail } from "@/lib/portail";

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

  const [published, upcoming, answers, actions, compteurs] = await Promise.all([
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
  ]);

  const p = pace(published.length, client.contentTarget);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-[2px]">
        <Eyebrow>
          {client.shortName} · {monthLabel()}
        </Eyebrow>
        <h1 className="text-display font-semibold tracking-[-0.01em]">Bonjour {user.name}</h1>
      </div>

      {/* Ce qui attend une réponse passe devant tout le reste : c'est la seule
          raison pour laquelle un client ouvre son espace un mardi matin. */}
      {compteurs.aValider > 0 ? (
        <Link
          href="/portail/valider"
          className="flex flex-wrap items-center justify-between gap-3 rounded-card border px-5 py-4 no-underline hover:no-underline"
          style={{ borderColor: config.primaryColor, background: `${config.primaryColor}12` }}
        >
          <span className="flex flex-col">
            <span className="text-title font-semibold text-ink">
              {compteurs.aValider} élément{compteurs.aValider > 1 ? "s attendent" : " attend"} votre
              validation
            </span>
            <span className="text-base text-ink-2">
              {compteurs.contenus > 0
                ? `${compteurs.contenus} contenu${compteurs.contenus > 1 ? "s" : ""}`
                : ""}
              {compteurs.contenus > 0 && compteurs.livrables > 0 ? " · " : ""}
              {compteurs.livrables > 0
                ? `${compteurs.livrables} maquette${compteurs.livrables > 1 ? "s" : ""}`
                : ""}
            </span>
          </span>
          <span className="text-base font-medium" style={{ color: config.primaryColor }}>
            Ouvrir →
          </span>
        </Link>
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

      {client.contentTarget > 0 || published.length > 0 ? (
        <Card className="flex flex-col gap-4 p-6">
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-title font-semibold">Votre mois en cours</span>
            <span className="text-base tabular-nums text-ink-3">
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
      ) : null}

      {upcoming.length > 0 ? (
        <Card>
          <div className="border-b border-line px-6 py-5">
            <span className="text-title font-semibold">Ce qui arrive</span>
          </div>
          {upcoming.map(({ content }) => (
            <div
              key={content.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line px-4 py-4 sm:px-6"
            >
              <span className="w-[160px] flex-none text-base font-medium tabular-nums text-ink-2">
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

      {published.length > 0 ? (
        <Card>
          <div className="border-b border-line px-6 py-5">
            <span className="text-title font-semibold">Publié ce mois</span>
          </div>
          {published.map(({ content }) => (
            <div
              key={content.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line px-4 py-4 sm:px-6"
            >
              <span className="w-[120px] flex-none text-base tabular-nums text-ink-2">
                {content.publishedAt?.toLocaleDateString("fr-FR", {
                  day: "numeric",
                  month: "short",
                })}
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

      {answers.length > 0 ? (
        <Card>
          <div className="border-b border-line px-6 py-5">
            <span className="text-title font-semibold">Vos dernières réponses</span>
          </div>
          {answers.map(({ entry }) => (
            <div
              key={entry.id}
              className="flex flex-wrap items-baseline gap-x-4 border-b border-line px-4 py-3 sm:px-6"
            >
              <span className="w-[110px] flex-none text-base tabular-nums text-ink-3">
                {entry.createdAt.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}
              </span>
              <span className="min-w-0 flex-1 text-base text-ink-2">{entry.text}</span>
            </div>
          ))}
        </Card>
      ) : null}
    </div>
  );
}
