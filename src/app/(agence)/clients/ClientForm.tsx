"use client";

import { useActionState } from "react";
import type { ClientFormState } from "./actions";

type Values = {
  id?: string;
  name?: string;
  shortName?: string;
  sector?: string;
  monthlyFee?: number;
  contentTarget?: number;
  shootsIncluded?: number;
  hoursSold?: number;
  adsBudgetLabel?: string;
};

const field =
  "rounded-control border border-line bg-paper px-3 py-2 text-base outline-none focus:border-gold";

/**
 * La fiche d'un client.
 *
 * Les montants n'apparaissent que pour la direction. Ce n'est pas seulement un
 * masquage d'affichage : l'action serveur ignore ces champs quand l'auteur
 * n'a pas le droit de les voir, sinon un formulaire modifié à la main les
 * écraserait.
 */
export function ClientForm({
  action,
  values = {},
  submitLabel,
  showMoney,
}: {
  action: (prev: ClientFormState, data: FormData) => Promise<ClientFormState>;
  values?: Values;
  submitLabel: string;
  showMoney: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-[6px]">
          <span className="eyebrow text-ink-3">Nom du client</span>
          <input name="name" required defaultValue={values.name} className={field} />
        </label>
        <label className="flex flex-col gap-[6px]">
          <span className="eyebrow text-ink-3">Nom court</span>
          <input
            name="shortName"
            defaultValue={values.shortName}
            placeholder="pour les tableaux denses"
            className={field}
          />
        </label>
      </div>

      <label className="flex flex-col gap-[6px]">
        <span className="eyebrow text-ink-3">Secteur</span>
        <input name="sector" defaultValue={values.sector ?? ""} className={field} />
      </label>

      <div className={showMoney ? "grid grid-cols-2 gap-3" : "grid grid-cols-1 gap-3"}>
        {showMoney ? (
          <label className="flex flex-col gap-[6px]">
            <span className="eyebrow text-ink-3">Forfait mensuel (€ HT)</span>
            <input
              name="monthlyFee"
              type="number"
              min={0}
              step="1"
              defaultValue={values.monthlyFee ?? 0}
              className={field}
            />
          </label>
        ) : null}
        <label className="flex flex-col gap-[6px]">
          <span className="eyebrow text-ink-3">Contenus par mois</span>
          <input
            name="contentTarget"
            type="number"
            min={0}
            defaultValue={values.contentTarget ?? 0}
            className={field}
          />
          <span className="text-small text-ink-3">
            C&apos;est ce nombre qui pilote le rythme attendu. Zéro = pas d&apos;engagement chiffré.
          </span>
        </label>
      </div>

      <div className={showMoney ? "grid grid-cols-2 gap-3" : "grid grid-cols-1 gap-3"}>
        <label className="flex flex-col gap-[6px]">
          <span className="eyebrow text-ink-3">Shootings inclus</span>
          <input
            name="shootsIncluded"
            type="number"
            min={0}
            defaultValue={values.shootsIncluded ?? 0}
            className={field}
          />
        </label>
        {showMoney ? (
          <label className="flex flex-col gap-[6px]">
            <span className="eyebrow text-ink-3">Heures vendues</span>
            <input
              name="hoursSold"
              type="number"
              min={0}
              defaultValue={values.hoursSold ?? 0}
              className={field}
            />
            <span className="text-small text-ink-3">Base du calcul de rentabilité.</span>
          </label>
        ) : null}
      </div>

      <label className="flex flex-col gap-[6px]">
        <span className="eyebrow text-ink-3">Budget ads géré</span>
        <input
          name="adsBudgetLabel"
          defaultValue={values.adsBudgetLabel ?? ""}
          placeholder="1 800 € par mois, ou vide"
          className={field}
        />
      </label>

      {state.error ? (
        <p className="rounded-control border border-alert-line bg-alert-bg px-3 py-2 text-base text-alert">
          {state.error}
        </p>
      ) : null}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="cursor-pointer rounded-control border border-ink bg-ink px-3 py-2 text-base font-medium text-paper hover:bg-black disabled:opacity-60"
        >
          {pending ? "Enregistrement…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
