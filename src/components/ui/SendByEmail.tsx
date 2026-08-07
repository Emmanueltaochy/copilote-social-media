"use client";

import { useActionState, useState } from "react";
import { shareByEmail, type ShareState } from "@/app/(agence)/partage/actions";

/**
 * Bouton d'envoi par courriel.
 *
 * Replié tant qu'on n'en a pas besoin : c'est une action occasionnelle, et un
 * champ d'adresse posé en permanence sous chaque fichier encombrerait des
 * écrans qui servent surtout à travailler.
 */
export function SendByEmail({
  kind,
  id,
  defaultTo = "",
  label = "Envoyer par mail",
}: {
  kind: "fichier" | "contenu" | "rapport" | "invitation";
  id: string;
  defaultTo?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ShareState, FormData>(shareByEmail, {});

  if (state.ok) {
    return <span className="text-small text-ok">{state.ok}</span>;
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex-none cursor-pointer rounded-control border border-line bg-paper px-2 py-1 text-micro text-ink-2 hover:border-line-strong hover:text-ink"
      >
        {label}
      </button>
    );
  }

  return (
    <form action={formAction} className="flex min-w-0 flex-wrap items-center gap-1">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
      <input
        name="to"
        type="email"
        required
        defaultValue={defaultTo}
        placeholder="adresse@exemple.fr"
        className="min-w-[180px] flex-1 rounded-control border border-line bg-paper px-2 py-1 text-small outline-none focus:border-gold"
      />
      <input
        name="note"
        placeholder="Mot d'accompagnement (facultatif)"
        className="min-w-[160px] flex-1 rounded-control border border-line bg-paper px-2 py-1 text-small outline-none focus:border-gold"
      />
      <button
        type="submit"
        disabled={pending}
        className="flex-none cursor-pointer rounded-control border border-ink bg-ink px-2 py-1 text-micro font-medium text-paper hover:bg-black disabled:opacity-60"
      >
        {pending ? "Envoi…" : "Envoyer"}
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="flex-none cursor-pointer border-none bg-transparent p-1 text-micro text-ink-3 hover:text-ink"
      >
        Annuler
      </button>
      {state.error ? <span className="w-full text-small text-alert">{state.error}</span> : null}
    </form>
  );
}
