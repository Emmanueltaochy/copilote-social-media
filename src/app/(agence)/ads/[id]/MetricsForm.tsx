"use client";

import { useActionState } from "react";
import { saveMetrics, type CampaignFormState } from "../actions";

const FIELD =
  "w-full rounded-control border border-line bg-paper px-2 py-[7px] text-base tabular-nums outline-none focus:border-gold";

/** Un nombre relevé dans l'interface de la régie. Défini hors du formulaire :
 *  un composant recréé à chaque rendu perdrait le contenu déjà tapé. */
function Num({ name, label, hint }: { name: string; label: string; hint: string }) {
  return (
    <label className="flex w-[110px] flex-col gap-[6px]">
      <span className="eyebrow text-ink-3">{label}</span>
      <input name={name} inputMode="decimal" placeholder={hint} className={FIELD} />
    </label>
  );
}

/**
 * La saisie hebdomadaire.
 *
 * Six nombres relevés dans l'interface de la régie, rien de plus. Tous les
 * indicateurs — CPC, CPL, CPA, ROAS — se déduisent de ceux-là et ne sont donc
 * jamais saisis : un indicateur saisi à la main se désaccorde de ses
 * composantes à la première correction.
 */
export function MetricsForm({
  campaignId,
  sets,
  defaultWeek,
}: {
  campaignId: string;
  sets: { id: string; name: string }[];
  defaultWeek: string;
}) {
  const [state, formAction, pending] = useActionState<CampaignFormState, FormData>(saveMetrics, {});

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="campaignId" value={campaignId} />

      <label className="flex flex-col gap-[6px]">
        <span className="eyebrow text-ink-3">Ensemble</span>
        <select
          name="adSetId"
          required
          defaultValue={sets.length === 1 ? sets[0].id : ""}
          className="rounded-control border border-line bg-paper px-3 py-2 text-base outline-none focus:border-gold"
        >
          <option value="" disabled>
            Choisir…
          </option>
          {sets.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-[6px]">
        <span className="eyebrow text-ink-3">Semaine</span>
        <input
          type="date"
          name="weekStart"
          defaultValue={defaultWeek}
          className="rounded-control border border-line bg-paper px-3 py-2 text-base outline-none focus:border-gold"
        />
      </label>

      <Num name="spend" label="Dépense €" hint="450" />
      <Num name="impressions" label="Impressions" hint="24000" />
      <Num name="clicks" label="Clics" hint="380" />
      <Num name="leads" label="Leads" hint="31" />
      <Num name="conversions" label="Ventes" hint="7" />
      <Num name="revenue" label="CA généré €" hint="2100" />

      <button
        type="submit"
        disabled={pending}
        className="cursor-pointer rounded-control border border-ink bg-ink px-3 py-2 text-base font-medium text-paper hover:bg-black disabled:opacity-60"
      >
        {pending ? "Enregistrement…" : "Enregistrer la semaine"}
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
