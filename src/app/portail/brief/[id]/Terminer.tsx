"use client";

import { useActionState } from "react";
import { terminerBrief, type PortailWebState } from "../../actions-web";

/**
 * Le bouton de fin.
 *
 * Il ne déclenche aucun envoi — l'agence lit déjà les réponses au fur et à
 * mesure. Il dit une seule chose, mais qui ne se devine pas : « j'ai fini ».
 * Sans lui, un champ laissé vide est indiscernable d'une question à laquelle il
 * n'y avait rien à répondre, et l'agence attend une suite qui ne viendra pas.
 */
export function Terminer({
  id,
  manquants,
  dejaTermine,
  accent,
}: {
  id: string;
  manquants: number;
  dejaTermine: boolean;
  accent: string;
}) {
  const [state, action, pending] = useActionState<PortailWebState, FormData>(terminerBrief, {});

  if (dejaTermine || state.ok) {
    return (
      <div className="flex flex-col gap-1 rounded-control border border-ok bg-ok-bg px-4 py-3">
        <span className="text-lead font-medium text-ok">
          {state.ok ?? "Brief terminé — merci, nous prenons la suite."}
        </span>
        <span className="text-small text-ink-2">
          Vous pouvez encore préciser une réponse : elle nous arrivera aussi.
        </span>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={pending || manquants > 0}
        style={manquants > 0 ? undefined : { background: accent, borderColor: accent }}
        className="cursor-pointer rounded-control border border-line px-4 py-3 text-lead font-medium text-paper disabled:cursor-default disabled:border-line disabled:bg-slot disabled:text-ink-3"
      >
        {pending ? "Un instant…" : "J'ai rempli le brief"}
      </button>

      <span className="text-small text-ink-2">
        {manquants > 0
          ? `Il reste ${manquants} question${manquants > 1 ? "s" : ""} marquée${manquants > 1 ? "s" : ""} d'une étoile à remplir avant de terminer.`
          : "Vos réponses nous sont déjà parvenues. Ce bouton nous dit simplement que vous avez terminé."}
      </span>

      {state.error ? (
        <p className="rounded-control border border-alert-line bg-alert-bg px-3 py-2 text-base text-alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
