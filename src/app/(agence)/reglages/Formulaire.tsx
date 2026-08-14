"use client";

import { useActionState, useState } from "react";
import { majReglages, type ReglagesState } from "./actions";

const champ =
  "rounded-control border border-line bg-paper px-3 py-2 text-base outline-none focus:border-gold";

export function FormulaireReglages({
  agencyName,
  primaryColor,
  darkColor,
  portalWelcome,
}: {
  agencyName: string;
  primaryColor: string;
  darkColor: string;
  portalWelcome: string | null;
}) {
  const [state, action, pending] = useActionState<ReglagesState, FormData>(majReglages, {});
  const [accent, setAccent] = useState(primaryColor);
  const [fond, setFond] = useState(darkColor);
  const [nom, setNom] = useState(agencyName);

  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="flex flex-col gap-[6px]">
        <span className="eyebrow text-ink-3">Nom de l&apos;agence</span>
        <input
          name="agencyName"
          required
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          className={champ}
        />
      </label>

      <div className="flex flex-wrap gap-4">
        <label className="flex flex-col gap-[6px]">
          <span className="eyebrow text-ink-3">Couleur d&apos;accent</span>
          <span className="flex items-center gap-2">
            <input
              type="color"
              value={accent}
              onChange={(e) => setAccent(e.target.value)}
              className="h-9 w-12 cursor-pointer rounded-control border border-line bg-paper p-1"
            />
            <input
              name="primaryColor"
              value={accent}
              onChange={(e) => setAccent(e.target.value)}
              className={`w-[110px] ${champ} tabular-nums`}
            />
          </span>
        </label>

        <label className="flex flex-col gap-[6px]">
          <span className="eyebrow text-ink-3">Fond des bandeaux</span>
          <span className="flex items-center gap-2">
            <input
              type="color"
              value={fond}
              onChange={(e) => setFond(e.target.value)}
              className="h-9 w-12 cursor-pointer rounded-control border border-line bg-paper p-1"
            />
            <input
              name="darkColor"
              value={fond}
              onChange={(e) => setFond(e.target.value)}
              className={`w-[110px] ${champ} tabular-nums`}
            />
          </span>
        </label>
      </div>

      {/* L'aperçu évite l'aller-retour « j'enregistre, j'ouvre un portail, je
          reviens » : une couleur se juge à côté du texte qu'elle habille. */}
      <div className="overflow-hidden rounded-card border border-line">
        <div className="flex items-center gap-[10px] px-4 py-3" style={{ background: fond }}>
          <span className="h-2 w-2 rounded-[2px]" style={{ background: accent }} />
          <span className="eyebrow text-paper">{nom || "Nom de l'agence"}</span>
        </div>
        <div className="flex items-center justify-between gap-3 bg-paper px-4 py-3">
          <span className="text-base text-ink-2">Aperçu du portail client</span>
          <span
            className="rounded-control px-3 py-2 text-base font-medium text-paper"
            style={{ background: accent }}
          >
            Remplir le brief
          </span>
        </div>
      </div>

      <label className="flex flex-col gap-[6px]">
        <span className="eyebrow text-ink-3">Mot de fin, en bas du portail</span>
        <textarea
          name="portalWelcome"
          rows={2}
          defaultValue={portalWelcome ?? ""}
          placeholder="Une question ? Écrivez à votre interlocuteur habituel."
          className={champ}
        />
      </label>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="cursor-pointer rounded-control border border-ink bg-ink px-3 py-2 text-base font-medium text-paper hover:bg-black disabled:opacity-60"
        >
          {pending ? "Enregistrement…" : "Enregistrer"}
        </button>
        {state.ok ? <span className="text-base text-ok">{state.ok}</span> : null}
        {state.error ? <span className="text-base text-alert">{state.error}</span> : null}
      </div>
    </form>
  );
}
