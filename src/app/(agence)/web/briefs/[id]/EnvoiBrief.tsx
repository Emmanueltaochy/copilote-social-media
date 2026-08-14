"use client";

import { useActionState } from "react";
import { sendBrief, type WebFormState } from "../../actions";

export function EnvoiBrief({ id, dejaEnvoye }: { id: string; dejaEnvoye: boolean }) {
  const [state, action, pending] = useActionState<WebFormState, FormData>(sendBrief, {});

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="id" value={id} />
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="cursor-pointer rounded-control border border-ink bg-ink px-3 py-2 text-base font-medium text-paper hover:bg-black disabled:opacity-60"
        >
          {pending ? "Envoi…" : dejaEnvoye ? "Renvoyer au client" : "Envoyer au client"}
        </button>
        <span className="text-small text-ink-3">
          {dejaEnvoye
            ? "Déjà envoyé. Le renvoyer ne perd aucune réponse."
            : "Le client reçoit un courriel avec un bouton vers son espace."}
        </span>
      </div>

      {state.ok ? (
        <p className="rounded-control border border-ok bg-ok-bg px-3 py-2 text-base text-ok">
          {state.ok}
        </p>
      ) : null}
      {state.error ? (
        <p className="rounded-control border border-alert-line bg-alert-bg px-3 py-2 text-base text-alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
