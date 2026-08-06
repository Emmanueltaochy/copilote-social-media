"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import type { FormState } from "@/app/connexion/actions";

/**
 * Formulaire d'authentification, partagé par la connexion et la création du
 * premier compte : même mise en page, mêmes messages d'erreur.
 */
export function AuthForm({
  action,
  submitLabel,
  withName = false,
  passwordHint,
}: {
  action: (prev: FormState, data: FormData) => Promise<FormState>;
  submitLabel: string;
  withName?: boolean;
  passwordHint?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const suite = useSearchParams().get("suite") ?? "/";

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="suite" value={suite} />

      {withName ? (
        <label className="flex flex-col gap-[6px]">
          <span className="eyebrow text-ink-3">Nom</span>
          <input
            name="name"
            required
            autoComplete="name"
            className="rounded-control border border-line bg-paper px-3 py-2 text-base outline-none focus:border-gold"
          />
        </label>
      ) : null}

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

      <label className="flex flex-col gap-[6px]">
        <span className="eyebrow text-ink-3">Mot de passe</span>
        <input
          name="password"
          type="password"
          required
          autoComplete={withName ? "new-password" : "current-password"}
          className="rounded-control border border-line bg-paper px-3 py-2 text-base outline-none focus:border-gold"
        />
        {passwordHint ? <span className="text-small text-ink-3">{passwordHint}</span> : null}
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
        {pending ? "Un instant…" : submitLabel}
      </button>
    </form>
  );
}
