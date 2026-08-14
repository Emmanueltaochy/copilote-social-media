import Image from "next/image";
import { requireStaff } from "@/lib/auth";
import { listAssets, listClientOptions } from "@/db/queries";
import { formatBytes, isVideo } from "@/lib/storage";
import { Eyebrow } from "@/components/ui/primitives";
import { FieldUpload } from "./FieldUpload";

export const dynamic = "force-dynamic";

/**
 * Les médias, depuis le terrain.
 *
 * Deux usages seulement : envoyer ce qu'on vient de prendre, et retrouver un
 * visuel pour le montrer à quelqu'un sur place. Les droits d'image, la
 * suppression et le rattachement aux contenus restent au bureau — ce sont des
 * décisions, pas des gestes de terrain.
 */
export default async function TerrainMediasPage() {
  await requireStaff();
  const [clients, rows] = await Promise.all([listClientOptions("social"), listAssets()]);

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-title font-semibold">Médias</h1>

      {clients.length === 0 ? (
        <p className="rounded-card border border-dashed border-line px-3 py-4 text-base text-ink-2">
          Aucun client. Ils se créent depuis le bureau.
        </p>
      ) : (
        <FieldUpload clients={clients} />
      )}

      {rows.length > 0 ? (
        <div className="grid grid-cols-3 gap-2">
          {rows.slice(0, 60).map(({ asset }) => (
            <a
              key={asset.id}
              href={`/api/media/${asset.id}`}
              target="_blank"
              rel="noreferrer"
              className="flex flex-col overflow-hidden rounded-card border border-line no-underline"
            >
              <span className="relative block aspect-square bg-slot">
                {isVideo(asset.mimeType) ? (
                  <span className="flex h-full items-center justify-center">
                    <Eyebrow>Vidéo</Eyebrow>
                  </span>
                ) : (
                  <Image
                    src={`/api/media/${asset.id}?format=thumb`}
                    alt={asset.filename}
                    fill
                    sizes="120px"
                    className="object-cover"
                    unoptimized
                  />
                )}
              </span>
              <span className="clip px-1 py-1 text-[10px] text-ink-3">
                {formatBytes(asset.sizeBytes ?? 0)}
              </span>
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}
