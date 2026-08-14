"use client";

import { useActionState } from "react";
import { PROJECT_TYPE } from "@/data/web";
import { createProject, type WebFormState } from "./actions";

const champ =
  "rounded-control border border-line bg-paper px-3 py-2 text-base outline-none focus:border-gold";

export function ProjectForm({ clients }: { clients: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<WebFormState, FormData>(createProject, {});

  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-[150px] flex-col gap-[6px]">
          <span className="eyebrow text-ink-3">Client</span>
          <select name="clientId" required defaultValue="" className={champ}>
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
          <span className="eyebrow text-ink-3">Nom du projet</span>
          <input name="name" required placeholder="Site vitrine Cap Marine" className={champ} />
        </label>

        <label className="flex flex-col gap-[6px]">
          <span className="eyebrow text-ink-3">Type</span>
          <select name="type" defaultValue="vitrine" className={champ}>
            {Object.entries(PROJECT_TYPE).map(([v, t]) => (
              <option key={v} value={v}>
                {t.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-[6px]">
          <span className="eyebrow text-ink-3">Mise en ligne visée</span>
          <input name="dueAt" type="date" className={champ} />
        </label>

        <label className="flex w-[120px] flex-col gap-[6px]">
          <span className="eyebrow text-ink-3">Montant (€)</span>
          <input name="price" type="number" min={0} step={100} className={champ} />
        </label>

        <button
          type="submit"
          disabled={pending}
          className="cursor-pointer rounded-control border border-ink bg-ink px-3 py-2 text-base font-medium text-paper hover:bg-black disabled:opacity-60"
        >
          {pending ? "Création…" : "Créer le projet"}
        </button>
      </div>

      <p className="text-small text-ink-3">
        Les jalons du type choisi sont posés automatiquement — brief, maquettes, contenus, recette,
        mise en ligne. Ils restent modifiables.
      </p>

      {state.error ? (
        <p className="rounded-control border border-alert-line bg-alert-bg px-3 py-2 text-base text-alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
