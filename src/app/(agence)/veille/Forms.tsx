"use client";

import { useActionState } from "react";
import { ajouterConcurrent, lancerAnalyse, type VeilleState } from "./actions";

const champ = "min-w-0 flex-1 rounded-control border border-line bg-paper px-3 py-2 text-base text-ink outline-none focus:border-gold";

function Msg({ s }: { s: VeilleState }) {
  if (s.error) return <p className="text-small text-alert">{s.error}</p>;
  if (s.ok) return <p className="text-small text-ok">{s.ok}</p>;
  return null;
}

export function AjoutConcurrent({ clientId }: { clientId: string }) {
  const [state, action, pending] = useActionState<VeilleState, FormData>(ajouterConcurrent, {});
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="clientId" value={clientId} />
      <div className="flex flex-wrap gap-2">
        <select name="network" className="rounded-control border border-line bg-paper px-2 py-2 text-base text-ink">
          <option value="instagram">Instagram</option>
          <option value="facebook">Facebook</option>
          <option value="youtube">YouTube</option>
        </select>
        <input name="handle" placeholder="@compte ou lien du profil" className={champ} />
        <button type="submit" disabled={pending} className="cursor-pointer rounded-full border-none bg-night px-4 py-2 text-base font-medium text-white hover:opacity-85 disabled:opacity-60">
          {pending ? "Ajout…" : "Ajouter"}
        </button>
      </div>
      <Msg s={state} />
    </form>
  );
}

export function BoutonAnalyse({ clientId, ready }: { clientId: string; ready: boolean }) {
  const [state, action, pending] = useActionState<VeilleState, FormData>(lancerAnalyse, {});
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="clientId" value={clientId} />
      <button
        type="submit"
        disabled={pending || !ready}
        className="w-fit cursor-pointer rounded-full border-none bg-accent px-4 py-2 text-base font-semibold text-accent-ink hover:brightness-105 disabled:opacity-50"
      >
        {pending ? "Analyse en cours (≈ 1 min)…" : "✨ Analyser les tendances"}
      </button>
      {!ready ? <p className="text-small text-ink-3">Raccordez l&apos;assistant IA dans Réglages pour lancer l&apos;analyse.</p> : null}
      <Msg s={state} />
    </form>
  );
}
