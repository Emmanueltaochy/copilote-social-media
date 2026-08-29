import Image from "next/image";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Eyebrow } from "@/components/ui/primitives";
import { assetsAtRoot, listAssetFolders, listAssets } from "@/db/queries";
import { aplatir, enfants, filDAriane } from "@/lib/folders";
import { formatBytes, isVideo } from "@/lib/storage";
import { cn } from "@/lib/cn";
import { contextePortail } from "@/lib/portail";

export const dynamic = "force-dynamic";

/**
 * La bibliothèque du client : ses photos et ses vidéos livrées.
 *
 * L'ancien portail en montrait douze, les plus récentes, sans moyen d'aller
 * plus loin — un client qui cherchait la photo d'un shooting de mars ne
 * pouvait que nous écrire. Il retrouve ici exactement les dossiers rangés par
 * l'agence, avec le même fil d'Ariane.
 */
export default async function MediasPage({
  searchParams,
}: {
  searchParams: Promise<{ dossier?: string }>;
}) {
  const { client, config } = await contextePortail();
  const [{ dossier: demandé }, dossiers, racine] = await Promise.all([
    searchParams,
    listAssetFolders(client.id),
    assetsAtRoot(client.id),
  ]);

  // Un identifiant bricolé dans l'adresse ne doit pas atteindre la base — et,
  // vérifié contre les dossiers de ce client, ne peut pas ouvrir ceux d'un autre.
  const courant = dossiers.find((d) => d.id === demandé)?.id ?? null;
  const medias = await listAssets(client.id, courant);

  const arbre = aplatir(dossiers);
  const chemin = filDAriane(dossiers, courant);
  const sous = enfants(dossiers, courant);
  const lien = (d: string | null) => (d ? `/portail/medias?dossier=${d}` : "/portail/medias");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-[2px]">
        <span className="eyebrow text-ink-3">{client.shortName}</span>
        <h1 className="text-display font-semibold tracking-[-0.01em]">Vos médias</h1>
      </div>

      {dossiers.length === 0 && medias.length === 0 ? (
        <Card className="p-6">
          <p className="text-lead text-ink-2">
            Aucun média pour l&apos;instant. Vos photos et vidéos livrées apparaîtront ici, prêtes
            à être téléchargées.
          </p>
        </Card>
      ) : null}

      {dossiers.length > 0 ? (
        <Card className="flex flex-col gap-3 p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2 text-base">
            <Link
              href={lien(null)}
              className={cn(
                "no-underline hover:underline",
                courant ? "text-ink-2" : "font-medium text-ink",
              )}
            >
              Tous vos médias
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

          {sous.length > 0 ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-2">
              {sous.map((d) => (
                <Link
                  key={d.id}
                  href={lien(d.id)}
                  className="flex items-center justify-between gap-2 rounded-card border border-line bg-paper px-3 py-[10px] no-underline hover:border-line-strong hover:no-underline"
                >
                  <span className="clip min-w-0 flex-1 text-base font-medium text-ink">
                    {d.name}
                  </span>
                  <span className="flex-none text-micro tabular-nums text-ink-3">
                    {arbre.find((r) => r.id === d.id)?.total ?? 0}
                  </span>
                </Link>
              ))}
            </div>
          ) : null}

          {courant === null && racine === 0 && medias.length === 0 ? (
            <p className="text-base text-ink-2">
              Ouvrez un dossier pour voir ce qu&apos;il contient.
            </p>
          ) : null}
        </Card>
      ) : null}

      {medias.length > 0 ? (
        <Card>
          <div className="flex items-center justify-between gap-4 border-b border-line px-6 py-5">
            <span className="text-title font-semibold">
              {courant ? (chemin[chemin.length - 1]?.name ?? "Médias") : "Vos médias"}
            </span>
            <span className="text-base text-ink-3">
              {medias.length} fichier{medias.length > 1 ? "s" : ""}
            </span>
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3 p-4 sm:p-6">
            {medias.map(({ asset }) => (
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
                <span className="flex flex-col px-2 py-2">
                  <span className="clip text-small text-ink">{asset.filename}</span>
                  <span className="clip text-micro text-ink-3">
                    {formatBytes(asset.sizeBytes ?? 0)}
                  </span>
                </span>
              </a>
            ))}
          </div>
          <p className="px-6 pb-5 text-base text-ink-3">
            Cliquez sur un média pour l&apos;ouvrir en pleine taille et l&apos;enregistrer. Ces
            fichiers sont réservés à votre compte —{" "}
            <span style={{ color: config.primaryColor }}>aucune adresse publique</span>.
          </p>
        </Card>
      ) : null}
    </div>
  );
}
