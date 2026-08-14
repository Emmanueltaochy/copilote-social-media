"use client";

import { useState } from "react";
import { repondreAuBrief } from "../../actions-web";

/**
 * Une question, côté client.
 *
 * L'enregistrement se fait en quittant le champ, et l'écran le dit. Sans ce
 * mot, on cherche un bouton « valider » qui n'existe pas, et on repart en
 * croyant n'avoir rien enregistré.
 */
export function ChampPortail({
  id,
  briefId,
  label,
  help,
  kind,
  options,
  required,
  answer,
  accent,
}: {
  id: string;
  briefId: string;
  label: string;
  help: string | null;
  kind: string;
  options: string[];
  required: boolean;
  answer: string | null;
  accent: string;
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
    await repondreAuBrief(data);
    setÉtat("enregistré");
  }

  const style = { borderColor: état === "enregistré" ? accent : undefined };
  const classe =
    "w-full rounded-control border border-line bg-paper px-3 py-2 text-base outline-none focus:border-gold";

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
    await repondreAuBrief(data);
    setÉtat("enregistré");
  }

  const choix = {
    "data-champ": id,
    value: valeur,
    onChange: (e: React.ChangeEvent<HTMLSelectElement>) => {
      setValeur(e.target.value);
      void enregistrerValeur(e.target.value);
    },
    className: classe,
    style,
  };

  const commun = {
    // Désigne la question sans passer par son libellé : deux questions peuvent
    // commencer pareil, et un intitulé se reformule.
    "data-champ": id,
    value: valeur,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setValeur(e.target.value),
    onBlur: enregistrer,
    className: classe,
    style,
  };

  return (
    <div className="flex flex-col gap-[6px] border-b border-line px-4 py-4 sm:px-6">
      <span className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-lead font-medium">
          {label}
          {required ? <span className="text-warn"> *</span> : null}
        </span>
        <span className="text-micro text-ink-3">
          {état === "envoi" ? "Enregistrement…" : état === "enregistré" ? "✓ Enregistré" : ""}
        </span>
      </span>

      {help ? <span className="text-small text-ink-3">{help}</span> : null}

      {kind === "long" ? (
        <textarea rows={4} {...commun} />
      ) : kind === "choix" ? (
        <select {...choix}>
          <option value="">Choisir…</option>
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : kind === "oui_non" ? (
        <select {...choix}>
          <option value="">Choisir…</option>
          <option value="Oui">Oui</option>
          <option value="Non">Non</option>
        </select>
      ) : (
        <input type={kind === "url" ? "url" : kind === "nombre" ? "number" : "text"} {...commun} />
      )}
    </div>
  );
}
