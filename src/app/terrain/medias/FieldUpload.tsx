"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Envoi depuis le téléphone.
 *
 * L'attribut de capture n'est volontairement pas posé : sur le terrain, on
 * envoie presque toujours une prise déjà faite, et forcer l'appareil photo
 * obligerait à refaire la photo qu'on a déjà.
 *
 * Un fichier après l'autre, avec l'avancement en pourcentage : sur un réseau
 * mobile, une barre immobile est indiscernable d'un envoi bloqué.
 */
export function FieldUpload({ clients }: { clients: { id: string; name: string }[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [clientId, setClientId] = useState("");
  const [etat, setEtat] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    if (!clientId) return setError("Choisis un client.");
    const files = Array.from(inputRef.current?.files ?? []);
    if (files.length === 0) return setError("Choisis un fichier.");

    setError(null);
    for (const [i, file] of files.entries()) {
      const result = await new Promise<{ error?: string }>((resolve) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `/api/upload?clientId=${encodeURIComponent(clientId)}`);
        xhr.setRequestHeader("x-filename", encodeURIComponent(file.name));
        xhr.setRequestHeader("x-filesize", String(file.size));
        xhr.setRequestHeader("content-type", file.type || "application/octet-stream");
        xhr.upload.onprogress = (e) =>
          setEtat(`${i + 1}/${files.length} · ${Math.round((e.loaded / file.size) * 100)} %`);
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) return resolve({});
          let message = `Refusé (${xhr.status}).`;
          try {
            const body = JSON.parse(xhr.responseText);
            if (body?.error) message = body.error;
          } catch {
            // Message par défaut.
          }
          resolve({ error: message });
        };
        xhr.onerror = () => resolve({ error: "Connexion interrompue." });
        xhr.send(file);
      });

      if (result.error) {
        setError(`${file.name} : ${result.error}`);
        break;
      }
    }

    setEtat(null);
    if (inputRef.current) inputRef.current.value = "";
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2 rounded-card border border-line bg-paper p-3">
      <select
        value={clientId}
        onChange={(e) => setClientId(e.target.value)}
        className="w-full rounded-control border border-line bg-paper px-3 py-[10px] text-base outline-none focus:border-gold"
      >
        <option value="" disabled>
          Choisir un client…
        </option>
        {clients.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*,video/*"
        onChange={() => setError(null)}
        className="w-full rounded-control border border-line bg-paper px-3 py-[8px] text-small file:mr-2 file:cursor-pointer file:rounded-control file:border file:border-line file:bg-canvas file:px-2 file:py-1 file:text-small"
      />

      <button
        type="button"
        onClick={send}
        disabled={etat !== null}
        className="w-full cursor-pointer rounded-control border border-ink bg-ink px-3 py-[10px] text-base font-medium text-paper disabled:opacity-60"
      >
        {etat ?? "Envoyer"}
      </button>

      {error ? <p className="text-small leading-snug text-alert">{error}</p> : null}
    </div>
  );
}
