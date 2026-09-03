"use client";

import Link from "next/link";
import { Carousel, type Slide } from "@/components/ui/Carousel";
import { Cover, type CoverAsset } from "@/components/ui/Cover";
import { ActionsValidation } from "./ActionsValidation";

/**
 * La réponse du client sur un contenu.
 *
 * Deux gestes, et un seul écran : valider, ou dire ce qui doit changer. Le
 * refus demande un motif — sans lui, la fabrication repart à l'aveugle et le
 * même aller-retour se reproduit.
 */
export function ValidationCard({
  id,
  title,
  kind,
  cover,
  slides,
  links,
  scheduled,
  waitingSince,
}: {
  id: string;
  title: string;
  kind: string;
  cover: CoverAsset;
  /** Vues d'un carrousel, dans l'ordre. Vide pour les autres formats. */
  slides: Slide[];
  /** Liens externes — Drive le plus souvent — quand le fichier vit ailleurs. */
  links: { id: string; url: string; label: string | null }[];
  scheduled: string | null;
  waitingSince: string | null;
}) {
  return (
    <div className="flex flex-col gap-4 border-b border-line px-4 py-5 sm:flex-row sm:gap-5 sm:px-6">
      {/* Le visuel occupe la gauche, à une taille où l'on voit vraiment ce
          qu'on approuve : un cadrage ou une faute de date se repèrent à cette
          échelle, pas sur une vignette. */}
      {slides.length > 1 ? (
        // Le carrousel garde ses flèches : l'envelopper d'un lien rendrait le
        // défilement impossible au doigt. On passe par le titre pour ouvrir.
        <Carousel slides={slides} className="w-full sm:w-[180px] sm:flex-none" />
      ) : !cover && links.length > 0 ? (
        // Rien n'est hébergé ici, mais le contenu existe : une vidéo trop
        // lourde reste sur un Drive. Le cadre gris « visuel à venir » ferait
        // croire que la fabrication n'est pas commencée.
        <a
          href={links[0].url}
          target="_blank"
          rel="noreferrer"
          className="flex aspect-4/5 w-full items-center justify-center sm:w-[180px] sm:flex-none rounded-card border border-dashed border-line bg-slot px-3 text-center text-base font-medium text-ink-2 no-underline hover:border-gold hover:text-ink hover:no-underline"
        >
          Ouvrir le contenu ↗
        </a>
      ) : (
        <Link
          href={`/portail/contenu/${id}`}
          className="w-full no-underline hover:no-underline sm:w-[180px] sm:flex-none"
        >
          <Cover asset={cover} ratio="4/5" className="w-full" label="Visuel à venir" />
        </Link>
      )}

      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <span className="flex min-w-0 flex-col">
            <span className="eyebrow text-ink-3">{kind}</span>
            {/* Le titre ouvre le contenu en grand : sur un téléphone, une
                vignette de 180 px ne suffit pas à juger un cadrage. */}
            <Link
              href={`/portail/contenu/${id}`}
              className="clip text-lead font-medium text-ink no-underline hover:underline"
            >
              {title}
            </Link>
          </span>
          <span className="text-base text-ink-3">
            {scheduled ? `Prévu le ${scheduled}` : "Date à définir"}
            {waitingSince ? ` · en attente depuis le ${waitingSince}` : ""}
          </span>
        </div>

        {links.length > 0 ? (
          <div className="flex flex-col gap-1 rounded-control border border-line bg-canvas px-3 py-[10px]">
            <span className="eyebrow text-ink-3">
              {links.length > 1 ? "À consulter" : "Le contenu à valider"}
            </span>
            {links.map((l) => (
              <a
                key={l.id}
                href={l.url}
                target="_blank"
                rel="noreferrer"
                className="clip text-base font-medium"
              >
                {l.label || l.url} ↗
              </a>
            ))}
            <span className="text-small text-ink-3">
              Le fichier est trop lourd pour être affiché ici : il s&apos;ouvre dans un nouvel
              onglet.
            </span>
          </div>
        ) : null}

        <ActionsValidation id={id} />

      </div>
    </div>
  );
}
