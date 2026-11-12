import Link from "next/link";
import { PageHeader } from "@/components/shell/Screen";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { requireDepartment } from "@/lib/auth";
import { listClientOptions } from "@/db/queries";
import { CONTENT_STATUS } from "@/data/content";
import { cn } from "@/lib/cn";
import { secretStatus } from "@/lib/secrets";
import { agencyClientId, importedStockIds, listStock, type StockVideo } from "@/lib/stock-videos";
import { Importer } from "./Importer";

/*
 * Le stock de Reels montés, sur taochyagency.com, vu depuis Pilot. Une vidéo
 * s'importe (et se programme) en un clic, ou Jarvis s'en charge ; son état
 * revient sur le site, et une fois publiée elle se range toute seule.
 */

const DOSSIERS = [
  { key: "stock", label: "En stock", statuts: ["stock"] },
  { key: "pilot", label: "Dans Pilot", statuts: ["importee", "programmee"] },
  { key: "publiees", label: "Publiées", statuts: ["publiee"] },
  { key: "a_refaire", label: "À refaire", statuts: ["a_refaire"] },
] as const;

const ETAT: Record<string, { label: string; cls: string }> = {
  stock: { label: "En stock", cls: "bg-line text-ink-2" },
  importee: { label: "Importée", cls: "bg-warn-bg text-warn" },
  programmee: { label: "Programmée", cls: "bg-info-bg text-info" },
  publiee: { label: "Publiée", cls: "bg-ok-bg text-ok" },
  a_refaire: { label: "À refaire", cls: "bg-alert-bg text-alert" },
};

function quand(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleString("fr-FR", { timeZone: "Indian/Reunion", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default async function VideosStockPage({ searchParams }: { searchParams: Promise<{ dossier?: string }> }) {
  await requireDepartment("social");
  const { dossier: d } = await searchParams;
  const dossier = DOSSIERS.find((x) => x.key === d) ?? DOSSIERS[0];
  const lie = await secretStatus("stock-videos");

  if (!lie.connected) {
    return (
      <>
        <PageHeader title="Vidéos du stock" sub="Les Reels montés pour taochyagency.com" />
        <EmptyState title="Stock non relié" actionLabel="Ouvrir les réglages" actionHref="/reglages">
          Sur taochyagency.com/admin/videos.php, cliquez « Relier à Pilot », puis collez la clé dans Réglages →
          « Stock vidéos taochyagency.com ». Les vidéos apparaîtront ici, prêtes à importer et à programmer.
        </EmptyState>
      </>
    );
  }

  let videos: StockVideo[] = [];
  let erreur: string | null = null;
  try {
    videos = await listStock();
  } catch (e) {
    erreur = (e as Error).message;
  }
  const [clients, defaut, importees] = await Promise.all([
    listClientOptions("social"),
    agencyClientId(),
    importedStockIds(videos.map((v) => v.id)),
  ]);
  const compte = (statuts: readonly string[]) => videos.filter((v) => statuts.includes(v.status)).length;
  const liste = videos.filter((v) => (dossier.statuts as readonly string[]).includes(v.status)).reverse();

  return (
    <>
      <PageHeader
        title="Vidéos du stock"
        sub={`${compte(["stock"])} en stock · ${compte(["importee", "programmee"])} dans Pilot · ${compte(["publiee"])} publiée${compte(["publiee"]) > 1 ? "s" : ""}`}
      />
      <div className="min-h-0 flex-1 overflow-auto px-4 pt-1 pb-10 lg:px-7">
        <div className="flex w-full max-w-[1200px] flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            {DOSSIERS.map((x) => (
              <Link
                key={x.key}
                href={`/videos-stock?dossier=${x.key}`}
                className={cn(
                  "rounded-full border px-[14px] py-[6px] text-small no-underline hover:no-underline",
                  x.key === dossier.key ? "border-night bg-night font-semibold text-white" : "border-line bg-paper text-ink-2 hover:border-line-strong",
                )}
              >
                {x.label} <b className="ml-1">{compte(x.statuts)}</b>
              </Link>
            ))}
            <span className="ml-auto text-small text-ink-3">
              Jarvis peut aussi le faire : « programme les 5 prochaines vidéos du stock pour Taochy Agency ».
            </span>
          </div>

          {erreur ? <p className="rounded-control border border-alert-line bg-alert-wash p-3 text-small text-alert">{erreur}</p> : null}
          {!erreur && liste.length === 0 ? (
            <p className="text-base text-ink-2">Rien dans ce dossier pour l&apos;instant.</p>
          ) : null}

          <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))" }}>
            {liste.map((v) => {
              const dansPilot = importees.get(v.id);
              const etat = ETAT[v.status] ?? ETAT.stock;
              return (
                <Card key={v.id} className="flex flex-col overflow-hidden">
                  {v.url ? (
                    <video src={v.url} controls preload="metadata" playsInline className="block aspect-[9/16] w-full bg-black object-cover" />
                  ) : (
                    <div className="grid aspect-[9/16] w-full place-items-center bg-mute text-small text-ink-3">Pas de fichier</div>
                  )}
                  <div className="flex flex-1 flex-col gap-2 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-base font-semibold leading-snug">{v.title}</span>
                      <span className={cn("flex-none rounded-full px-[9px] py-[2px] text-micro font-semibold", etat.cls)}>{etat.label}</span>
                    </div>
                    {v.caption ? <p className="m-0 line-clamp-3 text-small text-ink-3">{v.caption}</p> : null}
                    {v.status === "programmee" && quand(v.scheduled) ? <p className="m-0 text-small text-info">Programmée le {quand(v.scheduled)}</p> : null}
                    {v.status === "publiee" ? (
                      <p className="m-0 text-small text-ok">
                        Publiée{quand(v.posted) ? ` le ${quand(v.posted)}` : ""}
                        {v.postUrl ? (
                          <>
                            {" · "}
                            <a href={v.postUrl} target="_blank" rel="noreferrer">
                              voir le post ↗
                            </a>
                          </>
                        ) : null}
                      </p>
                    ) : null}
                    <div className="mt-auto pt-1">
                      {dansPilot ? (
                        <Link href={`/contenu/${dansPilot.contentId}`} className="text-small font-medium">
                          {dansPilot.client} · {CONTENT_STATUS[dansPilot.status as keyof typeof CONTENT_STATUS]?.label ?? dansPilot.status} →
                        </Link>
                      ) : v.status === "stock" ? (
                        <Importer stockId={v.id} clients={clients} defaultClientId={defaut} />
                      ) : null}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
