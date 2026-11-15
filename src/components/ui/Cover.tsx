import { Eyebrow } from "./primitives";
import { cn } from "@/lib/cn";

export type CoverAsset = { id: string; mimeType: string } | undefined;

const VIDEO = /^video\//;

/**
 * Le visuel d'un contenu, partout où il apparaît.
 *
 * Un même composant pour la vignette d'une carte de production, la pastille du
 * calendrier et l'image en grand d'une approbation : c'est le même média, et
 * le voir sous la même forme d'un écran à l'autre évite de se demander si
 * c'est bien le bon.
 *
 * Deux fichiers pour une image : la miniature des grilles (480 px) et la
 * version d'affichage (1440 px). `sizes` dit la largeur réelle à l'écran, et
 * le navigateur prend la miniature pour une pastille, la version d'affichage
 * pour une couverture en pleine largeur sur un téléphone — où la miniature,
 * étirée, sortait floue.
 *
 * Une vidéo n'a pas de miniature — les extraire demanderait ffmpeg, absent de
 * ce serveur. Elle est donc annoncée comme telle plutôt que représentée par
 * une image trompeuse.
 */
export function Cover({
  asset,
  ratio = "4/5",
  className,
  label,
  sizes = "240px",
}: {
  asset: CoverAsset;
  ratio?: "4/5" | "1/1" | "16/9";
  className?: string;
  label?: string;
  /** Largeur affichée, au format de l'attribut HTML `sizes`. */
  sizes?: string;
}) {
  const box = cn(
    "relative block overflow-hidden rounded-card bg-slot",
    ratio === "4/5" && "aspect-4/5",
    ratio === "1/1" && "aspect-square",
    ratio === "16/9" && "aspect-video",
    className,
  );

  if (!asset) {
    return (
      <span className={cn(box, "border border-dashed border-line")}>
        <span className="flex h-full items-center justify-center px-2 text-center">
          <Eyebrow tone="muted">{label ?? "Sans visuel"}</Eyebrow>
        </span>
      </span>
    );
  }

  if (VIDEO.test(asset.mimeType)) {
    return (
      <span className={box}>
        <span className="flex h-full items-center justify-center">
          <Eyebrow>Vidéo</Eyebrow>
        </span>
      </span>
    );
  }

  return (
    <span className={box}>
      {/* eslint-disable-next-line @next/next/no-img-element -- média servi après
          contrôle d'accès, avec ses propres dérivées : next/image n'accepte pas de srcSet. */}
      <img
        src={`/api/media/${asset.id}?format=thumb`}
        srcSet={`/api/media/${asset.id}?format=thumb 480w, /api/media/${asset.id} 1440w`}
        sizes={sizes}
        alt=""
        loading="lazy"
        decoding="async"
        className="absolute inset-0 h-full w-full object-cover"
      />
    </span>
  );
}
