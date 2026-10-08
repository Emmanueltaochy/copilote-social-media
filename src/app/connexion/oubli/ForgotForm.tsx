"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestReset } from "./actions";

export function ForgotForm() {
  const [state, formAction, pending] = useActionState(requestReset, {});

  if (state.sent) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-base text-ink-2">
          Si un compte existe à cette adresse, un lien vient d&apos;y être envoyé. Il est valable
          une heure. Pensez à regarder dans les indésirables.
        </p>
        <Link
          href="/connexion"
          className="rounded-control border border-ink bg-ink px-3 py-[10px] text-center text-base font-medium text-paper hover:bg-black"
        >
          Retour à la connexion
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className="flex flex-col gap-[6px]">
        <span className="eyebrow text-ink-3">Adresse e-mail</span>
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
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
        {pending ? "Un instant…" : "Recevoir un lien"}
      </button>
    </form>
  );
}
