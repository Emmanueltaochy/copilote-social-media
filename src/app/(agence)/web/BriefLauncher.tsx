"use client";

import { useActionState } from "react";
import { createBrief, type WebFormState } from "./actions";

/**
 * Le bouton qui crée un brief.
 *
 * Il porte le type du projet en caché : c'est lui qui décide des questions
 * posées. Demander le mode de paiement à quelqu'un qui veut une page de
 * contact lui ferait douter du devis qu'il vient de signer.
 */
export function BriefLauncher({
  clientId,
  projectId,
  type,
  defaultTitle,
}: {
  clientId: string;
  projectId?: string;
  type: string;
  defaultTitle: string;
}) {
  const [state, action, pending] = useActionState<WebFormState, FormData>(createBrief, {});

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="clientId" value={clientId} />
      {projectId ? <input type="hidden" name="projectId" value={projectId} /> : null}
      <input type="hidden" name="type" value={type} />
      <input
        name="title"
        defaultValue={defaultTitle}
        className="min-w-0 flex-1 rounded-control border border-line bg-paper px-2 py-[6px] text-small outline-none focus:border-gold"
      />
      <button
        type="submit"
        disabled={pending}
        className="flex-none cursor-pointer rounded-control border border-ink bg-ink px-[10px] py-[6px] text-small font-medium text-paper hover:bg-black disabled:opacity-60"
      >
        {pending ? "Création…" : "Créer un brief"}
      </button>
      {state.error ? <p className="w-full text-small text-alert">{state.error}</p> : null}
    </form>
  );
}
