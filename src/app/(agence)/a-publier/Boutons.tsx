"use client";

import { useActionState } from "react";
import { programmerTout, publicationAction, verifierPublications, type ProgState } from "../contenu/metricool-actions";

const soft =
  "flex-none cursor-pointer rounded-full border border-line bg-paper px-3 py-[6px] text-small font-medium text-ink-2 hover:border-line-strong hover:text-ink disabled:cursor-not-allowed disabled:opacity-50";
const main =
  "flex-none cursor-pointer rounded-full border-none bg-night px-3 py-[6px] text-small font-medium text-white hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-50";

function Retour({ state }: { state: ProgState }) {
  if (state.error) return <span className="text-small text-alert">{state.error}</span>;
  if (state.ok) return <span className="text-small text-ok">{state.ok}</span>;
  return null;
}

/** Un contenu : « Programmer » (ou « Publier maintenant » quand la date est passée). */
export function ProgrammerUn({ id, maintenant, disabled }: { id: string; maintenant?: boolean; disabled?: boolean }) {
  const [state, action, pending] = useActionState<ProgState, FormData>(publicationAction, {});
  return (
    <form action={action} className="flex flex-wrap items-center justify-end gap-2">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="op" value={maintenant ? "maintenant" : "programmer"} />
      <button
        type="submit"
        disabled={pending || disabled}
        className={maintenant ? soft : main}
        onClick={(e) => {
          if (maintenant && !confirm("La date prévue est passée. Publier maintenant ?")) e.preventDefault();
        }}
      >
        {pending ? "Envoi…" : maintenant ? "Publier maintenant" : "Programmer"}
      </button>
      <Retour state={state} />
    </form>
  );
}

export function ProgrammerTout({ ids }: { ids: string[] }) {
  const [state, action, pending] = useActionState<ProgState, FormData>(programmerTout, {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      {ids.map((id) => (
        <input key={id} type="hidden" name="id" value={id} />
      ))}
      <button type="submit" disabled={pending || !ids.length} className={main}>
        {pending ? "Envoi à Metricool…" : `Programmer les ${ids.length} complets`}
      </button>
      <Retour state={state} />
    </form>
  );
}

export function VerifierTout() {
  const [state, action, pending] = useActionState<ProgState, FormData>(() => verifierPublications(), {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <button type="submit" disabled={pending} className={soft}>
        {pending ? "Vérification…" : "Vérifier chez Metricool"}
      </button>
      <Retour state={state} />
    </form>
  );
}
