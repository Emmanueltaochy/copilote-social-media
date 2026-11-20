"use client";

import { useActionState } from "react";
import type { ReglagesRevenu } from "@/lib/revenu-regles";
import { enregistrerObjectif } from "./actions";

/** « Régler l'objectif » : objectif, paliers (montant et nom), taux de TVA, base de comparaison. */

const enEuros = (c: number) => String(Math.round(c / 100));
const champ = "w-full min-w-0 rounded-control border border-line bg-paper px-3 py-2 text-base text-ink tabular-nums outline-none focus:border-gold";

export function ReglagesObjectif({ reglages }: { reglages: ReglagesRevenu }) {
  const [etat, envoyer, enCours] = useActionState(enregistrerObjectif, null);
  const paliers = [0, 1, 2].map((i) => reglages.paliers[i] ?? null);
  return (
    <details className="group rounded-[18px] border border-line bg-mute/60" data-reglages-objectif>
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 text-base font-medium text-ink-2 hover:text-ink">
        Régler l&apos;objectif, les paliers et la TVA
        <span aria-hidden className="text-ink-3 transition-transform group-open:rotate-180">
          ▾
        </span>
      </summary>
      <form action={envoyer} className="flex flex-col gap-4 border-t border-line px-4 pt-4 pb-4">
        <label className="flex max-w-[260px] flex-col gap-1">
          <span className="text-small text-ink-3">Objectif de revenu mensuel (€)</span>
          <input name="objectif" inputMode="decimal" defaultValue={enEuros(reglages.objectifCents)} className={champ} required />
        </label>
        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="mb-1 text-small text-ink-3">Paliers (laisser vide pour retirer)</legend>
          {paliers.map((p, i) => (
            <div key={i} className="grid grid-cols-[110px_minmax(0,1fr)] gap-2 sm:max-w-[520px]">
              <input name={`palier${i + 1}`} inputMode="decimal" defaultValue={p ? enEuros(p.montantCents) : ""} placeholder="€" aria-label={`Montant du palier ${i + 1}, en euros`} className={champ} />
              <input name={`libelle${i + 1}`} defaultValue={p?.libelle ?? ""} placeholder="Nom du palier" aria-label={`Nom du palier ${i + 1}`} maxLength={60} className={champ} />
            </div>
          ))}
        </fieldset>
        <div className="flex flex-wrap gap-4">
          <label className="flex w-[160px] flex-col gap-1">
            <span className="text-small text-ink-3">TVA pour l&apos;estimation HT (%)</span>
            <input name="tva" inputMode="decimal" defaultValue={String(reglages.tauxTva).replace(".", ",")} className={champ} />
          </label>
          <label className="flex min-w-[220px] flex-1 flex-col gap-1 sm:max-w-[300px]">
            <span className="text-small text-ink-3">La barre compare à l&apos;objectif</span>
            <select name="base" defaultValue={reglages.base} className={champ}>
              <option value="preleve">le montant prélevé</option>
              <option value="ht">l&apos;estimation hors taxes</option>
            </select>
          </label>
        </div>
        <p className="m-0 text-small text-ink-3">
          8,5 % est le taux normal à La Réunion ; mettez 0 si vos clients ne paient pas de TVA. Un taux noté dans les métadonnées d&apos;un
          abonnement GoCardless (« tva ») est utilisé pour cet abonnement.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={enCours}
            className="min-h-11 cursor-pointer rounded-full bg-night px-5 text-base font-semibold text-white hover:brightness-125 disabled:opacity-60"
          >
            {enCours ? "Enregistrement…" : "Enregistrer"}
          </button>
          {etat ? (
            <span role="status" className={etat.ok ? "text-small font-medium text-ok" : "text-small font-medium text-alert"}>
              {etat.message}
            </span>
          ) : null}
        </div>
      </form>
    </details>
  );
}
