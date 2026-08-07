"use client";

import { useState } from "react";

/**
 * La légende, copiable d'un geste.
 *
 * Sur un téléphone, sélectionner un paragraphe à la main est pénible et se
 * termine souvent par une sélection incomplète — qui publie une légende
 * tronquée.
 */
export function CopyText({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex flex-col gap-1">
      <p className="rounded-control border border-line bg-canvas px-3 py-2 text-base leading-snug whitespace-pre-line text-ink-2">
        {text}
      </p>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            // Sans presse-papiers, le texte reste sélectionnable au-dessus.
          }
        }}
        className="w-full cursor-pointer rounded-control border border-line bg-paper px-3 py-2 text-base font-medium text-ink-2"
      >
        {copied ? "Légende copiée" : "Copier la légende"}
      </button>
    </div>
  );
}
