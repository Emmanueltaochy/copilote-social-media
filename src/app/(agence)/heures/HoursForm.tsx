"use client";

import { useActionState } from "react";
import { saveHours, type HoursFormState } from "./actions";

export function HoursForm({
  clients,
  defaultWeek,
}: {
  clients: { id: string; name: string }[];
  defaultWeek: string;
}) {
  const [state, formAction, pending] = useActionState<HoursFormState, FormData>(saveHours, {});

  const field =
    "rounded-control border border-line bg-paper px-3 py-2 text-base outline-none focus:border-gold";

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-[6px]">
        <span className="eyebrow text-ink-3">Client</span>
        <select name="clientId" required defaultValue="" className={field}>
          <option value="" disabled>
            Choisir…
          </option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-[6px]">
        <span className="eyebrow text-ink-3">Semaine</span>
        <input type="date" name="weekStart" defaultValue={defaultWeek} className={field} />
      </label>

      <label className="flex w-[130px] flex-col gap-[6px]">
        <span className="eyebrow text-ink-3">Durée</span>
        <input
          name="duration"
          required
          placeholder="3h30"
          className={`${field} tabular-nums`}
        />
      </label>

      <label className="flex min-w-[200px] flex-1 flex-col gap-[6px]">
        <span className="eyebrow text-ink-3">Activité</span>
        <input name="activity" placeholder="Création graphique, media buying, tournage…" className={field} />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="cursor-pointer rounded-control border border-ink bg-ink px-3 py-2 text-base font-medium text-paper hover:bg-black disabled:opacity-60"
      >
        {pending ? "Un instant…" : "Enregistrer"}
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
