import Link from "next/link";
import { Card, CardHead } from "@/components/ui/Card";
import { Cover } from "@/components/ui/Cover";
import { attachAsset, detachAsset } from "../actions";

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
export function MediaCard({
  contentId,
  attached,
  library,
}: {
  contentId: string;
  attached: Asset[];
  library: Asset[];
}) {
  const free = library.filter((a) => !attached.some((b) => b.id === a.id));

  return (
    <Card>
      <CardHead
        title="Visuel"
        meta={attached.length > 0 ? `${attached.length}` : undefined}
      />

      {attached.length === 0 ? (
        <p className="px-[14px] py-4 text-base text-ink-2">
          Aucun visuel rattaché. Tant qu&apos;il n&apos;y en a pas, le client valide un titre sans
          voir ce qui sera publié, et la carte reste vide dans le pipeline comme au calendrier.
        </p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3 p-[14px]">
          {attached.map((a, i) => (
            <div key={a.id} className="flex flex-col gap-1">
              <Cover asset={a} ratio="4/5" />
              <span className="clip text-micro text-ink-3">
                {i === 0 ? "Couverture · " : ""}
                {a.filename}
              </span>
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
