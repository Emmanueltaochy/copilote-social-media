import Link from "next/link";
import { PageHeader } from "@/components/shell/Screen";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Dot, Eyebrow, StatusPill } from "@/components/ui/primitives";
import { requireDepartment } from "@/lib/auth";
import { semaineDeSuivi } from "@/db/queries";
import { CONTENT_KIND, networksLabel } from "@/data/content";
import { mondayOf } from "@/lib/ads";
import { decalerSemaine, etatDuContenu, joursDeLaSemaine } from "@/lib/suivi";
import { cn } from "@/lib/cn";
import { toneBorder, toneText } from "@/lib/tone";

export const dynamic = "force-dynamic";

const JOURS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

/**
 * Le suivi de la semaine : l'écran d'accueil de l'agence.
 *
 * Un calendrier ordinaire ne montre que les contenus qui existent, et affiche
 * donc une semaine vide et rassurante alors qu'il manque six posts. Celui-ci
 * montre trois choses ensemble : ce qui est programmé jour par jour, ce qui
 * traîne sans date, et l'écart entre ce qu'on a vendu au mois et ce qui existe
 * réellement.
 *
 * La couleur ne vient pas du statut mais de la distance à l'échéance : « en
 * création » est parfait à dix jours de la sortie et alarmant la veille. Seul
 * ce qui est en retard ou doit partir aujourd'hui sans être prêt s'allume en
 * rouge — sans quoi tout serait rouge et plus rien ne se verrait.
 */
export default async function SuiviPage({
  searchParams,
}: {
  searchParams: Promise<{ semaine?: string }>;
}) {
  // Le suivi porte sur le calendrier éditorial : il n'a de sens que pour le
  // pôle social. Quelqu'un qui ne fait que du web est renvoyé à son tableau,
  // comme le faisait le cockpit qui occupait cette adresse.
  await requireDepartment("social");
  const { semaine: demandée } = await searchParams;

  const now = new Date();
  // Une valeur bricolée dans l'adresse ne doit pas atteindre la requête : on
  // n'accepte qu'un lundi bien formé, et on retombe sinon sur cette semaine.
  const lundi =
    demandée && /^\d{4}-\d{2}-\d{2}$/.test(demandée) && mondayOf(new Date(`${demandée}T00:00:00`)) === demandée
      ? demandée
      : mondayOf(now);

  const { programmes, sansDate, parClient } = await semaineDeSuivi(lundi, now, "social");

  if (parClient.length === 0) {
    return (
      <>
        <PageHeader title="Suivi de la semaine" sub="Rien à suivre pour l'instant" />
        <EmptyState
          eyebrow="Premier pas"
          title="Aucun client pour l'instant"
          actionLabel="Ajouter un client"
          actionHref="/clients"
        >
          Le suivi montre, jour par jour, ce qui doit sortir et ce qui manque encore.
          Commence par créer un client et son engagement mensuel : tout le reste en découle.
        </EmptyState>
      </>
    );
  }

  const jours = joursDeLaSemaine(lundi);
  const aujourdhui = mondayOf(now) === lundi ? now.getDate() : -1;

  // Ce qui manque au contrat, client par client. Un contenu « existe » dès
  // qu'il est noté, même à l'état d'idée : ce qui manque est ce qui n'est
  // nulle part.
  const manques = parClient
    .map((c) => ({ ...c, manquants: Math.max(0, c.cible - c.existants) }))
    .filter((c) => c.manquants > 0);

  const états = new Map(programmes.map((p) => [p.content.id, etatDuContenu(p.content, now)]));
  const enRetard = programmes.filter((p) => états.get(p.content.id)?.cle === "retard").length;
  const duJour = programmes.filter(
    (p) => états.get(p.content.id)?.cle === "aujourdhui" && états.get(p.content.id)?.alerte,
  ).length;
  const àFinir = programmes.filter((p) => états.get(p.content.id)?.alerte).length - enRetard - duJour;
  const totalManquants = manques.reduce((n, c) => n + c.manquants, 0);

  const libelléSemaine = `${jours[0].toLocaleDateString("fr-FR", { day: "numeric", month: "long" })} — ${jours[6].toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}`;

  /** Une pastille de tête : le nombre d'abord, ce qu'il désigne ensuite. */
  const alerte = (n: number, label: string, tone: "alert" | "warn" | "info" | "neutral", href: string) => (
    <Link
      key={label}
      href={href}
      className={cn(
        "flex min-w-[150px] flex-1 flex-col gap-[2px] rounded-card border px-4 py-3 no-underline hover:no-underline",
        n === 0
          ? "border-line bg-paper"
          : tone === "alert"
            ? "border-alert-line bg-alert-bg"
            : tone === "warn"
              ? "border-warn bg-warn-bg"
              : "border-line bg-paper",
      )}
    >
      <span className={cn("text-display font-semibold tabular-nums", n === 0 ? "text-ink-3" : toneText[tone])}>
        {n}
      </span>
      <span className={cn("text-small", n === 0 ? "text-ink-3" : "text-ink-2")}>{label}</span>
    </Link>
  );

  return (
    <>
      <PageHeader
        title="Suivi de la semaine"
        sub={`${libelléSemaine} · ${programmes.length} ${programmes.length > 1 ? "contenus programmés" : "contenu programmé"}`}
      />

      <div className="min-h-0 flex-1 overflow-auto px-4 pt-4 pb-6 lg:px-5">
        <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-4">
          {/* Ce qui ne va pas, en gros et en premier. Un chiffre à zéro reste
              affiché, en gris : sa présence dit qu'on a regardé. */}
          <div className="flex flex-wrap gap-3">
            {alerte(enRetard, enRetard > 1 ? "en retard" : "en retard", "alert", "/production")}
            {alerte(duJour, "à publier aujourd'hui, pas prêts", "alert", "/a-publier")}
            {alerte(àFinir > 0 ? àFinir : 0, "à finir sous 48 h", "warn", "/production")}
            {alerte(sansDate.length, "sans date", "warn", "/calendrier")}
            {alerte(totalManquants, "à créer ce mois-ci", "info", "/preparer")}
          </div>

          {/* Navigation de semaine. L'adresse porte le lundi : une semaine se
              met en favori et se partage. */}
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/?semaine=${decalerSemaine(lundi, -1)}`}
              className="rounded-control border border-line bg-paper px-3 py-[6px] text-base text-ink-2 no-underline hover:border-line-strong hover:text-ink hover:no-underline"
            >
              ← Semaine précédente
            </Link>
            <Link
              href="/"
              className={cn(
                "rounded-control border px-3 py-[6px] text-base no-underline hover:no-underline",
                mondayOf(now) === lundi
                  ? "border-ink bg-ink text-paper"
                  : "border-line bg-paper text-ink-2 hover:border-line-strong hover:text-ink",
              )}
            >
              Cette semaine
            </Link>
            <Link
              href={`/?semaine=${decalerSemaine(lundi, 1)}`}
              className="rounded-control border border-line bg-paper px-3 py-[6px] text-base text-ink-2 no-underline hover:border-line-strong hover:text-ink hover:no-underline"
            >
              Semaine suivante →
            </Link>
          </div>

          {/* Sept colonnes sur un écran, sept blocs empilés sur un téléphone :
              à cette largeur, une colonne de contenu ne se lit plus. */}
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-7">
            {jours.map((jour, i) => {
              const items = programmes.filter(
                (p) =>
                  p.content.scheduledAt &&
                  p.content.scheduledAt.getDate() === jour.getDate() &&
                  p.content.scheduledAt.getMonth() === jour.getMonth(),
              );
              const alerteDuJour = items.some((p) => états.get(p.content.id)?.alerte);
              const cJour = jour.getDate() === aujourdhui && jour.getMonth() === now.getMonth();

              return (
                <div
                  key={i}
                  data-jour={jour.toISOString().slice(0, 10)}
                  className={cn(
                    "flex flex-col gap-2 rounded-card border p-2",
                    cJour ? "border-ink-3 bg-paper" : "border-line bg-paper",
                  )}
                >
                  {/* Le quantième et le nombre de contenus sont deux nombres
                      voisins : sans mise en forme distincte, « Mar 1 » se lit
                      « un contenu mardi » aussi bien que « mardi 1er ». Le
                      premier est écrit en gros, le second dans une pastille. */}
                  <div className="flex items-center justify-between gap-2 px-1">
                    <span className="flex items-baseline gap-[5px]">
                      <span className={cn("text-micro uppercase", cJour ? "text-ink-2" : "text-ink-3")}>
                        {JOURS[i].slice(0, 3)}
                      </span>
                      <span className={cn("text-lead tabular-nums", cJour ? "font-semibold text-ink" : "font-medium text-ink-2")}>
                        {jour.getDate()}
                      </span>
                      {jour.getDate() === 1 || i === 0 ? (
                        <span className="text-micro text-ink-3">
                          {jour.toLocaleDateString("fr-FR", { month: "short" })}
                        </span>
                      ) : null}
                    </span>
                    <span className="flex items-center gap-[5px]">
                      {alerteDuJour ? <Dot tone="alert" solid size={6} /> : null}
                      {items.length > 0 ? (
                        <span className="rounded-full bg-slot px-[6px] py-[1px] text-micro tabular-nums text-ink-2">
                          {items.length}
                        </span>
                      ) : null}
                    </span>
                  </div>

                  {items.length === 0 ? (
                    <span className="px-1 pb-1 text-micro text-ink-3">—</span>
                  ) : (
                    items.map(({ content, clientName }) => {
                      const état = états.get(content.id)!;
                      return (
                        <Link
                          key={content.id}
                          href={`/contenu/${content.id}`}
                          data-contenu={content.id}
                          data-etat={état.cle}
                          className={cn(
                            "flex flex-col gap-[3px] rounded-control border border-l-[3px] bg-canvas px-2 py-[6px] no-underline hover:no-underline",
                            toneBorder[état.tone],
                          )}
                        >
                          <span className="clip text-small font-medium text-ink">{clientName}</span>
                          {/* Le titre, tout de suite après le client : sans lui
                              on voit qu'il y a deux posts jeudi sans savoir
                              lesquels, et il faut ouvrir pour reconnaître. */}
                          <span className="clip text-small text-ink-2">{content.title}</span>
                          <span className="clip text-micro text-ink-3">
                            {CONTENT_KIND[content.kind] ?? content.kind} · {networksLabel(content)}
                          </span>
                          <span className={cn("clip text-micro", toneText[état.tone])}>{état.label}</span>
                        </Link>
                      );
                    })
                  )}
                </div>
              );
            })}
          </div>

          {/* Ce qui n'a pas de place dans la grille, et que la grille ne peut
              donc pas rappeler : les contenus sans date, et les contenus qui
              n'existent pas encore. */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card className="flex flex-col gap-3 p-4">
              <div>
                <Eyebrow>Sans date</Eyebrow>
                <p className="text-small text-ink-2">
                  Ces contenus existent mais ne sont posés nulle part : ils ne sortiront pas
                  tant qu&apos;ils n&apos;ont pas de jour.
                </p>
              </div>
              {sansDate.length === 0 ? (
                <p className="text-base text-ink-3">Tout est daté.</p>
              ) : (
                <div className="flex flex-col">
                  {sansDate.slice(0, 8).map(({ content, clientName }) => (
                    <Link
                      key={content.id}
                      href={`/contenu/${content.id}`}
                      data-sans-date={content.id}
                      className="flex flex-wrap items-center gap-2 border-b border-line py-2 no-underline last:border-b-0 hover:no-underline"
                    >
                      <span className="w-[130px] flex-none text-base font-medium text-ink">
                        {clientName}
                      </span>
                      <span className="clip min-w-0 flex-1 text-base text-ink-2">{content.title}</span>
                      <StatusPill tone="warn">à programmer</StatusPill>
                    </Link>
                  ))}
                  {sansDate.length > 8 ? (
                    <span className="pt-2 text-small text-ink-3">
                      et {sansDate.length - 8} autre{sansDate.length - 8 > 1 ? "s" : ""}.
                    </span>
                  ) : null}
                </div>
              )}
            </Card>

            <Card className="flex flex-col gap-3 p-4">
              <div>
                <Eyebrow>À créer ce mois-ci</Eyebrow>
                <p className="text-small text-ink-2">
                  L&apos;écart entre l&apos;engagement vendu et ce qui existe, même à
                  l&apos;état d&apos;idée. C&apos;est ce qui manquera si personne ne s&apos;en
                  occupe.
                </p>
              </div>
              {manques.length === 0 ? (
                <p className="text-base text-ok">Tous les engagements du mois sont couverts.</p>
              ) : (
                <div className="flex flex-col">
                  {manques.map((c) => (
                    <Link
                      key={c.id}
                      href={`/preparer?client=${c.id}`}
                      data-manque={c.id}
                      className="flex flex-wrap items-center gap-2 border-b border-line py-2 no-underline last:border-b-0 hover:no-underline"
                    >
                      <span className="w-[130px] flex-none text-base font-medium text-ink">
                        {c.nom}
                      </span>
                      <span className="clip min-w-0 flex-1 text-base tabular-nums text-ink-2">
                        {c.existants} / {c.cible} prévus · {c.publies} publiés
                      </span>
                      <StatusPill tone="alert">
                        {c.manquants} à créer
                      </StatusPill>
                    </Link>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
