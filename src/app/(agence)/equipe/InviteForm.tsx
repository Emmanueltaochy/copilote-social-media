"use client";

import { useActionState } from "react";
import { ACCESS_DURATIONS, ACCESS_DURATION_KEYS } from "@/data/team";
import { inviteTeammate, type TeamFormState } from "./actions";

export function InviteForm() {
  const [state, formAction, pending] = useActionState<TeamFormState, FormData>(inviteTeammate, {});

  const field =
    "rounded-control border border-line bg-paper px-3 py-2 text-base outline-none focus:border-gold";

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <label className="flex min-w-[180px] flex-1 flex-col gap-[6px]">
        <span className="eyebrow text-ink-3">Nom</span>
        <input name="name" required placeholder="Noa Hoarau" className={field} />
      </label>

      <label className="flex min-w-[220px] flex-1 flex-col gap-[6px]">
        <span className="eyebrow text-ink-3">Adresse électronique</span>
        <input name="email" type="email" required placeholder="noa@taochyconsulting.fr" className={field} />
      </label>

      <label className="flex flex-col gap-[6px]">
        <span className="eyebrow text-ink-3">Rôle</span>
        <select name="role" defaultValue="equipe" className={field}>
          <option value="equipe">Équipe</option>
          <option value="direction">Direction</option>
        </select>
      </label>

      <label className="flex flex-col gap-[6px]">
        <span className="eyebrow text-ink-3">Durée d&apos;accès</span>
        <select name="duration" defaultValue="permanent" className={field}>
          {ACCESS_DURATION_KEYS.map((k) => (
            <option key={k} value={k}>
              {ACCESS_DURATIONS[k].label}
            </option>
          ))}
        </select>
      </label>

      <button
        type="submit"
        disabled={pending}
        className="cursor-pointer rounded-control border border-ink bg-ink px-3 py-2 text-base font-medium text-paper hover:bg-black disabled:opacity-60"
      >
        {pending ? "Un instant…" : "Inviter"}
      </button>

      {state.error ? (
        <p className="w-full rounded-control border border-alert-line bg-alert-bg px-3 py-2 text-base text-alert">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p className="w-full rounded-control border border-ok bg-ok-bg px-3 py-2 text-base text-ok">
          {state.ok}
        </p>
      ) : null}
    </form>
  );
}
