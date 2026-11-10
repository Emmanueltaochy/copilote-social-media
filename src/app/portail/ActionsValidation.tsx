"use client";

import { useActionState } from "react";
import { clientApprove, clientRequestChange, type PortalFormState } from "./actions";

/**
 * Les deux gestes du client sur un contenu : valider, ou dire ce qui change.
 *
 * Extrait de la carte de validation parce que le même couple de boutons sert
 * maintenant à deux endroits — la liste « À valider » et la page d'un contenu.
 * Deux copies auraient divergé à la première correction.
 *
 * Le refus demande un motif : sans lui, la fabrication repart à l'aveugle et
 * le même aller-retour se reproduit.
 */
export function ActionsValidation({ id, taille = "normal" }: { id: string; taille?: "normal" | "grand" }) {
  const [approveState, approveAction, approving] = useActionState<PortalFormState, FormData>(
    clientApprove,
    {},
  );
  const [changeState, changeAction, changing] = useActionState<PortalFormState, FormData>(
    clientRequestChange,
    {},
  );

  const state = approveState.ok || approveState.error ? approveState : changeState;
  const bouton = taille === "grand" ? "px-5 py-[11px] text-lead" : "px-4 py-2 text-base";

  if (state.ok) {
    return (
      <p className="rounded-control border border-ok bg-ok-bg px-3 py-2 text-base text-ok">
        {state.ok}
      </p>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-end gap-2">
        <form action={approveAction} className="flex-none">
          <input type="hidden" name="id" value={id} />
          <button
            type="submit"
            disabled={approving || changing}
            className={`cursor-pointer rounded-full border border-night bg-night font-semibold text-white hover:opacity-85 disabled:opacity-60 ${bouton}`}
          >
            {approving ? "Un instant…" : "Valider"}
          </button>
        </form>

        <form action={changeAction} className="flex min-w-[280px] flex-1 items-end gap-2">
          <input type="hidden" name="id" value={id} />
          <label className="flex min-w-0 flex-1 flex-col gap-[6px]">
            <span className="eyebrow text-ink-3">Demander une modification</span>
            <input
              name="note"
              placeholder="Le logo est trop petit, et la date est le 14 et non le 12."
              className="w-full rounded-full border border-line bg-paper px-4 py-2 text-base outline-none focus:border-gold"
            />
          </label>
          <button
            type="submit"
            disabled={approving || changing}
            className={`flex-none cursor-pointer rounded-full border border-line bg-paper font-semibold text-ink hover:border-line-strong disabled:opacity-60 ${bouton}`}
          >
            {changing ? "Un instant…" : "Envoyer"}
          </button>
        </form>
      </div>

      {state.error ? (
        <p className="rounded-control border border-alert-line bg-alert-bg px-3 py-2 text-base text-alert">
          {state.error}
        </p>
      ) : null}
    </>
  );
}
