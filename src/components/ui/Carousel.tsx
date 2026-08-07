"use client";

import Image from "next/image";
import { useState } from "react";
import { Eyebrow } from "./primitives";
import { cn } from "@/lib/cn";

export type Slide = { id: string; mimeType: string; filename: string };

/**
 * Le carrousel, tel qu'il sera vu.
 *
 * Un carrousel n'est pas une grille : ses vues se regardent l'une après
 * l'autre, dans un ordre choisi. La première arrête le défilement, la
 * dernière appelle à l'action — juger l'ensemble en mosaïque ne dit rien de
 * l'effet réel. Le client voit donc ici ce que verra son audience, une vue à
 * la fois, avec les mêmes proportions que sur le réseau.
 *
 * Navigation au clavier comprise : les flèches sont le geste naturel une fois
 * qu'on a cliqué dans le carrousel, et s'en passer obligerait à viser deux
 * petits boutons pour parcourir dix vues.
 */
export function Carousel({
  slides,
  ratio = "4/5",
  className,
}: {
  slides: Slide[];
  ratio?: "4/5" | "1/1";
  className?: string;
}) {
  const [index, setIndex] = useState(0);
  if (slides.length === 0) return null;

  const current = slides[Math.min(index, slides.length - 1)];
  const go = (n: number) => setIndex((i) => (i + n + slides.length) % slides.length);

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div
        role="group"
        aria-label={`Carrousel, vue ${index + 1} sur ${slides.length}`}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") go(1);
          if (e.key === "ArrowLeft") go(-1);
        }}
        className={cn(
          "relative block w-full overflow-hidden rounded-card bg-slot outline-none focus-visible:border-gold",
          ratio === "4/5" ? "aspect-4/5" : "aspect-square",
        )}
      >
        {current.mimeType.startsWith("video/") ? (
          <span className="flex h-full items-center justify-center">
            <Eyebrow>Vidéo</Eyebrow>
          </span>
        ) : (
          <Image
            src={`/api/media/${current.id}`}
            alt={`Vue ${index + 1} : ${current.filename}`}
            fill
            sizes="600px"
            className="object-cover"
            unoptimized
          />
        )}

        {slides.length > 1 ? (
          <>
            {/* Les commandes sont posées sur l'image, comme sur les réseaux :
                les mettre en dessous décalerait tout le reste de la page. */}
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="Vue précédente"
              className="absolute top-1/2 left-2 flex h-8 w-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border-none bg-night/70 text-paper hover:bg-night"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label="Vue suivante"
              className="absolute top-1/2 right-2 flex h-8 w-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border-none bg-night/70 text-paper hover:bg-night"
            >
              ›
            </button>
            <span className="absolute top-2 right-2 rounded-control bg-night/70 px-2 py-[2px] text-micro font-medium text-paper tabular-nums">
              {index + 1} / {slides.length}
            </span>
          </>
        ) : null}
      </div>

      {slides.length > 1 ? (
        <div className="flex items-center justify-center gap-[6px]">
          {slides.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Aller à la vue ${i + 1}`}
              className={cn(
                "h-[6px] cursor-pointer rounded-[3px] border-none p-0 transition-all",
                i === index ? "w-5 bg-ink" : "w-[6px] bg-line-strong hover:bg-ink-3",
              )}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
