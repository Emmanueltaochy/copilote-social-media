"use client";

import { useEffect, useState } from "react";

/**
 * La vidéo d'accueil, en haut du portail.
 *
 * Visible dès l'arrivée. Le client peut la replier une fois vue : il revient
 * ensuite pour valider ses contenus, et une vidéo déjà regardée qui repousse
 * ses validations sous la ligne de flottaison le ralentirait chaque fois. Le
 * choix est retenu par navigateur, et un lien permet de la revoir.
 *
 * Pas de lecture automatique : les navigateurs la bloquent avec le son, et une
 * vidéo de présentation sans le son ne présente rien.
 */
export function VideoAccueil({ version, couleur }: { version: string; couleur: string }) {
  const cle = `portail-video-masquee:${version}`;
  const [masquee, setMasquee] = useState(false);

  useEffect(() => {
    try {
      // Lu après le montage : le serveur ne connaît pas le choix, et la vidéo
      // doit s'afficher par défaut plutôt que de clignoter.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (localStorage.getItem(cle) === "1") setMasquee(true);
    } catch {}
  }, [cle]);

  const basculer = (valeur: boolean) => {
    setMasquee(valeur);
    try {
      if (valeur) localStorage.setItem(cle, "1");
      else localStorage.removeItem(cle);
    } catch {}
  };

  if (masquee) {
    return (
      <button
        type="button"
        onClick={() => basculer(false)}
        className="self-start cursor-pointer text-base font-medium hover:underline"
        style={{ color: couleur }}
      >
        ▶ Revoir la vidéo de bienvenue
      </button>
    );
  }

  return (
    <section className="flex flex-col gap-2" aria-label="Vidéo de bienvenue">
      <video
        src={`/api/portail-video?v=${version}`}
        controls
        preload="metadata"
        playsInline
        className="aspect-video w-full rounded-card bg-night"
      />
      <button
        type="button"
        onClick={() => basculer(true)}
        className="self-end cursor-pointer text-small text-ink-3 hover:text-ink hover:underline"
      >
        Masquer la vidéo
      </button>
    </section>
  );
}
