import Image from "next/image";
import Link from "next/link";
import { PageHeader } from "@/components/shell/Screen";
import { Card, CardHead } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Dot, Eyebrow } from "@/components/ui/primitives";
import { requireStaff } from "@/lib/auth";
import { assetCountsByClient, assetsFootprint, listAssets, listClientOptions } from "@/db/queries";
import {
  diskUsage,
  formatBytes,
  isVideo,
  MAX_VIDEO_BYTES,
  MIN_FREE_BYTES,
  WARN_FREE_BYTES,
} from "@/lib/storage";
import { cn } from "@/lib/cn";
import { toneText, type Tone } from "@/lib/tone";
import { UploadForm } from "./UploadForm";
import { deleteAsset, updateAssetRights } from "./actions";

const RIGHTS: Record<string, { label: string; tone: Tone }> = {
  illimites: { label: "Droits illimités", tone: "ok" },
  a_renouveler: { label: "À renouveler", tone: "warn" },
  expires: { label: "Droits expirés", tone: "alert" },
};

/** Un onglet de filtre. Le compte évite d'ouvrir un client pour rien. */
function Chip({ href, label, n, on }: { href: string; label: string; n: number; on: boolean }) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-[6px] rounded-control border px-[10px] py-[5px] text-small no-underline hover:no-underline",
        on
          ? "border-ink bg-ink text-paper"
          : "border-line bg-paper text-ink-2 hover:border-line-strong hover:text-ink",
      )}
    >
      {label}
      <span className={cn("text-micro tabular-nums", on ? "text-night-ink" : "text-ink-3")}>
        {n}
      </span>
    </Link>
  );
}

export default async function AssetsPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string }>;
}) {
  await requireStaff();
  const [{ client: demandé }, clients, counts, footprint, disk] = await Promise.all([
    searchParams,
    listClientOptions(),
    assetCountsByClient(),
    assetsFootprint(),
    diskUsage(),
  ]);

  // On ne passe à la requête qu'un identifiant reconnu : une valeur bricolée
  // dans l'URL ne doit pas atteindre la base.
  const selected = clients.find((c) => c.id === demandé)?.id;
  const rows = await listAssets(selected);

  if (clients.length === 0) {
    return (
      <>
        <PageHeader title="Bibliothèque d'assets" sub="Aucun média" />
        <EmptyState title="Aucun client" actionLabel="Ajouter un client" actionHref="/clients">
          Un média se rattache à un client : c&apos;est ce qui permet de savoir à qui il appartient
          et de le montrer dans son portail.
        </EmptyState>
      </>
    );
  }

  const watch = rows.filter((r) => r.asset.rights !== "illimites").length;
  const selectedName = clients.find((c) => c.id === selected)?.name;

  return (
    <>
      <PageHeader
        title="Bibliothèque d'assets"
        sub={
          `${selectedName ? `${selectedName} · ` : ""}` +
          `${rows.length} média${rows.length > 1 ? "s" : ""} · ${watch} avec des droits à surveiller`
        }
      />

      <div className="min-h-0 flex-1 overflow-auto px-5 pt-4 pb-6">
        <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-4">
          <Card className="flex flex-col gap-4 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <Eyebrow>Importer des médias</Eyebrow>
              <span className="text-small text-ink-3">
                {formatBytes(footprint.bytes)} utilisés par {footprint.files} fichier
                {footprint.files > 1 ? "s" : ""}
                {disk ? ` · ${formatBytes(disk.freeBytes)} libres sur le serveur` : ""}
              </span>
            </div>
            <UploadForm clients={clients} />
            <p className="text-small text-ink-2">
              Les images sont recompressées à l&apos;import et une miniature est générée :
              envoie les fichiers de ton photographe tels quels, quelle que soit leur taille —
              une photo de 60 Mo occupe quelques centaines de kilo-octets une fois traitée.
              Les fichiers bruts de boîtier (CR2, CR3, NEF, ARW) ne sont pas lisibles :
              exporte-les en JPEG ou TIFF. Les vidéos sont gardées telles quelles, jusqu&apos;à{" "}
              {formatBytes(MAX_VIDEO_BYTES)} — <strong>les rushes de tournage n&apos;ont pas leur
              place ici</strong>, seulement les médias livrés et réutilisables.
            </p>
            {/* L'alerte se mesure en espace restant, pas en pourcentage rempli :
                un disque à 90 % avec 200 Go libres ne gêne personne, tandis
                qu'un disque à 60 % sur une petite machine peut déjà bloquer. */}
            {disk && disk.freeBytes < WARN_FREE_BYTES ? (
              <p className="rounded-control border border-warn bg-warn-bg px-3 py-2 text-base text-warn">
                Il ne reste que {formatBytes(disk.freeBytes)} sur le serveur. En dessous de{" "}
                {formatBytes(MIN_FREE_BYTES)}, l&apos;import sera refusé : un disque plein arrête
                aussi la base de données. Supprime des médias devenus inutiles.
              </p>
            ) : null}
          </Card>

          {/* Le filtre passe par l'URL : la vue d'un client se met en favori,
              se partage et survit à un retour arrière. */}
          <div className="flex flex-wrap items-center gap-[6px]">
            <Chip href="/assets" label="Tous les clients" n={footprint.files} on={!selected} />
            {clients.map((c) => (
              <Chip
                key={c.id}
                href={`/assets?client=${c.id}`}
                label={c.name}
                n={counts.get(c.id) ?? 0}
                on={selected === c.id}
              />
            ))}
          </div>

          {rows.length === 0 ? (
            <Card className="p-5">
              <p className="text-base text-ink-2">
                {selectedName
                  ? `Aucun média pour ${selectedName}. Importe ses photos et vidéos livrées, ou reviens à tous les clients.`
                  : "Aucun média pour l'instant. Importe les photos et vidéos livrées : elles apparaîtront ici, réutilisables d'un contenu à l'autre, et visibles par le client dans son portail."}
              </p>
            </Card>
          ) : (
            <Card>
              <CardHead title="Médias" meta={`${rows.length}`} />
              <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] items-start gap-3 p-[14px]">
                {rows.map(({ asset, clientName, authorName }) => {
                  const rights = RIGHTS[asset.rights];
                  const video = isVideo(asset.mimeType);
                  return (
                    <div
                      key={asset.id}
                      className="flex flex-col overflow-hidden rounded-card border border-line bg-paper"
                    >
                      <div className="relative aspect-4/5 bg-slot">
                        {video ? (
                          <span className="flex h-full items-center justify-center">
                            <Eyebrow>Vidéo</Eyebrow>
                          </span>
                        ) : (
                          <Image
                            src={`/api/media/${asset.id}?format=thumb`}
                            alt={asset.filename}
                            fill
                            sizes="200px"
                            className="object-cover"
                            unoptimized
                          />
                        )}
                      </div>
                      <div className="flex flex-col gap-[3px] px-[10px] py-2">
                        <a
                          href={`/api/media/${asset.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="clip text-small font-medium text-ink no-underline hover:underline"
                        >
                          {asset.filename}
                        </a>
                        <span className="clip text-micro text-ink-3">
                          {clientName} · {formatBytes(asset.sizeBytes ?? 0)}
                          {authorName ? ` · ${authorName}` : ""}
                        </span>
                        <span className="flex items-center gap-[5px]">
                          <Dot tone={rights.tone} solid size={5} />
                          <span className={cn("clip text-micro", toneText[rights.tone])}>
                            {rights.label}
                          </span>
                        </span>

                        <div className="mt-1 flex items-center gap-1">
                          <form action={updateAssetRights} className="flex-1">
                            <input type="hidden" name="id" value={asset.id} />
                            <select
                              name="rights"
                              defaultValue={asset.rights}
                              className="w-full rounded-control border border-line bg-paper px-1 py-[3px] text-micro outline-none focus:border-gold"
                            >
                              <option value="illimites">Droits illimités</option>
                              <option value="a_renouveler">À renouveler</option>
                              <option value="expires">Expirés</option>
                            </select>
                            <button type="submit" className="sr-only">
                              Enregistrer
                            </button>
                          </form>
                          <form action={deleteAsset}>
                            <input type="hidden" name="id" value={asset.id} />
                            <button
                              type="submit"
                              title="Supprimer"
                              className="cursor-pointer rounded-control border border-line bg-paper px-[6px] py-[3px] text-micro text-ink-3 hover:border-alert hover:text-alert"
                            >
                              ✕
                            </button>
                          </form>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="px-[14px] pb-3 text-small text-ink-3">
                Changer les droits enregistre immédiatement. Les médias ne sont accessibles
                qu&apos;aux personnes connectées — aucune adresse publique.
              </p>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
