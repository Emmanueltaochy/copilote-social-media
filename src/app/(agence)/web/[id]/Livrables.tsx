"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { addDeliverable } from "../actions";

const champ =
  "w-full rounded-control border border-line bg-paper px-2 py-[6px] text-small outline-none focus:border-gold";

/**
 * Soumettre une maquette au client.
 *
 * Deux façons de la lui montrer, parce qu'une agence travaille des deux :
 * coller un lien — Figma, préproduction, Drive — ou déposer un fichier, PDF ou
 * image. Le fichier passe par la route de dépôt en flux, comme les autres :
 * une planche de maquettes en PDF dépasse largement ce qu'une action serveur
 * accepte, et le dépassement s'y solde par un écran blanc.
 */
export function AjoutLivrable({ projectId, clientId }: { projectId: string; clientId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [mode, setMode] = useState<"lien" | "fichier">("lien");
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function soumettre(data: FormData) {
    setErreur(null);
    const label = String(data.get("label") ?? "").trim();
    if (!label) return setErreur("Donne un nom au livrable.");

    if (mode === "fichier") {
      const fichier = inputRef.current?.files?.[0];
      if (!fichier) return setErreur("Choisis un fichier.");

      setEnvoi(true);
      const résultat = await new Promise<{ id?: string; error?: string }>((resolve) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `/api/client-files?clientId=${encodeURIComponent(clientId)}`);
        xhr.setRequestHeader("x-filename", encodeURIComponent(fichier.name));
        xhr.setRequestHeader("x-filesize", String(fichier.size));
        xhr.setRequestHeader("x-label", encodeURIComponent(label));
        xhr.setRequestHeader("content-type", fichier.type || "application/octet-stream");
        xhr.onload = () => {
          try {
            const body = JSON.parse(xhr.responseText);
            if (xhr.status >= 200 && xhr.status < 300) return resolve({ id: body?.id });
            resolve({ error: body?.error ?? `Refusé par le serveur (${xhr.status}).` });
          } catch {
            resolve({ error: `Réponse illisible du serveur (${xhr.status}).` });
          }
        };
        xhr.onerror = () => resolve({ error: "Connexion interrompue pendant l'envoi." });
        xhr.send(fichier);
      });
      setEnvoi(false);

      if (résultat.error || !résultat.id) {
        return setErreur(résultat.error ?? "Le fichier n'a pas été enregistré.");
      }
      data.set("fileId", résultat.id);
      data.delete("url");
    }

    await addDeliverable(data);
    formRef.current?.reset();
    router.refresh();
  }

  return (
    <form
      ref={formRef}
      action={soumettre}
      // Désigne ce formulaire sans ambiguïté : la fiche en compte plusieurs,
      // et « le champ libellé » y existe à trois endroits.
      data-form="livrable"
      className="flex flex-col gap-2 px-[14px] py-3"
    >
      <input type="hidden" name="projectId" value={projectId} />

      <div className="flex gap-1 self-start rounded-control bg-canvas p-[3px]">
        {(["lien", "fichier"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`cursor-pointer rounded-[5px] border-none px-3 py-1 text-small font-medium ${
              mode === m ? "bg-paper text-ink" : "bg-transparent text-ink-3 hover:text-ink"
            }`}
          >
            {m === "lien" ? "Un lien" : "Un fichier"}
          </button>
        ))}
      </div>

      <input name="label" required placeholder="Maquette page d'accueil — v2" className={champ} />

      {mode === "lien" ? (
        <input
          name="url"
          type="url"
          required
          placeholder="https://www.figma.com/proto/…"
          className={champ}
        />
      ) : (
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,image/*,video/*"
          className={`${champ} file:mr-2 file:cursor-pointer file:rounded-control file:border file:border-line file:bg-canvas file:px-2 file:py-[2px] file:text-micro`}
        />
      )}

      <input name="note" placeholder="Ce qu'on demande de regarder (facultatif)" className={champ} />

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={envoi}
          className="cursor-pointer rounded-control border border-ink bg-ink px-[10px] py-[6px] text-small font-medium text-paper hover:bg-black disabled:opacity-60"
        >
          {envoi ? "Envoi du fichier…" : "Soumettre au client"}
        </button>
        <span className="text-small text-ink-3">
          Le client le voit aussitôt dans son espace et reçoit une notification.
        </span>
      </div>

      {erreur ? <p className="text-small text-alert">{erreur}</p> : null}
    </form>
  );
}
