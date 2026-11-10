"use client";

import { useActionState } from "react";
import { programmerMetricool, type ProgState } from "../metricool-actions";

export function ProgrammerMetricool({ id, sentAt, draftOnly }: { id: string; sentAt: string | null; draftOnly: boolean }) {
  const [state, action, pending] = useActionState<ProgState, FormData>(programmerMetricool, {});
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="id" value={id} />
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="cursor-pointer rounded-full border-none bg-night px-4 py-2 text-base font-medium text-white hover:opacity-85 disabled:opacity-60"
        >
          {pending ? "Envoi à Metricool…" : sentAt ? "Renvoyer à Metricool" : "Programmer dans Metricool"}
        </button>
        {sentAt ? (
          <span className="text-small text-ink-3">
            Envoyé le {new Date(sentAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
          </span>
        ) : null}
      </div>
      {draftOnly ? <p className="text-small text-ink-3">Préversion : l&apos;envoi crée un brouillon, rien n&apos;est publié.</p> : null}
      {state.error ? <p className="text-small text-alert">{state.error}</p> : null}
      {state.ok ? <p className="text-small text-ok">{state.ok}</p> : null}
    </form>
  );
}
