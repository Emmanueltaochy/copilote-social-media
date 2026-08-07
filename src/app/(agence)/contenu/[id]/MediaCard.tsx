import Link from "next/link";
import { Card, CardHead } from "@/components/ui/Card";
import { Cover } from "@/components/ui/Cover";
import { Carousel } from "@/components/ui/Carousel";
import { DirectUpload } from "./DirectUpload";
import { addLink, attachAsset, detachAsset, moveAsset, removeLink } from "../actions";

type Asset = { id: string; filename: string; mimeType: string };

/**
 * Le visuel d'un contenu.
 *
 * Les médias ne sont pas importés ici mais choisis dans la bibliothèque du
 * client : une même photo de tournage sert souvent à plusieurs publications,
 * et la dupliquer ferait diverger les droits à l'image attachés à l'une et
 * pas à l'autre. Détacher n'efface donc rien — seul le lien disparaît.
 *
 * Le premier média rattaché sert de couverture partout ailleurs : pipeline,
 * calendrier, approbations, portail du client.
 */
type Lien = { id: string; url: string; label: string | null; addedByName: string | null };

export function MediaCard({
  contentId,
  clientId,
  attached,
  library,
  links,
  isCarousel,
}: {
  contentId: string;
  clientId: string;
  attached: Asset[];
  library: Asset[];
  links: Lien[];
  /** Un carrousel se juge vue par vue, dans l'ordre : il a droit à son aperçu. */
  isCarousel: boolean;
}) {
  const free = library.filter((a) => !attached.some((b) => b.id === a.id));

  return (
    <Card>
      <CardHead
        title={isCarousel ? "Vues du carrousel" : "Visuel"}
        meta={attached.length > 0 ? `${attached.length}` : undefined}
      />

      {isCarousel && attached.length > 0 ? (
        <div className="border-b border-line px-[14px] py-4">
          <p className="mb-3 text-small text-ink-3">
            Aperçu tel que le verra l&apos;audience — et le client dans son portail.
          </p>
          <Carousel slides={attached} className="mx-auto max-w-[320px]" />
        </div>
      ) : null}

      {attached.length === 0 ? (
        <p className="px-[14px] py-4 text-base text-ink-2">
          {isCarousel
            ? "Aucune vue. Un carrousel se compose de plusieurs images, dans l'ordre où elles seront balayées : rattache-les une à une ci-dessous."
            : "Aucun visuel rattaché. Tant qu'il n'y en a pas, le client valide un titre sans voir ce qui sera publié, et la carte reste vide dans le pipeline comme au calendrier."}
        </p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3 p-[14px]">
          {attached.map((a, i) => (
            <div key={a.id} className="flex flex-col gap-1">
              <Cover asset={a} ratio="4/5" />
              <span className="clip text-micro text-ink-3">
                {isCarousel ? `Vue ${i + 1} · ` : i === 0 ? "Couverture · " : ""}
                {a.filename}
              </span>

              {attached.length > 1 ? (
                <div className="flex gap-1">
                  {(["up", "down"] as const).map((direction) => (
                    <form key={direction} action={moveAsset} className="flex-1">
                      <input type="hidden" name="contentId" value={contentId} />
                      <input type="hidden" name="assetId" value={a.id} />
                      <input type="hidden" name="direction" value={direction} />
                      <button
                        type="submit"
                        disabled={direction === "up" ? i === 0 : i === attached.length - 1}
                        title={direction === "up" ? "Avancer" : "Reculer"}
                        className="w-full cursor-pointer rounded-control border border-line bg-paper px-2 py-1 text-micro text-ink-2 hover:border-line-strong hover:text-ink disabled:cursor-default disabled:opacity-40"
                      >
                        {direction === "up" ? "←" : "→"}
                      </button>
                    </form>
                  ))}
                </div>
              ) : null}

              <form action={detachAsset}>
                <input type="hidden" name="contentId" value={contentId} />
                <input type="hidden" name="assetId" value={a.id} />
                <button
                  type="submit"
                  className="w-full cursor-pointer rounded-control border border-line bg-paper px-2 py-1 text-micro text-ink-3 hover:border-alert hover:text-alert"
                >
                  Détacher
                </button>
              </form>
            </div>
          ))}
        </div>
      )}

      {/* Trois façons d'apporter le visuel, dans l'ordre de fréquence :
          le prendre dans la bibliothèque, l'importer directement, ou pointer
          un fichier qui vit ailleurs. */}
      <div className="border-t border-line px-[14px] py-3">
        <span className="eyebrow text-ink-3">Importer un fichier</span>
        <div className="mt-2">
          <DirectUpload contentId={contentId} clientId={clientId} />
        </div>
      </div>

      <div className="border-t border-line px-[14px] py-3">
        <span className="eyebrow text-ink-3">Lien externe</span>
        {links.length > 0 ? (
          <div className="mt-2 flex flex-col gap-1">
            {links.map((l) => (
              <div key={l.id} className="flex items-center gap-2">
                <a
                  href={l.url}
                  target="_blank"
                  rel="noreferrer"
                  className="clip min-w-0 flex-1 text-small text-ink no-underline hover:underline"
                >
                  {l.label || l.url}
                </a>
                {l.addedByName ? (
                  <span className="flex-none text-micro text-ink-3">{l.addedByName}</span>
                ) : null}
                <form action={removeLink} className="flex-none">
                  <input type="hidden" name="id" value={l.id} />
                  <input type="hidden" name="contentId" value={contentId} />
                  <button
                    type="submit"
                    title="Retirer"
                    className="cursor-pointer rounded-control border border-line bg-paper px-[6px] py-[2px] text-micro text-ink-3 hover:border-alert hover:text-alert"
                  >
                    ✕
                  </button>
                </form>
              </div>
            ))}
          </div>
        ) : null}

        <form action={addLink} className="mt-2 flex flex-wrap items-center gap-2">
          <input type="hidden" name="contentId" value={contentId} />
          <input
            name="url"
            type="url"
            required
            placeholder="https://drive.google.com/…"
            className="min-w-[220px] flex-[2] rounded-control border border-line bg-paper px-2 py-[6px] text-small outline-none focus:border-gold"
          />
          <input
            name="label"
            placeholder="Montage final, rushes…"
            className="min-w-[140px] flex-1 rounded-control border border-line bg-paper px-2 py-[6px] text-small outline-none focus:border-gold"
          />
          <button
            type="submit"
            className="flex-none cursor-pointer rounded-control border border-line bg-paper px-[10px] py-[6px] text-small font-medium text-ink-2 hover:border-line-strong hover:text-ink"
          >
            Ajouter le lien
          </button>
        </form>
        <p className="mt-2 text-small text-ink-3">
          Pour un fichier trop gros pour être hébergé ici — un montage rendu par un prestataire,
          des rushes. Le lien dit où regarder, sans faire une seconde copie à tenir à jour.
        </p>
      </div>

      {free.length > 0 ? (
        <form action={attachAsset} className="flex flex-wrap items-center gap-2 border-t border-line px-[14px] py-3">
          <input type="hidden" name="contentId" value={contentId} />
          <select
            name="assetId"
            required
            defaultValue=""
            className="min-w-0 flex-1 rounded-control border border-line bg-paper px-2 py-[6px] text-small outline-none focus:border-gold"
          >
            <option value="" disabled>
              Choisir un média de la bibliothèque…
            </option>
            {free.map((a) => (
              <option key={a.id} value={a.id}>
                {a.filename}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="flex-none cursor-pointer rounded-control border border-line bg-paper px-[10px] py-[6px] text-small font-medium text-ink-2 hover:border-line-strong hover:text-ink"
          >
            Rattacher
          </button>
        </form>
      ) : (
        <p className="border-t border-line px-[14px] py-3 text-small text-ink-3">
          {library.length === 0
            ? "La bibliothèque de ce client est vide."
            : "Tous les médias de ce client sont déjà rattachés."}{" "}
          <Link href="/assets" className="text-ink-2">
            Importer des médias
          </Link>
        </p>
      )}
    </Card>
  );
}
