import Link from "next/link";
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
import { CONTENT_STATUS, networksLabel } from "@/data/content";
import { cn } from "@/lib/cn";
import { markPublished } from "../contenu/actions";

type Ligne = {
  content: {
    id: string;
    title: string;
    network: string;
    networks: string[];
    status: string;
    scheduledAt: Date | null;
    publishedAt: Date | null;
    publishedUrl: string | null;
  };
  clientName: string;
};

/** « aujourd'hui 11:00 », « mardi 3 sept. 09:00 », « sans date ». */
function quand(d: Date | null, now: Date): string {
  if (!d) return "Sans date";
  const jour = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const aujourdhui = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const heure = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const écart = Math.round((jour.getTime() - aujourdhui.getTime()) / 86_400_000);
  if (écart === 0) return `Aujourd'hui ${heure}`;
  if (écart === 1) return `Demain ${heure}`;
  if (écart === -1) return `Hier ${heure}`;
  return `${d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })} ${heure}`;
}

function Rangee({ ligne, now, retard }: { ligne: Ligne; now: Date; retard: boolean }) {
  const { content, clientName } = ligne;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3 border-b border-line px-[14px] py-3",
        retard ? "bg-alert-wash" : "bg-paper",
      )}
    >
      <span
        className={cn(
          "w-[150px] flex-none text-base font-medium tabular-nums",
          retard ? "text-alert" : content.publishedAt ? "text-ink-3" : "text-ink",
        )}
      >
        {quand(content.scheduledAt, now)}
      </span>

      <span className="flex min-w-[180px] flex-1 flex-col">
        <Link
          href={`/contenu/${content.id}`}
          className="clip text-base font-medium text-ink no-underline hover:underline"
        >
          {content.title}
        </Link>
        <span className="clip text-small text-ink-3">
          {clientName} · {networksLabel(content)}
        </span>
      </span>

      {content.publishedAt ? (
        <span className="flex-none text-small font-medium text-ok">Publié</span>
      ) : (
        <form action={markPublished} className="flex min-w-[280px] flex-1 items-center gap-2">
          <input type="hidden" name="id" value={content.id} />
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
              retard
                ? "border-ink bg-ink text-paper hover:bg-black"
                : "border-line bg-paper text-ink-2 hover:border-line-strong hover:text-ink",
            )}
          >
            Publié
          </button>
        </form>
      )}

      {content.publishedAt && content.publishedUrl ? (
        <a href={content.publishedUrl} target="_blank" rel="noreferrer" className="text-small">
          Voir le post
        </a>
      ) : null}
    </div>
  );
}

/**
 * Tout ce qui est prêt à partir.
 *
 * L'écran porte le même nom qu'une colonne du pipeline, il doit donc en dire
 * autant : un contenu prêt depuis trois jours attend toujours, et le filtrer
 * sur la seule journée en cours le faisait disparaître de l'écran censé le
 * rattraper. Le retard vient donc en premier, puis le reste, par date.
 */
export default async function APublierPage() {
  await requireDepartment("social");
  const [clients, prets, pasPrets, publiés] = await Promise.all([
    listClientsWithPace(),
    listReadyToPublish(),
    listScheduledTodayNotReady(),
    listPublishedToday(),
  ]);

  const now = new Date();
  const today = now.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const enRetard = prets.filter((r) => r.content.scheduledAt && r.content.scheduledAt < now);
  const aVenir = prets.filter((r) => !r.content.scheduledAt || r.content.scheduledAt >= now);

  if (clients.length === 0 || (prets.length === 0 && pasPrets.length === 0 && publiés.length === 0)) {
    return (
      <>
        <PageHeader title="À publier" sub={today} />
        <EmptyState
          title="Rien à publier"
          actionLabel={clients.length === 0 ? "Ajouter un client" : "Nouveau contenu"}
          actionHref={clients.length === 0 ? "/clients" : "/contenu"}
        >
          Tous les contenus arrivés à l&apos;étape <strong>Prêt à publier</strong> apparaissent ici,
          quelle que soit leur date. Marquer un contenu comme publié demande le lien du post :
          c&apos;est ce qui rend la publication vérifiable, faute de connexion automatique aux
          réseaux.
        </EmptyState>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="À publier"
        sub={
          `${today} · ${prets.length} prêt${prets.length > 1 ? "s" : ""}` +
          (enRetard.length > 0 ? ` · ${enRetard.length} en retard` : "") +
          (publiés.length > 0 ? ` · ${publiés.length} publié${publiés.length > 1 ? "s" : ""} aujourd'hui` : "")
        }
      />

      <div className="min-h-0 flex-1 overflow-auto px-4 pt-4 pb-6 lg:px-5">
        <div className="mx-auto flex w-full max-w-[1060px] flex-col gap-4">
          {enRetard.length > 0 ? (
            <Card>
              <CardHead title="En retard" meta={`${enRetard.length}`} />
              {enRetard.map((l) => (
                <Rangee key={l.content.id} ligne={l} now={now} retard />
              ))}
              <p className="px-[14px] py-3 text-small text-ink-3">
                L&apos;heure prévue est passée et le lien n&apos;est pas encore là. C&apos;est ce
                qui manque à l&apos;engagement du mois.
              </p>
            </Card>
          ) : null}

          <Card>
            <CardHead
              title={enRetard.length > 0 ? "Le reste de la file" : "Prêt à publier"}
              meta={`${aVenir.length}`}
            />
            {aVenir.length === 0 ? (
              <p className="px-[14px] py-4 text-base text-ink-2">
                Rien d&apos;autre n&apos;attend. Les contenus arrivent ici dès qu&apos;ils passent à
                l&apos;étape <strong>Prêt à publier</strong> dans le pipeline.
              </p>
            ) : (
              aVenir.map((l) => <Rangee key={l.content.id} ligne={l} now={now} retard={false} />)
            )}
            <p className="px-[14px] py-3 text-small text-ink-3">
              Le lien est enregistré avec l&apos;heure et l&apos;auteur. C&apos;est cette
              publication qui compte dans l&apos;engagement du mois du client.
            </p>
          </Card>

          {pasPrets.length > 0 ? (
            <Card>
              <CardHead title="Programmés aujourd'hui, pas encore prêts" meta={`${pasPrets.length}`} />
              {pasPrets.map(({ content, clientName }) => (
                <div
                  key={content.id}
                  className="flex flex-wrap items-center gap-3 border-b border-line px-[14px] py-[10px]"
                >
                  <span className="w-[150px] flex-none text-base tabular-nums text-ink-2">
                    {quand(content.scheduledAt, now)}
                  </span>
                  <Link
                    href={`/contenu/${content.id}`}
                    className="clip min-w-0 flex-1 text-base text-ink no-underline hover:underline"
                  >
                    {clientName} · {content.title}
                  </Link>
                  <span className="flex-none text-small text-warn">
                    {CONTENT_STATUS[content.status]?.label ?? content.status}
                  </span>
                </div>
              ))}
              <p className="px-[14px] py-3 text-small text-ink-3">
                Ils sortent aujourd&apos;hui mais ne sont pas encore passés en « prêt à publier ».
              </p>
            </Card>
          ) : null}

          {publiés.length > 0 ? (
            <Card>
              <CardHead title="Publiés aujourd'hui" meta={`${publiés.length}`} />
              {publiés.map(({ content, clientName }) => (
                <div
                  key={content.id}
                  className="flex flex-wrap items-center gap-3 border-b border-line px-[14px] py-[10px]"
                >
                  <span className="w-[150px] flex-none text-base tabular-nums text-ink-3">
                    {content.publishedAt?.toLocaleTimeString("fr-FR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <Link
                    href={`/contenu/${content.id}`}
                    className="clip min-w-0 flex-1 text-base text-ink-2 no-underline hover:underline"
                  >
                    {clientName} · {content.title}
                  </Link>
                  {content.publishedUrl ? (
                    <a
                      href={content.publishedUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex-none text-small"
                    >
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
