"use client";

import { useActionState } from "react";
import { createCampaign, type CampaignFormState } from "./actions";

const PLATFORMS = ["Meta", "Google Ads", "TikTok Ads", "LinkedIn Ads"];

export function CampaignForm({ clients }: { clients: { id: string; name: string }[] }) {
  const [state, formAction, pending] = useActionState<CampaignFormState, FormData>(
    createCampaign,
    {},
  );

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

      <label className="flex min-w-[200px] flex-1 flex-col gap-[6px]">
        <span className="eyebrow text-ink-3">Nom</span>
        <input name="name" required placeholder="Acquisition · sorties coucher de soleil" className={field} />
      </label>

      <label className="flex flex-col gap-[6px]">
        <span className="eyebrow text-ink-3">Régie</span>
        <select name="platform" defaultValue="Meta" className={field}>
          {PLATFORMS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>

      <label className="flex w-[130px] flex-col gap-[6px]">
        <span className="eyebrow text-ink-3">Budget / mois (€)</span>
        <input name="budget" inputMode="decimal" placeholder="1800" className={field} />
      </label>

      <label className="flex w-[130px] flex-col gap-[6px]">
        <span className="eyebrow text-ink-3">CPL visé (€)</span>
        <input name="targetCpl" inputMode="decimal" placeholder="12" className={field} />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="cursor-pointer rounded-control border border-ink bg-ink px-3 py-2 text-base font-medium text-paper hover:bg-black disabled:opacity-60"
      >
        {pending ? "Un instant…" : "Créer"}
      </button>

      {state.error ? (
        <p className="w-full rounded-control border border-alert-line bg-alert-bg px-3 py-2 text-base text-alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
