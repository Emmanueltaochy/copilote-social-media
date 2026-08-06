"use client";

import { useActionState } from "react";
import { createShoot, type ShootFormState } from "./actions";

export function ShootForm({ clients }: { clients: { id: string; name: string }[] }) {
  const [state, formAction, pending] = useActionState<ShootFormState, FormData>(createShoot, {});

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-[6px]">
        <span className="eyebrow text-ink-3">Client</span>
        <select
          name="clientId"
          required
          defaultValue=""
          className="rounded-control border border-line bg-paper px-3 py-2 text-base outline-none focus:border-gold"
        >
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

      <label className="flex min-w-[220px] flex-1 flex-col gap-[6px]">
        <span className="eyebrow text-ink-3">Titre</span>
        <input
          name="title"
          required
          placeholder="Tournage au port de Saint-Gilles"
          className="rounded-control border border-line bg-paper px-3 py-2 text-base outline-none focus:border-gold"
        />
      </label>

      <label className="flex min-w-[180px] flex-1 flex-col gap-[6px]">
        <span className="eyebrow text-ink-3">Lieu</span>
        <input
          name="place"
          placeholder="Port de Saint-Gilles"
          className="rounded-control border border-line bg-paper px-3 py-2 text-base outline-none focus:border-gold"
        />
      </label>

      <label className="flex flex-col gap-[6px]">
        <span className="eyebrow text-ink-3">Début</span>
        <input
          type="datetime-local"
          name="startsAt"
          required
          className="rounded-control border border-line bg-paper px-3 py-2 text-base outline-none focus:border-gold"
        />
      </label>

      <label className="flex flex-col gap-[6px]">
        <span className="eyebrow text-ink-3">Fin</span>
        <input
          type="datetime-local"
          name="endsAt"
          className="rounded-control border border-line bg-paper px-3 py-2 text-base outline-none focus:border-gold"
        />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="cursor-pointer rounded-control border border-ink bg-ink px-3 py-2 text-base font-medium text-paper hover:bg-black disabled:opacity-60"
      >
        {pending ? "Un instant…" : "Planifier"}
      </button>

      {state.error ? (
        <p className="w-full rounded-control border border-alert-line bg-alert-bg px-3 py-2 text-base text-alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
