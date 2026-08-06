"use client";

import { useActionState } from "react";
import { createClientAccess, type ClientFormState } from "./actions";

const field =
  "rounded-control border border-line bg-paper px-3 py-2 text-base outline-none focus:border-gold";

export function ClientAccessForm({ clientId }: { clientId: string }) {
  const [state, formAction, pending] = useActionState<ClientFormState, FormData>(
    createClientAccess,
    {},
  );

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="clientId" value={clientId} />
      <label className="flex flex-col gap-[6px]">
        <span className="eyebrow text-ink-3">Nom du contact</span>
        <input name="contactName" required className={field} />
      </label>
      <label className="flex flex-1 flex-col gap-[6px]">
        <span className="eyebrow text-ink-3">Adresse e-mail</span>
        <input name="contactEmail" type="email" required className={field} />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="cursor-pointer rounded-control border border-ink bg-ink px-3 py-2 text-base font-medium text-paper hover:bg-black disabled:opacity-60"
      >
        {pending ? "Création…" : "Créer l'accès"}
      </button>
      {state.error ? (
        <p className="w-full rounded-control border border-alert-line bg-alert-bg px-3 py-2 text-base text-alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
