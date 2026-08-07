"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

const MAX_IMAGE = 400 * 1024 * 1024;
const MAX_VIDEO = 4 * 1024 * 1024 * 1024;

const estVideo = (f: File) =>
  f.type.startsWith("video/") || /\.(mp4|m4v|mov|webm|mkv)$/i.test(f.name);

function poids(n: number): string {
  if (n < 1024) return `${n} o`;
  const u = ["Ko", "Mo", "Go", "To"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toLocaleString("fr-FR", { maximumFractionDigits: v < 10 ? 1 : 0 })} ${u[i]}`;
}

/**
 * Import direct depuis la fiche d'un contenu.
 *
 * Le fichier entre dans la bibliothèque du client et se rattache au contenu
 * dans le même geste. Passer par l'écran Assets puis revenir chercher le
 * média dans une liste fonctionne, mais fait trois écrans pour une seule
 * intention — et personne ne fait trois écrans quand il est pressé.
 */
export function DirectUpload({ contentId, clientId }: { contentId: string; clientId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    const files = Array.from(inputRef.current?.files ?? []);
    if (files.length === 0) return setError("Choisis un fichier.");

    const lourd = files.find((f) => f.size > (estVideo(f) ? MAX_VIDEO : MAX_IMAGE));
    if (lourd) {
      return setError(
        `${lourd.name} pèse ${poids(lourd.size)}, au-delà des ` +
          `${poids(estVideo(lourd) ? MAX_VIDEO : MAX_IMAGE)} autorisés pour ` +
          `${estVideo(lourd) ? "une vidéo" : "une image"}. Pour un fichier plus gros, ajoute un lien.`,
      );
    }

    setError(null);
    for (const file of files) {
      const result = await new Promise<{ error?: string }>((resolve) => {
        const xhr = new XMLHttpRequest();
        xhr.open(
          "POST",
          `/api/upload?clientId=${encodeURIComponent(clientId)}&contentId=${encodeURIComponent(contentId)}`,
        );
        xhr.setRequestHeader("x-filename", encodeURIComponent(file.name));
        xhr.setRequestHeader("x-filesize", String(file.size));
        xhr.setRequestHeader("content-type", file.type || "application/octet-stream");
        xhr.upload.onprogress = (e) => setProgress(Math.round((e.loaded / file.size) * 100));
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) return resolve({});
          let message = `Refusé par le serveur (${xhr.status}).`;
          if (xhr.status === 413) {
            message =
              "Refusé par le serveur web avant d'arriver à l'application : sa limite de taille n'est pas levée.";
          }
          try {
            const body = JSON.parse(xhr.responseText);
            if (body?.error) message = body.error;
          } catch {
            // Réponse illisible : le message par défaut suffit.
          }
          resolve({ error: message });
        };
        xhr.onerror = () => resolve({ error: "Connexion interrompue pendant l'envoi." });
        xhr.send(file);
      });

      if (result.error) {
        setError(`${file.name} : ${result.error}`);
        break;
      }
    }

    setProgress(null);
    if (inputRef.current) inputRef.current.value = "";
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/*,video/*"
          disabled={progress !== null}
          onChange={() => setError(null)}
          className="min-w-0 flex-1 rounded-control border border-line bg-paper px-2 py-[5px] text-small file:mr-2 file:cursor-pointer file:rounded-control file:border file:border-line file:bg-canvas file:px-2 file:py-[2px] file:text-micro disabled:opacity-60"
        />
        <button
          type="button"
          onClick={send}
          disabled={progress !== null}
          className="flex-none cursor-pointer rounded-control border border-line bg-paper px-[10px] py-[6px] text-small font-medium text-ink-2 hover:border-line-strong hover:text-ink disabled:opacity-60"
        >
          {progress !== null ? `Envoi ${progress} %` : "Importer et rattacher"}
        </button>
      </div>
      {error ? <p className="text-small leading-snug text-alert">{error}</p> : null}
    </div>
  );
}
