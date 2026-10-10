"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * La vidéo d'accueil du portail client.
 *
 * Envoyée par XMLHttpRequest plutôt que `fetch` : c'est le seul des deux qui
 * rapporte la progression d'un envoi, et une vidéo de plusieurs dizaines de
 * mégaoctets sans barre de progression ressemble à un écran figé.
 */
export function VideoPortail({ version }: { version: string | null }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [progression, setProgression] = useState<number | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const occupé = progression !== null;

  function envoyer() {
    const file = inputRef.current?.files?.[0];
    if (!file) return setErreur("Choisis une vidéo.");
    setErreur(null);
    setProgression(0);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/portail-video");
    xhr.setRequestHeader("content-type", file.type || "application/octet-stream");
    xhr.setRequestHeader("x-filename", encodeURIComponent(file.name));
    xhr.setRequestHeader("x-filesize", String(file.size));
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) setProgression(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      setProgression(null);
      if (xhr.status >= 200 && xhr.status < 300) {
        if (inputRef.current) inputRef.current.value = "";
        router.refresh();
      } else {
        let message = "Envoi refusé.";
        try {
          message = JSON.parse(xhr.responseText).error ?? message;
        } catch {}
        setErreur(message);
      }
    };
    xhr.onerror = () => {
      setProgression(null);
      setErreur("Connexion interrompue pendant l'envoi. Relance la vidéo.");
    };
    xhr.send(file);
  }

  async function retirer() {
    setProgression(0);
    await fetch("/api/portail-video", { method: "DELETE" });
    setProgression(null);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      {version ? (
        <video
          key={version}
          src={`/api/portail-video?v=${version}`}
          controls
          preload="metadata"
          playsInline
          className="aspect-video w-full rounded-card border border-line bg-night"
        />
      ) : (
        <p className="text-base text-ink-2">
          Aucune vidéo. Une fois envoyée, elle s&apos;affiche en haut de l&apos;accueil du portail,
          dès que le client arrive.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="video/mp4,video/webm,video/quicktime"
          disabled={occupé}
          onChange={() => setErreur(null)}
          className="min-w-0 flex-1 rounded-control border border-line bg-paper px-2 py-[5px] text-small file:mr-2 file:cursor-pointer file:rounded-control file:border file:border-line file:bg-canvas file:px-2 file:py-[2px] file:text-micro disabled:opacity-60"
        />
        <button
          type="button"
          onClick={envoyer}
          disabled={occupé}
          className="flex-none cursor-pointer rounded-control border border-line bg-paper px-[10px] py-[6px] text-small font-medium text-ink-2 hover:border-line-strong hover:text-ink disabled:opacity-60"
        >
          {occupé ? `Envoi… ${progression} %` : version ? "Remplacer" : "Envoyer"}
        </button>
        {version ? (
          <button
            type="button"
            onClick={retirer}
            disabled={occupé}
            className="flex-none cursor-pointer rounded-control border border-line bg-paper px-[10px] py-[6px] text-small text-ink-3 hover:border-alert hover:text-alert disabled:opacity-60"
          >
            Retirer
          </button>
        ) : null}
      </div>

      {erreur ? (
        <p className="text-small text-alert">{erreur}</p>
      ) : (
        <p className="text-small text-ink-3">
          MP4 conseillé : c&apos;est le seul format lu par tous les navigateurs, iPhone compris. Un
          MOV ne se lit que sur les appareils Apple. Jusqu&apos;à 1 Go, mais une vidéo légère
          (moins de 50 Mo) démarre vite, même sur un téléphone en 4G.
        </p>
      )}
    </div>
  );
}
