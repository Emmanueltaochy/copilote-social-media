"use client";

import { useActionState, useEffect } from "react";
import { cn } from "@/lib/cn";
import {
  basculerPret,
  cocherPreparation,
  commenterVideo,
  marquerTournagesVus,
  type TournageClientState,
} from "../actions-tournages";

/*
 * Les gestes du client sur la page Tournages. Chaque bouton fait 44 px de
 * haut au moins : la page est pensée pour le pouce.
 */

function Message({ s }: { s: TournageClientState }) {
  if (s.error) return <p className="text-small text-alert" role="alert">{s.error}</p>;
  return null;
}

/** « Je suis prêt » pour une vidéo. */
export function BoutonPret({ videoId, pret, accent }: { videoId: string; pret: boolean; accent: string }) {
  const [state, action, pending] = useActionState<TournageClientState, FormData>(basculerPret, {});
  // Pendant l'envoi, le bouton montre déjà le nouvel état.
  const affiche = pending ? !pret : pret;
  return (
    <form action={action} className="flex flex-col gap-1">
      <input type="hidden" name="videoId" value={videoId} />
      <button
        type="submit"
        aria-pressed={affiche}
        data-bouton-pret={videoId}
        className={cn(
          "flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-full border-2 px-5 text-base font-semibold transition-colors sm:w-auto",
          affiche ? "border-ok bg-ok-bg text-ok" : "border-transparent text-white",
        )}
        style={affiche ? undefined : { background: accent }}
      >
        <span
          aria-hidden
          className={cn(
            "flex h-6 w-6 items-center justify-center rounded-full text-small",
            affiche ? "bg-ok text-white" : "bg-white/25",
          )}
        >
          ✓
        </span>
        {affiche ? "Vous êtes prêt · annuler" : "Je suis prêt pour cette vidéo"}
      </button>
      <Message s={state} />
    </form>
  );
}

/** Une chose à préparer, à cocher. */
export function CasePreparation({
  videoId,
  item,
  label,
  fait,
  pour,
}: {
  videoId: string;
  item: string;
  label: string;
  fait: boolean;
  /** « Vidéo 2 · La visite de l'atelier », dans le récapitulatif. */
  pour?: string;
}) {
  const [state, action, pending] = useActionState<TournageClientState, FormData>(cocherPreparation, {});
  const coche = pending ? !fait : fait;
  return (
    <form action={action}>
      <input type="hidden" name="videoId" value={videoId} />
      <input type="hidden" name="item" value={item} />
      <button
        type="submit"
        role="checkbox"
        aria-checked={coche}
        data-case={item}
        className="flex min-h-11 w-full cursor-pointer items-start gap-3 rounded-[14px] border-none bg-transparent px-1 py-[10px] text-left hover:bg-mute"
      >
        <span
          aria-hidden
          className={cn(
            "mt-[1px] flex h-6 w-6 flex-none items-center justify-center rounded-[7px] border-2 text-small font-bold",
            coche ? "border-ok bg-ok text-white" : "border-line-strong bg-paper",
          )}
        >
          {coche ? "✓" : ""}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className={cn("text-base break-words", coche ? "text-ink-3 line-through" : "text-ink")}>{label}</span>
          {pour ? <span className="text-small break-words text-ink-3">{pour}</span> : null}
        </span>
      </button>
      <Message s={state} />
    </form>
  );
}

/**
 * Une question ou une remarque sur une vidéo. Repliée par défaut : la page
 * reste lisible sur téléphone, et le champ s'ouvre d'un geste.
 */
export function FormQuestion({ videoId }: { videoId: string }) {
  const [state, action, pending] = useActionState<TournageClientState, FormData>(commenterVideo, {});
  return (
    <details className="group" data-question={videoId}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-base font-medium text-ink [&::-webkit-details-marker]:hidden">
        <span aria-hidden className="flex h-6 w-6 items-center justify-center rounded-full bg-mute text-small group-open:rotate-45">
          +
        </span>
        Une question, une remarque ?
      </summary>
      <form action={action} className="mt-2 flex flex-col gap-2">
        <input type="hidden" name="videoId" value={videoId} />
        <textarea
          name="body"
          required
          rows={3}
          maxLength={2000}
          aria-label="Votre question ou remarque"
          placeholder="Par exemple : je préfère dire cette phrase autrement…"
          className="min-h-11 w-full rounded-[14px] border border-line bg-paper px-3 py-2 text-base text-ink outline-none focus:border-ink-3"
        />
        <button
          type="submit"
          disabled={pending}
          className="min-h-11 w-full cursor-pointer rounded-full border border-line bg-paper px-5 text-base font-medium text-ink hover:border-line-strong disabled:opacity-60 sm:w-fit"
        >
          {pending ? "Envoi…" : "Envoyer à l'équipe"}
        </button>
        <Message s={state} />
      </form>
      {state.ok ? (
        <p className="text-small text-ok" role="status">
          {state.ok}
        </p>
      ) : null}
    </details>
  );
}

/** Marque les nouveautés comme vues, une fois la page affichée (jamais en aperçu : l'action refuse). */
export function MarquerVu() {
  useEffect(() => {
    marquerTournagesVus().catch(() => undefined);
  }, []);
  return null;
}
