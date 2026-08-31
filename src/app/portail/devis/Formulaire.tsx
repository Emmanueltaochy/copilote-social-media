"use client";

import { useActionState, useState } from "react";
import { DEVIS_KIND } from "@/data/devis";
import { demanderDevis } from "../actions-devis";

const champ =
  "rounded-control border border-line bg-paper px-3 py-2 text-base outline-none focus:border-gold";

/**
 * Le formulaire de demande.
 *
 * Une seule ligne est obligatoire. Tout le reste est facultatif — budget,
 * échéance, détails — parce qu'un client qui ne sait pas encore renoncerait
 * devant un formulaire exigeant, et qu'une demande abandonnée coûte plus cher
 * qu'une demande imprécise. Les précisions se demandent au téléphone.
 */
export function FormulaireDevis({ accent }: { accent: string }) {
  const [state, formAction, pending] = useActionState(demanderDevis, {});
  const [kind, setKind] = useState("site");

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <label className="flex flex-col gap-[6px]">
        <span className="eyebrow text-ink-3">Ce que vous souhaitez</span>
        <select
          name="kind"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          className={champ}
        >
          {Object.entries(DEVIS_KIND).map(([valeur, k]) => (
            <option key={valeur} value={valeur}>
              {k.label}
            </option>
          ))}
        </select>
        <span className="text-small text-ink-3">{DEVIS_KIND[kind]?.aide}</span>
      </label>

      <label className="flex flex-col gap-[6px]">
        <span className="eyebrow text-ink-3">En une ligne</span>
        <input
          name="subject"
          required
          placeholder="Refonte de notre site avec prise de rendez-vous en ligne"
          className={champ}
        />
      </label>

      <label className="flex flex-col gap-[6px]">
        <span className="eyebrow text-ink-3">Détails (facultatif)</span>
        <textarea
          name="details"
          rows={4}
          placeholder="Ce que vous avez en tête, les pages attendues, ce qui vous déplaît dans l'existant…"
          className={`${champ} resize-y`}
        />
      </label>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-[6px]">
          <span className="eyebrow text-ink-3">Budget envisagé (facultatif)</span>
          <input name="budget" placeholder="Autour de 3 000 €, ou je ne sais pas encore" className={champ} />
        </label>
        <label className="flex flex-col gap-[6px]">
          <span className="eyebrow text-ink-3">Pour quand (facultatif)</span>
          <input name="deadline" type="date" className={champ} />
        </label>
      </div>

      {state.error ? (
        <p className="rounded-control border border-alert-line bg-alert-bg px-3 py-2 text-base text-alert">
          {state.error}
        </p>
      ) : null}
      {state.ok ? <p className="text-base text-ok">{state.ok}</p> : null}

      <div>
        <button
          type="submit"
          disabled={pending}
          className="cursor-pointer rounded-control px-4 py-2 text-base font-medium text-paper disabled:opacity-60"
          style={{ background: accent }}
        >
          {pending ? "Envoi…" : "Envoyer ma demande"}
        </button>
      </div>
    </form>
  );
}
