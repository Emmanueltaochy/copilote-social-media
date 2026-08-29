import Image from "next/image";
import Link from "next/link";
import { PageHeader } from "@/components/shell/Screen";
import { Card, CardHead } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Dot, Eyebrow } from "@/components/ui/primitives";
import { requireDepartment } from "@/lib/auth";
import {
  assetCountsByClient,
  assetsAtRoot,
  assetsFootprint,
  listAssetFolders,
  listAllAssetFolders,
  listAssets,
  listClientOptions,
} from "@/db/queries";
import { aplatir, enfants, filDAriane } from "@/lib/folders";
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
import { MoveSelect } from "./MoveSelect";
import { createFolder, deleteAsset, deleteFolder, moveAsset, updateAssetRights } from "./actions";

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

/**
 * La bibliothèque de médias.
 *
 * Elle a longtemps été un mur de vignettes : les carrousels livrés y voisinaient
 * avec les photos brutes du même shooting, et retrouver un visuel demandait de
 * les ouvrir un par un. Elle se range désormais en dossiers, propres à chaque
 * client et imbriquables — « Shooting mars », puis « Brut » et « Retouché ».
 *
 * La navigation passe par l'adresse plutôt que par un état de composant : un
 * dossier se met en favori, se partage à un collègue, et le retour arrière du
 * navigateur remonte d'un cran comme on l'attend.
 */
export default async function AssetsPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string; dossier?: string }>;
}) {
  await requireDepartment("social");
  const [{ client: demandé, dossier: dossierDemandé }, clients, counts, footprint, disk, tousDossiers] =
    await Promise.all([
      searchParams,
      listClientOptions("social"),
      assetCountsByClient(),
      assetsFootprint(),
      diskUsage(),
      listAllAssetFolders(),
    ]);

  // On ne passe à la requête qu'un identifiant reconnu : une valeur bricolée
  // dans l'URL ne doit pas atteindre la base.
  const selected = clients.find((c) => c.id === demandé)?.id;

  // Les dossiers n'existent qu'à l'intérieur d'un client : ranger ensemble les
  // médias de deux marques n'aurait aucun sens, et « Shooting mars » ne veut
  // rien dire hors du client dont c'est le shooting.
  const dossiers = selected ? await listAssetFolders(selected) : [];
  const courant = dossiers.find((d) => d.id === dossierDemandé)?.id ?? null;
  const arbre = aplatir(dossiers);
  const chemin = filDAriane(dossiers, courant);
  const sousDossiers = selected ? enfants(dossiers, courant) : [];

  // Sans client choisi, la bibliothèque reste le mur d'origine : elle sert
  // alors à chercher, pas à ranger.
  const rows = await listAssets(selected, selected ? courant : undefined);
  const racine = selected ? await assetsAtRoot(selected) : 0;

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
  const lien = (d: string | null) =>
    `/assets?client=${selected}${d ? `&dossier=${d}` : ""}`;

  return (
    <>
      <PageHeader
        title="Bibliothèque d'assets"
        sub={
          `${selectedName ? `${selectedName} · ` : ""}` +
          `${rows.length} média${rows.length > 1 ? "s" : ""} · ${watch} avec des droits à surveiller`
        }
      />

      <div className="min-h-0 flex-1 overflow-auto px-4 pt-4 pb-6 lg:px-5">
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
            {/* Le client et le dossier ouverts sont proposés d'avance : on
                importe presque toujours là où l'on se trouve. */}
            <UploadForm
              clients={clients}
              dossiers={tousDossiers}
              clientParDefaut={selected ?? ""}
              dossierParDefaut={courant ?? ""}
            />
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

          {selected ? (
            <Card className="flex flex-col gap-3 p-4">
              {/* Le fil d'Ariane, et non un arbre déplié en permanence : une
                  colonne d'arborescence mangerait la moitié de l'écran d'une
                  bibliothèque dont l'objet est de montrer des images. */}
              <div className="flex flex-wrap items-center gap-2 text-base">
                <Link
                  href={lien(null)}
                  className={cn(
                    "no-underline hover:underline",
                    courant ? "text-ink-2" : "font-medium text-ink",
                  )}
                >
                  {selectedName}
                </Link>
                {chemin.map((d, i) => (
                  <span key={d.id} className="flex items-center gap-2">
                    <span className="text-ink-3">/</span>
                    <Link
                      href={lien(d.id)}
                      className={cn(
                        "no-underline hover:underline",
                        i === chemin.length - 1 ? "font-medium text-ink" : "text-ink-2",
                      )}
                    >
                      {d.name}
                    </Link>
                  </span>
                ))}
              </div>

              {sousDossiers.length > 0 ? (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-2">
                  {sousDossiers.map((d) => {
                    const total = arbre.find((r) => r.id === d.id)?.total ?? d.medias ?? 0;
                    return (
                      <div
                        key={d.id}
                        data-dossier={d.id}
                        className="flex items-center gap-2 rounded-card border border-line bg-paper px-3 py-[10px]"
                      >
                        <Link
                          href={lien(d.id)}
                          className="clip min-w-0 flex-1 text-base font-medium text-ink no-underline hover:underline"
                        >
                          {d.name}
                        </Link>
                        <span className="flex-none text-micro tabular-nums text-ink-3">
                          {total}
                        </span>
                        <form action={deleteFolder} className="flex-none">
                          <input type="hidden" name="id" value={d.id} />
                          <button
                            type="submit"
                            title="Supprimer le dossier — son contenu remonte d'un cran"
                            className="cursor-pointer rounded-control border border-line bg-paper px-[6px] py-[2px] text-micro text-ink-3 hover:border-alert hover:text-alert"
                          >
                            ✕
                          </button>
                        </form>
                      </div>
                    );
                  })}
                </div>
              ) : null}

              <form action={createFolder} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="clientId" value={selected} />
                {courant ? <input type="hidden" name="parentId" value={courant} /> : null}
                <input
                  name="name"
                  required
                  placeholder={
                    courant
                      ? `Nouveau dossier dans ${chemin[chemin.length - 1]?.name}`
                      : "Nouveau dossier (Shooting mars, Carrousels livrés…)"
                  }
                  className="min-w-[240px] flex-1 rounded-control border border-line bg-paper px-3 py-[6px] text-small outline-none focus:border-gold"
                />
                <button
                  type="submit"
                  className="cursor-pointer rounded-control border border-line bg-paper px-[10px] py-[6px] text-small font-medium text-ink-2 hover:border-line-strong hover:text-ink"
                >
                  Créer le dossier
                </button>
              </form>

              {courant === null && racine > 0 && dossiers.length > 0 ? (
                <p className="text-small text-ink-3">
                  {racine} média{racine > 1 ? "s" : ""} encore à la racine. La liste déroulante
                  sous chaque vignette les range sans les rouvrir.
                </p>
              ) : null}
            </Card>
          ) : null}

          {rows.length === 0 ? (
            <Card className="p-5">
              <p className="text-base text-ink-2">
                {courant
                  ? "Ce dossier est vide. Importe des médias dedans, ou range-en depuis la racine."
                  : selectedName
                    ? `Aucun média pour ${selectedName}. Importe ses photos et vidéos livrées, ou reviens à tous les clients.`
                    : "Aucun média pour l'instant. Importe les photos et vidéos livrées : elles apparaîtront ici, réutilisables d'un contenu à l'autre, et visibles par le client dans son portail."}
              </p>
            </Card>
          ) : (
            <Card>
              <CardHead
                title={courant ? chemin[chemin.length - 1]?.name ?? "Médias" : "Médias"}
                meta={`${rows.length}`}
              />
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

                        {selected ? (
                          <div className="mt-1 flex items-center gap-1">
                            <MoveSelect
                              action={moveAsset}
                              id={asset.id}
                              dossiers={arbre}
                              courant={asset.folderId}
                            />
                          </div>
                        ) : null}

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
                Changer les droits ou de dossier enregistre immédiatement. Les médias ne sont
                accessibles qu&apos;aux personnes connectées — aucune adresse publique.
              </p>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
