import Image from "next/image";
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
 * Une vidéo n'a pas de miniature — les extraire demanderait ffmpeg, absent de
 * ce serveur. Elle est donc annoncée comme telle plutôt que représentée par
 * une image trompeuse.
 */
export function Cover({
  asset,
  ratio = "4/5",
  className,
  label,
}: {
  asset: CoverAsset;
  ratio?: "4/5" | "1/1" | "16/9";
  className?: string;
  label?: string;
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
      <Image
        src={`/api/media/${asset.id}?format=thumb`}
        alt=""
        fill
        sizes="320px"
        className="object-cover"
        unoptimized
      />
    </span>
  );
}
