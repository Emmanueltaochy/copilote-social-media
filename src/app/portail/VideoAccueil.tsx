"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * La vidéo de bienvenue du portail.
 *
 * À la première visite (par personne et par version de la vidéo), elle s'ouvre
 * en grand dans une fenêtre par-dessus l'accueil. Une fois fermée, il n'en
 * reste qu'une petite vignette « Revoir la vidéo de bienvenue » : l'accueil
 * remonte et ce que le client vient faire (valider, suivre) passe devant.
 *
 * Une nouvelle vidéo (nouvelle version) se rouvre d'elle-même, une fois.
 */
export function VideoAccueil({ version, couleur, personne }: { version: string; couleur: string; personne: string }) {
  const cle = `portail-video-vue:${personne}:${version}`;
  const src = `/api/portail-video?v=${version}`;
  const [ouverte, setOuverte] = useState(false);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (localStorage.getItem(cle) !== "1") setOuverte(true);
    } catch {}
  }, [cle]);

  const fermer = useCallback(() => {
    setOuverte(false);
    try {
      localStorage.setItem(cle, "1");
    } catch {}
  }, [cle]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOuverte(true)}
        className="group flex w-full cursor-pointer items-center gap-4 rounded-card border border-line bg-paper p-2 pr-5 text-left text-ink shadow-soft hover:border-line-strong sm:w-fit"
        aria-label="Revoir la vidéo de bienvenue"
      >
        <span className="relative block aspect-video w-[112px] flex-none overflow-hidden rounded-[12px] bg-night">
          <video src={`${src}#t=6`} preload="metadata" muted playsInline className="pointer-events-none h-full w-full object-cover" tabIndex={-1} />
          <span className="absolute inset-0 flex items-center justify-center bg-black/25 transition group-hover:bg-black/10">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/95 shadow" style={{ color: couleur }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M8 5v14l11-7z" />
              </svg>
            </span>
          </span>
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="text-base font-semibold">Revoir la vidéo de bienvenue</span>
          <span className="text-small text-ink-3">Votre espace client, présenté par l&apos;agence</span>
        </span>
      </button>
      {ouverte ? <Fenetre src={src} onClose={fermer} /> : null}
    </>
  );
}

function Fenetre({ src, onClose }: { src: string; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const touche = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", touche);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Lecture directe quand le navigateur l'autorise (après un clic) ; sinon
    // les commandes de la vidéo restent là pour la lancer.
    video.current?.play().catch(() => {});
    return () => {
      window.removeEventListener("keydown", touche);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Vidéo de bienvenue"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="relative w-full max-w-[1000px]" onClick={(e) => e.stopPropagation()}>
        <video ref={video} src={src} controls playsInline preload="auto" onEnded={onClose} className="aspect-video w-full rounded-card bg-black shadow-2xl" />
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="text-small text-white/70">Bienvenue dans votre espace client.</span>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-full border-none bg-white px-5 py-2 text-base font-medium text-black hover:opacity-85"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
