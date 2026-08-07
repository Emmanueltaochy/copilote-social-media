"use client";

import { useActionState } from "react";
import { updatePassword, updateProfile, type CompteState } from "./actions";

const field =
  "rounded-control border border-line bg-paper px-3 py-2 text-base outline-none focus:border-gold";

function Message({ state }: { state: CompteState }) {
  if (state.ok) {
    return (
      <p className="rounded-control border border-ok bg-ok-bg px-3 py-2 text-base text-ok">
        {state.ok}
      </p>
    );
  }
  if (state.error) {
    return (
      <p className="rounded-control border border-alert-line bg-alert-bg px-3 py-2 text-base text-alert">
        {state.error}
      </p>
    );
  }
  return null;
}

export function ProfileForm({ name, initials }: { name: string; initials: string }) {
  const [state, action, pending] = useActionState<CompteState, FormData>(updateProfile, {});

  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-[220px] flex-1 flex-col gap-[6px]">
          <span className="eyebrow text-ink-3">Nom affiché</span>
          <input name="name" required defaultValue={name} className={field} />
        </label>
        <label className="flex w-[110px] flex-col gap-[6px]">
          <span className="eyebrow text-ink-3">Initiales</span>
          <input name="initials" maxLength={3} defaultValue={initials} className={field} />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="cursor-pointer rounded-control border border-ink bg-ink px-3 py-2 text-base font-medium text-paper hover:bg-black disabled:opacity-60"
        >
          {pending ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
      <Message state={state} />
    </form>
  );
}

export function PasswordForm() {
  const [state, action, pending] = useActionState<CompteState, FormData>(updatePassword, {});

  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-[200px] flex-1 flex-col gap-[6px]">
          <span className="eyebrow text-ink-3">Mot de passe actuel</span>
          <input name="current" type="password" required autoComplete="current-password" className={field} />
        </label>
        <label className="flex min-w-[200px] flex-1 flex-col gap-[6px]">
          <span className="eyebrow text-ink-3">Nouveau mot de passe</span>
          <input name="password" type="password" required autoComplete="new-password" className={field} />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="cursor-pointer rounded-control border border-line bg-paper px-3 py-2 text-base font-medium text-ink-2 hover:border-line-strong hover:text-ink disabled:opacity-60"
        >
          {pending ? "…" : "Changer"}
        </button>
      </div>
      <Message state={state} />
    </form>
  );
}
