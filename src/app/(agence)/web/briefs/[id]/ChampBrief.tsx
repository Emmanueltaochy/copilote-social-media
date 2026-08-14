"use client";

import { useState } from "react";
import { answerField } from "../../actions";

const champ =
  "w-full rounded-control border border-line bg-paper px-2 py-[6px] text-base outline-none focus:border-gold";

/**
 * Une question du brief, côté agence.
 *
 * On enregistre au flou plutôt qu'avec un bouton par question : quinze
 * questions font quinze boutons, et on finit par en oublier un — c'est-à-dire
 * par perdre une réponse qu'on croyait écrite.
 */
export function ChampBrief({
  id,
  briefId,
  label,
  help,
  kind,
  options,
  required,
  answer,
  auteur,
}: {
  id: string;
  briefId: string;
  label: string;
  help: string | null;
  kind: string;
  options: string[];
  required: boolean;
  answer: string | null;
  auteur: string | null;
}) {
  const [valeur, setValeur] = useState(answer ?? "");
  const [état, setÉtat] = useState<"repos" | "envoi" | "enregistré">("repos");

  async function enregistrer() {
    if (valeur === (answer ?? "")) return;
    setÉtat("envoi");
    const data = new FormData();
    data.set("id", id);
    data.set("briefId", briefId);
    data.set("answer", valeur);
    await answerField(data);
    setÉtat("enregistré");
  }

  // Un menu déroulant s'enregistre au choix, pas en quittant le champ : il ne
  // reçoit pas toujours le focus, et « quitter le champ » n'arrivait donc
  // jamais — la réponse restait à l'écran sans jamais être écrite.
  async function enregistrerValeur(v: string) {
    if (v === (answer ?? "")) return;
    setÉtat("envoi");
    const data = new FormData();
    data.set("id", id);
    data.set("briefId", briefId);
    data.set("answer", v);
    await answerField(data);
    setÉtat("enregistré");
  }

  const choix = {
    "data-champ": id,
    value: valeur,
    onChange: (e: React.ChangeEvent<HTMLSelectElement>) => {
      setValeur(e.target.value);
      void enregistrerValeur(e.target.value);
    },
    className: champ,
  };

  const commun = {
    value: valeur,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setValeur(e.target.value),
    onBlur: enregistrer,
    className: champ,
  };

  return (
    <div className="flex flex-col gap-[6px] border-b border-line px-[14px] py-3">
      <span className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-base font-medium">
          {label}
          {required ? <span className="text-warn"> *</span> : null}
        </span>
        <span className="text-micro text-ink-3">
          {état === "envoi"
            ? "Enregistrement…"
            : état === "enregistré"
              ? "Enregistré"
              : auteur
                ? `Répondu par ${auteur}`
                : ""}
        </span>
      </span>

      {help ? <span className="text-small text-ink-3">{help}</span> : null}

      {kind === "long" ? (
        <textarea rows={3} {...commun} />
      ) : kind === "choix" ? (
        <select {...choix}>
          <option value="">Sans réponse</option>
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : kind === "oui_non" ? (
        <select {...choix}>
          <option value="">Sans réponse</option>
          <option value="Oui">Oui</option>
          <option value="Non">Non</option>
        </select>
      ) : (
        <input
          type={kind === "url" ? "url" : kind === "nombre" ? "number" : "text"}
          {...commun}
        />
      )}
    </div>
  );
}
