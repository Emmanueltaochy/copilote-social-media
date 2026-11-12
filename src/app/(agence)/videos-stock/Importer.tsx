"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { importerVideo, type ImportState } from "./actions";

const NETS = [
  ["instagram", "Instagram"],
  ["facebook", "Facebook"],
  ["tiktok", "TikTok"],
  ["linkedin", "LinkedIn"],
] as const;

const champ = "rounded-control border border-line bg-paper px-2 py-[6px] text-small text-ink outline-none focus:border-gold";

export function Importer({
  stockId,
  clients,
  defaultClientId,
}: {
  stockId: string;
  clients: { id: string; name: string }[];
  defaultClientId: string | null;
}) {
  const [state, action, pending] = useActionState<ImportState, FormData>(importerVideo, {});
  const [programmer, setProgrammer] = useState(true);

  if (state.ok && state.contentId) {
    return (
      <div className="flex flex-col gap-1">
        <p className="m-0 text-small text-ok">{state.ok}</p>
        <Link href={`/contenu/${state.contentId}`} className="text-small font-medium">
          Ouvrir le contenu →
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="stockId" value={stockId} />
      <select name="clientId" defaultValue={defaultClientId ?? ""} className={champ} required>
        <option value="" disabled>
          Pour quel client ?
        </option>
        {clients.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <input type="datetime-local" name="date" className={champ} aria-label="Date de publication (heure de La Réunion)" />
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {NETS.map(([v, l]) => (
          <label key={v} className="flex items-center gap-1 text-small text-ink-2">
            <input type="checkbox" name="networks" value={v} defaultChecked={v !== "linkedin"} /> {l}
          </label>
        ))}
      </div>
      <label className="flex items-center gap-2 text-small text-ink-2">
        <input type="checkbox" name="programmer" checked={programmer} onChange={(e) => setProgrammer(e.target.checked)} />
        Programmer chez Metricool dans la foulée
      </label>
      <button
        type="submit"
        disabled={pending}
        className="cursor-pointer rounded-full border-none bg-night px-4 py-2 text-small font-medium text-white hover:opacity-85 disabled:opacity-60"
      >
        {pending ? "Import en cours… (téléchargement de la vidéo)" : programmer ? "Importer et programmer" : "Importer"}
      </button>
      {state.error ? <p className="m-0 text-small text-alert">{state.error}</p> : null}
    </form>
  );
}
