"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";

const NOM: Record<string, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  facebook: "Facebook",
  vimeo: "Vimeo",
  autre: "Lien",
};

/** Une pastille de couleur par plateforme : on la reconnaît avant de lire. */
const TEINTE: Record<string, string> = {
  instagram: "linear-gradient(135deg,#f58529,#dd2a7b 55%,#8134af)",
  tiktok: "#111111",
  youtube: "#e62117",
  facebook: "#1877f2",
  vimeo: "#1ab7ea",
  autre: "#6b7280",
};

/**
 * Une vidéo de référence : sa vignette quand on l'a, sinon une carte avec la
 * plateforme et l'adresse. Toujours un lien qui s'ouvre dans un nouvel onglet.
 *
 * Les vignettes des réseaux expirent (TikTok, Instagram signent leurs
 * adresses pour quelques jours) : une image qui ne charge plus laisse place à
 * la carte au lieu d'un cadre vide.
 */
export function ReferenceVideo({
  url,
  plateforme,
  vignette,
  auteur,
  compact = false,
}: {
  url: string;
  plateforme: string;
  vignette?: string | null;
  auteur?: string | null;
  compact?: boolean;
}) {
  const [casse, setCasse] = useState(false);
  const nom = NOM[plateforme] ?? "Lien";
  let adresse = url;
  try {
    const u = new URL(url);
    adresse = `${u.hostname.replace(/^www\./, "")}${u.pathname.length > 1 ? u.pathname : ""}`;
  } catch {
    /* l'adresse brute */
  }
  const image = vignette && !casse;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      data-reference={plateforme}
      className={cn(
        "group flex min-h-11 min-w-0 items-center gap-3 rounded-[16px] border border-line bg-paper p-2 pr-3 text-ink no-underline hover:border-line-strong hover:no-underline",
        compact ? "" : "sm:max-w-[420px]",
      )}
    >
      <span
        className={cn(
          "relative flex flex-none items-center justify-center overflow-hidden rounded-[12px] text-white",
          compact ? "h-11 w-11" : "h-[72px] w-[56px]",
        )}
        style={{ background: TEINTE[plateforme] ?? TEINTE.autre }}
      >
        {image ? (
          // Image hébergée par la plateforme : hors du pipeline d'images.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={vignette!}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setCasse(true)}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : null}
        <span className={cn("relative flex items-center justify-center rounded-full", image ? "h-7 w-7 bg-black/55" : "h-7 w-7")} aria-hidden>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <path d="M3 1.8v8.4c0 .5.5.8.9.5l6.6-4.2a.6.6 0 0 0 0-1L3.9 1.3c-.4-.3-.9 0-.9.5Z" />
          </svg>
        </span>
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
        <span className="text-small font-semibold">
          Vidéo de référence · {nom}
          {auteur ? <span className="font-normal text-ink-3"> · {auteur}</span> : null}
        </span>
        <span className="clip text-small text-ink-3">{adresse}</span>
      </span>
      <span aria-hidden className="flex-none text-ink-3 group-hover:text-ink">
        ↗
      </span>
      <span className="sr-only">(s&apos;ouvre dans un nouvel onglet)</span>
    </a>
  );
}
