"use client";

import { useActionState } from "react";
import { clientApprove, clientRequestChange, type PortalFormState } from "./actions";

/**
 * La réponse du client sur un contenu.
 *
 * Deux gestes, et un seul écran : valider, ou dire ce qui doit changer. Le
 * refus demande un motif — sans lui, la fabrication repart à l'aveugle et le
 * même aller-retour se reproduit.
 */
export function ValidationCard({
  id,
  title,
  scheduled,
  waitingSince,
}: {
  id: string;
  title: string;
  scheduled: string | null;
  waitingSince: string | null;
}) {
  const [approveState, approveAction, approving] = useActionState<PortalFormState, FormData>(
    clientApprove,
    {},
  );
  const [changeState, changeAction, changing] = useActionState<PortalFormState, FormData>(
    clientRequestChange,
    {},
  );

  const state = approveState.ok || approveState.error ? approveState : changeState;

  return (
    <div className="flex flex-col gap-3 border-b border-line px-6 py-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <span className="text-lead font-medium">{title}</span>
        <span className="text-base text-ink-3">
          {scheduled ? `Prévu le ${scheduled}` : "Date à définir"}
          {waitingSince ? ` · en attente depuis le ${waitingSince}` : ""}
        </span>
      </div>

      {state.ok ? (
        <p className="rounded-control border border-ok bg-ok-bg px-3 py-2 text-base text-ok">
          {state.ok}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-2">
            <form action={approveAction} className="flex-none">
              <input type="hidden" name="id" value={id} />
              <button
                type="submit"
                disabled={approving || changing}
                className="cursor-pointer rounded-control border border-ink bg-ink px-3 py-2 text-base font-medium text-paper hover:bg-black disabled:opacity-60"
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
                  className="w-full rounded-control border border-line bg-paper px-3 py-2 text-base outline-none focus:border-gold"
                />
              </label>
              <button
                type="submit"
                disabled={approving || changing}
                className="flex-none cursor-pointer rounded-control border border-line bg-paper px-3 py-2 text-base font-medium text-ink-2 hover:border-line-strong hover:text-ink disabled:opacity-60"
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
      )}
    </div>
  );
}
