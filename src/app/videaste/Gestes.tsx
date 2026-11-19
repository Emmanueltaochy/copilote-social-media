"use client";

import { useActionState, useEffect } from "react";
import { cn } from "@/lib/cn";
import { basculerTournee, indiquerRushes, marquerVuesVideaste, noterTournage, type VideasteState } from "./actions";

/* Les gestes du vidéaste, au pouce : 44 px de haut au moins. */

function Message({ s }: { s: VideasteState }) {
  if (s.error) return <p className="text-small text-alert" role="alert">{s.error}</p>;
  if (s.ok) return <p className="text-small text-ok" role="status">{s.ok}</p>;
  return null;
}

/** « Tournée » : un bouton plein largeur, l'état visible pendant l'envoi. */
export function BoutonTournee({ videoId, tournee }: { videoId: string; tournee: boolean }) {
  const [state, action, pending] = useActionState<VideasteState, FormData>(basculerTournee, {});
  const affiche = pending ? !tournee : tournee;
  return (
    <form action={action} className="flex flex-col gap-1">
      <input type="hidden" name="videoId" value={videoId} />
      <button
        type="submit"
        aria-pressed={affiche}
        data-bouton-tournee={videoId}
        className={cn(
          "flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-full border-2 px-5 text-base font-semibold",
          affiche ? "border-ok bg-ok-bg text-ok" : "border-night bg-night text-white",
        )}
      >
        <span aria-hidden>✓</span>
        {affiche ? "Tournée · annuler" : "Marquer tournée"}
      </button>
      {state.error ? <Message s={state} /> : null}
    </form>
  );
}

/** Une note de tournage, pour l'équipe. */
export function FormNote({ videoId }: { videoId: string }) {
  const [state, action, pending] = useActionState<VideasteState, FormData>(noterTournage, {});
  return (
    <form action={action} className="flex flex-col gap-2" data-note={videoId}>
      <input type="hidden" name="videoId" value={videoId} />
      <label className="flex flex-col gap-1">
        <span className="text-small font-medium text-ink-2">Note de tournage (pour l&apos;équipe)</span>
        <textarea
          name="body"
          required
          rows={2}
          maxLength={2000}
          placeholder="Prise 3 la meilleure · manque un plan produit…"
          className="min-h-11 w-full rounded-[14px] border border-line bg-paper px-3 py-2 text-base text-ink outline-none focus:border-ink-3"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="min-h-11 w-full cursor-pointer rounded-full border border-line bg-paper px-5 text-base font-medium text-ink hover:border-line-strong disabled:opacity-60 sm:w-fit"
      >
        {pending ? "Enregistrement…" : "Ajouter la note"}
      </button>
      <Message s={state} />
    </form>
  );
}

/** Où sont les rushes : le lien du dossier. */
export function FormRushes({ shootId, lien }: { shootId: string; lien: string | null }) {
  const [state, action, pending] = useActionState<VideasteState, FormData>(indiquerRushes, {});
  return (
    <form action={action} className="flex flex-col gap-2" data-rushes={shootId}>
      <input type="hidden" name="shootId" value={shootId} />
      <label className="flex flex-col gap-1">
        <span className="text-small font-medium text-ink-2">Lien du dossier des rushes (Drive, WeTransfer…)</span>
        <input
          name="url"
          type="url"
          inputMode="url"
          required
          defaultValue={lien ?? ""}
          placeholder="https://drive.google.com/drive/folders/…"
          className="min-h-11 w-full min-w-0 rounded-[14px] border border-line bg-paper px-3 py-2 text-base text-ink outline-none focus:border-ink-3"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="min-h-11 w-full cursor-pointer rounded-full border border-night bg-night px-5 text-base font-semibold text-white disabled:opacity-60 sm:w-fit"
      >
        {pending ? "Enregistrement…" : lien ? "Mettre à jour le lien" : "Enregistrer le lien"}
      </button>
      <Message s={state} />
    </form>
  );
}

/** Les notifications sont vues une fois la page affichée. */
export function MarquerVuesVideaste() {
  useEffect(() => {
    marquerVuesVideaste().catch(() => undefined);
  }, []);
  return null;
}
