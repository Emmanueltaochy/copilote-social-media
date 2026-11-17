"use client";

import { useActionState, useState } from "react";
import { ACTIVITES, KINDS, SOURCES, STATUTS } from "@/lib/annuaire";
import type { FicheState } from "./actions";

const champ = "w-full min-w-0 rounded-control border border-line bg-paper px-3 py-2 text-base text-ink outline-none focus:border-gold";
const etiquette = "flex min-w-0 flex-col gap-1 text-small text-ink-3";

export type FicheValeurs = {
  entryId?: string | null;
  clientId?: string | null;
  name?: string;
  contactName?: string | null;
  kind?: string;
  source?: string;
  activity?: string;
  status?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  city?: string | null;
  country?: string | null;
  sector?: string | null;
  nextAction?: string | null;
  nextActionOn?: string | null;
  note?: string | null;
  tags?: string[];
};

/**
 * Le formulaire d'une fiche, en création comme en modification.
 *
 * Pour un client de l'agence, le nom et le type se lisent sur son compte : ils
 * ne sont pas modifiables ici (seul « partenaire » peut s'ajouter).
 */
export function FicheForm({
  action,
  valeurs = {},
  bouton,
  repliable,
}: {
  action: (prev: FicheState, data: FormData) => Promise<FicheState>;
  valeurs?: FicheValeurs;
  bouton: string;
  /** Titre d'un formulaire replié par défaut ; il reste ouvert après l'enregistrement. */
  repliable?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [ouvert, setOuvert] = useState(!repliable);
  const estClient = Boolean(valeurs.clientId);
  const kinds = estClient
    ? (["client", "partenaire"] as const)
    : (["prospect", "partenaire", "autre"] as const);

  const entete = repliable ? (
    <button
      type="button"
      aria-expanded={ouvert}
      onClick={() => setOuvert((o) => !o)}
      className="flex min-h-11 w-full cursor-pointer items-center justify-between gap-3 border-none bg-transparent p-0 text-left text-lead font-semibold text-ink"
    >
      {repliable}
      <span className="text-small font-medium text-ink-3">{ouvert ? "Replier" : "Ouvrir"}</span>
    </button>
  ) : null;
  if (!ouvert) return entete;

  return (
    <>
    {entete}
    <form action={formAction} className={repliable ? "mt-4 flex flex-col gap-3" : "flex flex-col gap-3"}>
      {valeurs.entryId ? <input type="hidden" name="entryId" value={valeurs.entryId} /> : null}
      {valeurs.clientId ? <input type="hidden" name="clientId" value={valeurs.clientId} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        {estClient ? null : (
          <label className={etiquette}>
            Nom de l&apos;entreprise ou de la personne
            <input name="name" required defaultValue={valeurs.name ?? ""} className={champ} />
          </label>
        )}
        <label className={etiquette}>
          Interlocuteur
          <input name="contactName" defaultValue={valeurs.contactName ?? ""} placeholder="Prénom Nom, fonction" className={champ} />
        </label>
        <label className={etiquette}>
          Type
          <select name="kind" defaultValue={valeurs.kind ?? kinds[0]} className={champ}>
            {kinds.map((k) => (
              <option key={k} value={k}>
                {KINDS[k].label}
              </option>
            ))}
          </select>
        </label>
        <label className={etiquette}>
          Source
          <select name="source" defaultValue={valeurs.source ?? "agence"} className={champ}>
            {Object.entries(SOURCES).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className={etiquette}>
          Activité
          <select name="activity" defaultValue={valeurs.activity ?? "agence"} className={champ}>
            {Object.entries(ACTIVITES).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className={etiquette}>
          Étape
          <select name="status" defaultValue={valeurs.status ?? ""} className={champ}>
            <option value="">—</option>
            {Object.entries(STATUTS).map(([k, s]) => (
              <option key={k} value={k}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className={etiquette}>
          E-mail
          <input name="email" type="email" defaultValue={valeurs.email ?? ""} className={champ} />
        </label>
        <label className={etiquette}>
          Téléphone
          <input name="phone" type="tel" defaultValue={valeurs.phone ?? ""} className={champ} />
        </label>
        <label className={etiquette}>
          Site
          <input name="website" defaultValue={valeurs.website ?? ""} placeholder="https://" className={champ} />
        </label>
        <label className={etiquette}>
          Métier
          <input name="sector" defaultValue={valeurs.sector ?? ""} className={champ} />
        </label>
        <label className={etiquette}>
          Ville
          <input name="city" defaultValue={valeurs.city ?? ""} className={champ} />
        </label>
        <label className={etiquette}>
          Pays
          <input name="country" defaultValue={valeurs.country ?? ""} className={champ} />
        </label>
        <label className={`${etiquette} sm:col-span-2`}>
          Prochaine action
          <input name="nextAction" defaultValue={valeurs.nextAction ?? ""} placeholder="Rappeler pour fixer le rendez-vous" className={champ} />
        </label>
        <label className={etiquette}>
          Pour le
          <input name="nextActionOn" type="date" defaultValue={valeurs.nextActionOn ?? ""} className={champ} />
        </label>
        <label className={etiquette}>
          Étiquettes (séparées par des virgules)
          <input name="tags" defaultValue={(valeurs.tags ?? []).join(", ")} className={champ} />
        </label>
        <label className={`${etiquette} sm:col-span-2`}>
          Note
          <textarea name="note" rows={3} defaultValue={valeurs.note ?? ""} className={champ} />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="cursor-pointer rounded-full border-none bg-night px-5 py-2 text-base font-semibold text-white hover:opacity-85 disabled:opacity-60"
        >
          {pending ? "Enregistrement…" : bouton}
        </button>
        {state.error ? <span className="text-small text-alert">{state.error}</span> : null}
        {state.ok ? <span className="text-small text-ok">{state.ok}</span> : null}
      </div>
    </form>
    </>
  );
}
