"use client";

import { useActionState } from "react";
import { Carousel, type Slide } from "@/components/ui/Carousel";
import { Cover, type CoverAsset } from "@/components/ui/Cover";
import { clientApprove, clientRequestChange, type PortalFormState } from "./actions";

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
  const [approveState, approveAction, approving] = useActionState<PortalFormState, FormData>(
    clientApprove,
    {},
  );
  const [changeState, changeAction, changing] = useActionState<PortalFormState, FormData>(
    clientRequestChange,
    {},
  );

  const state = approveState.ok || approveState.error ? approveState : changeState;

  return (
    <div className="flex flex-col gap-4 border-b border-line px-4 py-5 sm:flex-row sm:gap-5 sm:px-6">
      {/* Le visuel occupe la gauche, à une taille où l'on voit vraiment ce
          qu'on approuve : un cadrage ou une faute de date se repèrent à cette
          échelle, pas sur une vignette. */}
      {slides.length > 1 ? (
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
        <Cover asset={cover} ratio="4/5" className="w-full sm:w-[180px] sm:flex-none" label="Visuel à venir" />
      )}

      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <span className="flex min-w-0 flex-col">
            <span className="eyebrow text-ink-3">{kind}</span>
            <span className="text-lead font-medium">{title}</span>
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

      {state.ok ? (
        <p className="rounded-control border border-ok bg-ok-bg px-3 py-2 text-base text-ok">
          {state.ok}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-2">
            <form action={approveAction} className="flex-none">
              <input type="hidden" name="id" value={id} />
              <button
                type="submit"
                disabled={approving || changing}
                className="cursor-pointer rounded-control border border-ink bg-ink px-3 py-2 text-base font-medium text-paper hover:bg-black disabled:opacity-60"
              >
                {approving ? "Un instant…" : "Valider"}
              </button>
            </form>

            <form action={changeAction} className="flex min-w-[280px] flex-1 items-end gap-2">
              <input type="hidden" name="id" value={id} />
              <label className="flex min-w-0 flex-1 flex-col gap-[6px]">
                <span className="eyebrow text-ink-3">Demander une modification</span>
                <input
                  name="note"
                  placeholder="Le logo est trop petit, et la date est le 14 et non le 12."
                  className="w-full rounded-control border border-line bg-paper px-3 py-2 text-base outline-none focus:border-gold"
                />
              </label>
              <button
                type="submit"
                disabled={approving || changing}
                className="flex-none cursor-pointer rounded-control border border-line bg-paper px-3 py-2 text-base font-medium text-ink-2 hover:border-line-strong hover:text-ink disabled:opacity-60"
              >
                {changing ? "Un instant…" : "Envoyer"}
              </button>
            </form>
          </div>

          {state.error ? (
            <p className="rounded-control border border-alert-line bg-alert-bg px-3 py-2 text-base text-alert">
              {state.error}
            </p>
          ) : null}
          </>
        )}
      </div>
    </div>
  );
}
