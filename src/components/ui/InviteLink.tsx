"use client";

import { useState } from "react";

/**
 * Le lien d'invitation à envoyer au contact.
 *
 * Il est affiché en entier et copiable d'un clic : un chemin partiel obligerait
 * à reconstruire l'adresse à la main, et une invitation mal recopiée renvoie
 * simplement « lien expiré » sans dire pourquoi.
 *
 * L'adresse complète vient du serveur, qui lit l'en-tête d'hôte : la calculer
 * dans le navigateur produirait un rendu différent de celui du serveur, et
 * React garderait alors la version incomplète.
 */
export function InviteLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <span className="flex min-w-0 flex-[2] flex-col gap-1">
      <span className="eyebrow text-gold">Invitation à envoyer</span>
      <span className="flex min-w-0 items-center gap-1">
        <input
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 rounded-control border border-line bg-canvas px-2 py-1 text-micro text-ink-2 outline-none focus:border-gold"
        />
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch {
              // Sans presse-papiers (navigateur ancien, page non sécurisée),
              // le champ reste sélectionnable : rien n'est perdu.
            }
          }}
          className="flex-none cursor-pointer rounded-control border border-line bg-paper px-2 py-1 text-micro text-ink-2 hover:border-line-strong hover:text-ink"
        >
          {copied ? "Copié" : "Copier"}
        </button>
      </span>
    </span>
  );
}
