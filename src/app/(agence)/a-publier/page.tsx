import Link from "next/link";
import type { ReactNode } from "react";
import { scopedClient } from "@/lib/scope";
import { PageHeader } from "@/components/shell/Screen";
import { Card, CardHead } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { requireDepartment } from "@/lib/auth";
import {
  listClientsWithPace,
  listPublishedToday,
  listReadyToPublish,
  listScheduledTodayNotReady,
} from "@/db/queries";
import { CONTENT_STATUS, NETWORK_LABEL, networksLabel } from "@/data/content";
import { cn } from "@/lib/cn";
import { metricoolConfig } from "@/lib/metricool";
import { publicationChecks, realInstant, STATE_LABEL, wallNow } from "@/lib/publication";
import { markPublished } from "../contenu/actions";
import { ProgrammerTout, ProgrammerUn, VerifierTout } from "./Boutons";

type Ligne = Awaited<ReturnType<typeof listReadyToPublish>>[number];

/**
 * « aujourd'hui 11:00 », « mardi 3 sept. 09:00 », « sans date ».
 * Les dates de Pilot sont l'heure de La Réunion écrite en UTC : on lit en UTC.
 */
function quand(d: Date | null, now: Date): string {
  if (!d) return "Sans date";
  const jour = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const aujourdhui = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const heure = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
  const écart = Math.round((jour - aujourdhui) / 86_400_000);
  if (écart === 0) return `Aujourd'hui ${heure}`;
  if (écart === 1) return `Demain ${heure}`;
  if (écart === -1) return `Hier ${heure}`;
  return `${d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })} ${heure}`;
}

function Rangee({
  ligne,
  now,
  tone = "normal",
  children,
  note,
}: {
  ligne: Ligne;
  now: Date;
  tone?: "normal" | "alert" | "calme";
  children?: ReactNode;
  note?: ReactNode;
}) {
  const { content, clientName } = ligne;
  return (
    <div className={cn("flex flex-wrap items-center gap-3 border-b border-line px-5 py-3", tone === "alert" ? "bg-alert-wash" : "bg-paper")}>
      <span
        className={cn(
          "w-[150px] flex-none text-base font-medium tabular-nums",
          tone === "alert" ? "text-alert" : tone === "calme" ? "text-ink-2" : "text-ink",
        )}
      >
        {quand(content.scheduledAt, now)}
      </span>
      <span className="flex min-w-[200px] flex-1 flex-col">
        <Link href={`/contenu/${content.id}`} className="clip text-base font-medium text-ink no-underline hover:underline">
          {content.title}
        </Link>
        <span className="clip text-small text-ink-3">
          {clientName} · {networksLabel(content)}
        </span>
        {note ? <span className="text-small">{note}</span> : null}
      </span>
      {children}
    </div>
  );
}

function LienManuel({ id, fort }: { id: string; fort?: boolean }) {
  return (
    <form action={markPublished} className="flex min-w-[260px] flex-1 items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <input
        name="url"
        type="url"
        required
        placeholder="Coller le lien du post publié…"
        className="min-w-0 flex-1 rounded-control border border-line bg-paper px-2 py-[6px] text-small outline-none focus:border-gold"
      />
      <button
        type="submit"
        className={cn(
          "flex-none cursor-pointer rounded-control border px-[10px] py-[6px] text-small font-medium",
          fort ? "border-ink bg-ink text-paper hover:opacity-85" : "border-line bg-paper text-ink-2 hover:border-line-strong hover:text-ink",
        )}
      >
        Publié
      </button>
    </form>
  );
}

/**
 * Tout ce qui doit sortir, et où ça en est.
 *
 * Les clients reliés à Metricool se publient depuis Pilot : on programme (ou
 * c'est fait tout seul à la validation du client), Metricool publie à l'heure,
 * et Pilot relève le lien du post. Les autres se publient à la main, puis on
 * colle le lien. Le problème vient toujours en premier.
 */
export default async function APublierPage() {
  await requireDepartment("social");
  const scope = await scopedClient();
  const scopeId = scope?.id;
  const [clients, prets, pasPrets, publiés, mcfg] = await Promise.all([
    listClientsWithPace(new Date(), "social"),
    listReadyToPublish(scopeId),
    listScheduledTodayNotReady(wallNow(), scopeId),
    listPublishedToday(new Date(), scopeId),
    metricoolConfig(),
  ]);

  const now = wallNow();
  const today = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  const passé = (l: Ligne) => Boolean(l.content.scheduledAt && realInstant(l.content.scheduledAt) < new Date());
  const checks = (l: Ligne) =>
    publicationChecks({ ...l.content, publishMode: l.publishMode, brandId: l.brandId, mediaCount: l.mediaCount, metricoolConnected: Boolean(mcfg) });

  const metricool = prets.filter((l) => l.brandId);
  const manuels = prets.filter((l) => !l.brandId);
  const problemes = metricool.filter((l) => ["erreur", "partiel", "introuvable"].includes(l.content.metricoolState ?? ""));
  const programmes = metricool.filter((l) => l.content.metricoolState === "programme" || l.content.metricoolState === "brouillon");
  const aProgrammer = metricool.filter((l) => !l.content.metricoolState);
  const complets = aProgrammer.filter((l) => checks(l).every((c) => c.ok));
  const manuelsRetard = manuels.filter(passé);

  if (clients.length === 0 || (prets.length === 0 && pasPrets.length === 0 && publiés.length === 0)) {
    return (
      <>
        <PageHeader scope={scope?.shortName} title="À publier" sub={today} />
        <EmptyState
          title="Rien à publier"
          actionLabel={clients.length === 0 ? "Ajouter un client" : "Nouveau contenu"}
          actionHref={clients.length === 0 ? "/clients" : "/contenu"}
        >
          Les contenus validés arrivent ici. Pour un client relié à Metricool, la publication
          part toute seule à la date prévue dès sa validation ; Pilot relève ensuite le lien du
          post. Pour les autres, on publie à la main puis on colle le lien.
        </EmptyState>
      </>
    );
  }

  const attention = problemes.length + aProgrammer.filter(passé).length + manuelsRetard.length;

  return (
    <>
      <PageHeader
        scope={scope?.shortName}
        title="À publier"
        sub={
          `${today} · ${programmes.length} programmé${programmes.length > 1 ? "s" : ""}` +
          (aProgrammer.length ? ` · ${aProgrammer.length} à programmer` : "") +
          (attention ? ` · ${attention} à régler` : "") +
          (publiés.length ? ` · ${publiés.length} publié${publiés.length > 1 ? "s" : ""} aujourd'hui` : "")
        }
      />

      <div className="min-h-0 flex-1 overflow-auto px-4 pt-1 pb-10 lg:px-7">
        <div className="flex w-full max-w-[1060px] flex-col gap-4">
          {mcfg ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="m-0 text-small text-ink-3">
                Pilot demande à Metricool toutes les 10 minutes ce qui est parti : le contenu passe alors « publié », avec le lien du post.
              </p>
              <VerifierTout />
            </div>
          ) : null}

          {problemes.length > 0 ? (
            <Card className="border-alert-line">
              <CardHead title="Problèmes de publication" meta={`${problemes.length}`} />
              {problemes.map((l) => {
                const fails = l.content.metricoolNetworks.filter((n) => n.status === "ERROR");
                return (
                  <Rangee
                    key={l.content.id}
                    ligne={l}
                    now={now}
                    tone="alert"
                    note={
                      <span className="text-alert">
                        {STATE_LABEL[l.content.metricoolState ?? ""]}
                        {fails.length
                          ? ` : ${fails.map((f) => `${NETWORK_LABEL[f.network] ?? f.network}${f.detail ? ` (${f.detail})` : ""}`).join(", ")}`
                          : ""}
                      </span>
                    }
                  >
                    <Link href={`/contenu/${l.content.id}`} className="flex-none text-small font-medium">
                      Ouvrir la fiche
                    </Link>
                  </Rangee>
                );
              })}
            </Card>
          ) : null}

          {aProgrammer.length > 0 ? (
            <Card>
              <CardHead title="Validés, à programmer" meta={`${aProgrammer.length}`}>
                {complets.length > 1 ? <ProgrammerTout ids={complets.map((l) => l.content.id)} /> : null}
              </CardHead>
              {aProgrammer.map((l) => {
                const manque = checks(l).filter((c) => !c.ok);
                const retard = passé(l);
                const seulDate = manque.length === 1 && manque[0].key === "date";
                return (
                  <Rangee
                    key={l.content.id}
                    ligne={l}
                    now={now}
                    tone={retard ? "alert" : "normal"}
                    note={
                      l.content.publishBlocker ? (
                        <span className="text-alert">N&apos;a pas pu partir tout seul : {l.content.publishBlocker}</span>
                      ) : manque.length ? (
                        <span className="text-warn">Manque : {manque.map((c) => c.label.toLowerCase()).join(", ")}</span>
                      ) : (
                        <span className="text-ok">Complet</span>
                      )
                    }
                  >
                    {manque.length === 0 ? (
                      <ProgrammerUn id={l.content.id} />
                    ) : seulDate && l.content.scheduledAt ? (
                      <ProgrammerUn id={l.content.id} maintenant />
                    ) : (
                      <Link href={`/contenu/${l.content.id}`} className="flex-none text-small font-medium">
                        Compléter
                      </Link>
                    )}
                  </Rangee>
                );
              })}
              <p className="px-5 py-3 text-small text-ink-3">
                Normalement, la validation du client suffit : la publication part toute seule. Ceux-ci
                attendent parce qu&apos;il manquait quelque chose au moment de la validation.
              </p>
            </Card>
          ) : null}

          <Card>
            <CardHead title="Programmés : partent tout seuls" meta={`${programmes.length}`} />
            {programmes.length === 0 ? (
              <p className="px-5 py-4 text-base text-ink-2">
                Rien de programmé pour l&apos;instant. Un contenu validé par le client part ici tout seul, s&apos;il est complet.
              </p>
            ) : (
              programmes.map((l) => (
                <Rangee
                  key={l.content.id}
                  ligne={l}
                  now={now}
                  tone="calme"
                  note={
                    l.content.metricoolState === "brouillon" ? (
                      <span className="text-warn">Brouillon Metricool (préversion)</span>
                    ) : passé(l) ? (
                      <span className="text-info">Heure passée : vérification en cours chez Metricool</span>
                    ) : null
                  }
                >
                  <span className="flex-none rounded-full bg-info-bg px-[10px] py-[3px] text-small font-medium text-info">
                    {STATE_LABEL[l.content.metricoolState ?? "programme"]}
                  </span>
                </Rangee>
              ))
            )}
          </Card>

          {manuels.length > 0 ? (
            <Card>
              <CardHead title="À publier à la main" meta={`${manuels.length}`} />
              {manuels.map((l) => (
                <Rangee key={l.content.id} ligne={l} now={now} tone={passé(l) ? "alert" : "normal"}>
                  <LienManuel id={l.content.id} fort={passé(l)} />
                </Rangee>
              ))}
              <p className="px-5 py-3 text-small text-ink-3">
                Ces clients ne sont pas reliés à Metricool (fiche client → marque Metricool). Le lien
                est enregistré avec l&apos;heure et l&apos;auteur : c&apos;est cette publication qui
                compte dans l&apos;engagement du mois.
              </p>
            </Card>
          ) : null}

          {pasPrets.length > 0 ? (
            <Card>
              <CardHead title="Prévus aujourd'hui, pas encore validés" meta={`${pasPrets.length}`} />
              {pasPrets.map(({ content, clientName }) => (
                <div key={content.id} className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-[10px]">
                  <span className="w-[150px] flex-none text-base tabular-nums text-ink-2">{quand(content.scheduledAt, now)}</span>
                  <Link href={`/contenu/${content.id}`} className="clip min-w-0 flex-1 text-base text-ink no-underline hover:underline">
                    {clientName} · {content.title}
                  </Link>
                  <span className="flex-none text-small text-warn">{CONTENT_STATUS[content.status]?.label ?? content.status}</span>
                </div>
              ))}
              <p className="px-5 py-3 text-small text-ink-3">
                Ils sortent aujourd&apos;hui mais ne sont pas encore validés : rien ne partira sans validation.
              </p>
            </Card>
          ) : null}

          {publiés.length > 0 ? (
            <Card>
              <CardHead title="Publiés aujourd'hui" meta={`${publiés.length}`} />
              {publiés.map(({ content, clientName }) => (
                <div key={content.id} className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-[10px]">
                  <span className="w-[150px] flex-none text-base tabular-nums text-ink-3">
                    {content.publishedAt?.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Indian/Reunion" })}
                  </span>
                  <Link href={`/contenu/${content.id}`} className="clip min-w-0 flex-1 text-base text-ink-2 no-underline hover:underline">
                    {clientName} · {content.title}
                  </Link>
                  {content.metricoolState === "publie" ? <span className="flex-none text-small text-ink-3">par Metricool</span> : null}
                  {content.metricoolState === "partiel" ? (
                    <span className="flex-none text-small text-alert">
                      Échec sur {content.metricoolNetworks.filter((n) => n.status === "ERROR").map((n) => NETWORK_LABEL[n.network] ?? n.network).join(", ")}
                    </span>
                  ) : null}
                  {content.publishedUrl ? (
                    <a href={content.publishedUrl} target="_blank" rel="noreferrer" className="flex-none text-small">
                      Voir le post
                    </a>
                  ) : null}
                </div>
              ))}
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
