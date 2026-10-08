"use client";

import { useActionState } from "react";
import { resetPassword } from "./actions";

export function ResetForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(resetPassword, {});

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      <label className="flex flex-col gap-[6px]">
        <span className="eyebrow text-ink-3">Nouveau mot de passe</span>
        <input
          name="password"
          type="password"
          required
          minLength={10}
          autoComplete="new-password"
          className="rounded-control border border-line bg-paper px-3 py-2 text-base outline-none focus:border-gold"
        />
        <span className="text-small text-ink-3">Au moins 10 caractères.</span>
      </label>
      <label className="flex flex-col gap-[6px]">
        <span className="eyebrow text-ink-3">Confirmation</span>
        <input
          name="confirmation"
          type="password"
          required
          autoComplete="new-password"
          className="rounded-control border border-line bg-paper px-3 py-2 text-base outline-none focus:border-gold"
        />
      </label>
      {state.error ? (
        <p className="rounded-control border border-alert-line bg-alert-bg px-3 py-2 text-base text-alert">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="cursor-pointer rounded-control border border-ink bg-ink px-3 py-[10px] text-base font-medium text-paper hover:bg-black disabled:opacity-60"
      >
        {pending ? "Un instant…" : "Enregistrer et me connecter"}
      </button>
    </form>
  );
}
