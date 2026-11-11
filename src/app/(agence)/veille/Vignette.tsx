"use client";

import { useState } from "react";

/**
 * Aperçu d'une publication suivie : la miniature si elle existe, sinon la première image de la vidéo
 * (Reel, Short), sinon un cadre « ▶ Reel » — jamais un carré vide. L'image passe par /api/vignette, qui la
 * garde sur notre serveur dès la première visite (les adresses d'Instagram expirent au bout de quelques jours).
 */
export function Vignette({ imageUrl, videoUrl, type }: { imageUrl: string | null; videoUrl: string | null; type: string }) {
  const [etape, setEtape] = useState<"image" | "video" | "rien">(imageUrl ? "image" : videoUrl ? "video" : "rien");
  const video = /reel|video|short/i.test(type) || !!videoUrl;

  if (etape === "image" && imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/api/vignette?u=${encodeURIComponent(imageUrl)}`}
        alt=""
        className="h-full w-full object-cover"
        referrerPolicy="no-referrer"
        loading="lazy"
        onError={() => setEtape(videoUrl ? "video" : "rien")}
      />
    );
  }
  if (etape === "video" && videoUrl) {
    return (
      <video
        src={`${videoUrl}${videoUrl.includes("#") ? "" : "#t=0.5"}`}
        className="pointer-events-none h-full w-full object-cover"
        muted
        playsInline
        preload="metadata"
        onError={() => setEtape("rien")}
      />
    );
  }
  return (
    <span className="flex h-full w-full flex-col items-center justify-center gap-2 bg-linear-to-br from-mute to-line text-ink-2">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-paper/90 text-ink shadow-soft">
        {video ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M8 5v14l11-7z" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <rect x="3" y="3" width="18" height="18" rx="3" />
            <circle cx="9" cy="9" r="2" />
            <path d="m21 15-5-5L5 21" />
          </svg>
        )}
      </span>
      <span className="text-small font-medium">{video ? "Reel · voir la vidéo" : "Voir la publication"}</span>
    </span>
  );
}
