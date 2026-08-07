"use client";

import { useRef } from "react";
import { CONTENT_KIND, NETWORK_LABEL } from "@/data/content";
import { addContractLine } from "./actions";

const champ =
  "rounded-control border border-line bg-paper px-2 py-[6px] text-small outline-none focus:border-gold";

/**
 * Ajouter une ligne à l'engagement d'un client.
 *
 * Le format et le réseau ne sont pas de la décoration : c'est ce qui permet à
 * l'écran « Préparer le mois » de créer les bons contenus. Un libellé seul se
 * lit, mais ne se fabrique pas.
 */
export function ContractLineForm({ clientId }: { clientId: string }) {
  const ref = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={ref}
      action={async (formData) => {
        await addContractLine(formData);
        // Vider après coup : sans ça, la ligne suivante repart du libellé de la
        // précédente et on ajoute deux fois la même sans s'en rendre compte.
        ref.current?.reset();
      }}
      className="flex flex-wrap items-end gap-2 px-[14px] py-3"
    >
      <input type="hidden" name="clientId" value={clientId} />

      <label className="flex min-w-[160px] flex-1 flex-col gap-1">
        <span className="eyebrow text-ink-3">Libellé</span>
        <input name="label" required placeholder="Posts feed" className={champ} />
      </label>

      <label className="flex flex-col gap-1">
        <span className="eyebrow text-ink-3">Format</span>
        <select name="kind" defaultValue="feed" className={champ}>
          {Object.entries(CONTENT_KIND).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="eyebrow text-ink-3">Réseau</span>
        <select name="network" defaultValue="instagram" className={champ}>
          {Object.entries(NETWORK_LABEL).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </label>

      <label className="flex w-[90px] flex-col gap-1">
        <span className="eyebrow text-ink-3">Par mois</span>
        <input name="monthlyTarget" type="number" min={0} defaultValue={0} className={champ} />
      </label>

      <button
        type="submit"
        className="cursor-pointer rounded-control border border-line bg-paper px-[10px] py-[6px] text-small font-medium text-ink-2 hover:border-line-strong hover:text-ink"
      >
        Ajouter
      </button>
    </form>
  );
}
