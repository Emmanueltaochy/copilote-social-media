"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";

/**
 * « Soit N clients de plus à X € » : X vaut d'abord le revenu moyen par
 * client actuel ; quelques montants ronds à essayer, ou un montant libre.
 */

const euros = (c: number) => `${Math.round(c / 100).toLocaleString("fr-FR")} €`;
const ESSAIS = [40_000, 50_000, 60_000];

export function Simulateur({ resteCents, moyenneCents, objectifCents }: { resteCents: number; moyenneCents: number; objectifCents: number }) {
  const [prix, setPrix] = useState(moyenneCents > 0 ? moyenneCents : ESSAIS[0]);
  const [libre, setLibre] = useState("");
  const clients = prix > 0 ? Math.ceil(resteCents / prix) : null;
  const choix = [...(moyenneCents > 0 ? [{ cents: moyenneCents, label: `${euros(moyenneCents)} (moyenne actuelle)` }] : []), ...ESSAIS.map((c) => ({ cents: c, label: euros(c) }))];

  if (resteCents <= 0) {
    return (
      <p className="text-lead font-semibold text-ok" data-ecart="0">
        Objectif de {euros(objectifCents)} atteint.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-lead text-ink" data-ecart={resteCents}>
        Encore <strong className="tabular-nums">{euros(resteCents)}</strong> par mois pour atteindre {euros(objectifCents)},
        <br className="max-sm:hidden" /> soit{" "}
        <strong className="tabular-nums" data-clients-de-plus={clients ?? ""}>
          {clients} client{clients && clients > 1 ? "s" : ""} de plus
        </strong>{" "}
        à <span className="tabular-nums">{euros(prix)}</span> par mois.
      </p>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Montant par nouveau client">
        {choix.map((c) => (
          <button
            key={c.label}
            type="button"
            onClick={() => {
              setPrix(c.cents);
              setLibre("");
            }}
            aria-pressed={prix === c.cents && !libre}
            className={cn(
              "min-h-9 cursor-pointer rounded-full border px-3 text-small font-medium tabular-nums",
              prix === c.cents && !libre ? "border-ink bg-ink text-paper" : "border-line bg-paper text-ink-2 hover:border-line-strong hover:text-ink",
            )}
          >
            {c.label}
          </button>
        ))}
        <label className="flex min-h-9 items-center gap-2 rounded-full border border-line bg-paper pr-3 pl-3 text-small text-ink-3 focus-within:border-gold">
          Autre
          <input
            inputMode="decimal"
            value={libre}
            onChange={(e) => {
              setLibre(e.target.value);
              const n = Number(e.target.value.replace(/\s/g, "").replace(",", "."));
              if (Number.isFinite(n) && n > 0) setPrix(Math.round(n * 100));
            }}
            placeholder="450"
            aria-label="Autre montant par client, en euros"
            className="w-[64px] border-0 bg-transparent text-base text-ink tabular-nums outline-none"
          />
          €
        </label>
      </div>
    </div>
  );
}
