"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/ui/primitives";
import { removeAvatar } from "./actions";

const MAX = 25 * 1024 * 1024;

/**
 * Sa photo de profil.
 *
 * L'envoi passe par une requête directe plutôt que par un formulaire classique :
 * une photo prise au téléphone dépasse souvent la taille qu'une action serveur
 * accepte, et ce dépassement se solde par un écran blanc sans explication.
 */
export function AvatarForm({
  userId,
  initials,
  hasPhoto,
}: {
  userId: string;
  initials: string;
  hasPhoto: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Change à chaque envoi pour forcer le navigateur à relire l'image : sans
  // cela, on croit que la nouvelle photo n'est pas partie.
  const [version, setVersion] = useState(0);

  async function envoyer(file: File) {
    if (file.size > MAX) {
      setError("Photo trop lourde : 25 Mo au maximum.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/avatar", {
        method: "POST",
        headers: {
          "x-filename": encodeURIComponent(file.name),
          "x-filesize": String(file.size),
          "content-type": file.type || "application/octet-stream",
        },
        body: file,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? `Refusé par le serveur (${res.status}).`);
      } else {
        setVersion((v) => v + 1);
        router.refresh();
      }
    } catch {
      setError("Envoi impossible : vérifie ta connexion.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const src = hasPhoto || version > 0 ? `/api/avatar/${userId}?v=${version}` : null;

  return (
    <div className="flex flex-wrap items-center gap-4">
      <Avatar initials={initials} src={src} size={72} />

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void envoyer(file);
            }}
            className="min-w-0 flex-1 rounded-control border border-line bg-paper px-2 py-[5px] text-small file:mr-2 file:cursor-pointer file:rounded-control file:border file:border-line file:bg-canvas file:px-2 file:py-[2px] file:text-micro disabled:opacity-60"
          />
          {hasPhoto ? (
            <form action={removeAvatar}>
              <button
                type="submit"
                disabled={busy}
                className="cursor-pointer rounded-control border border-line bg-paper px-[10px] py-[6px] text-small text-ink-2 hover:border-alert hover:text-alert disabled:opacity-60"
              >
                Retirer
              </button>
            </form>
          ) : null}
        </div>

        <p className="text-small text-ink-3">
          {busy
            ? "Envoi en cours…"
            : "Elle apparaît dans la messagerie, sur les tournages et partout où votre nom est cité. Sans photo, vos initiales font l'affaire."}
        </p>
        {error ? <p className="text-small text-alert">{error}</p> : null}
      </div>
    </div>
  );
}
