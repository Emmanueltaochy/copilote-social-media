"use client";

import { useState } from "react";
import { setDepartments } from "./actions";

/**
 * Les pôles d'un collaborateur.
 *
 * Deux cases plutôt qu'un menu : quelqu'un peut faire les deux métiers, et un
 * menu déroulant obligerait à choisir. La direction voit une mention fixe —
 * elle a les deux, et il n'y a rien à décider.
 */
export function Poles({
  userId,
  departments,
  direction,
}: {
  userId: string;
  departments: string[];
  direction: boolean;
}) {
  const départ = departments.length > 0 ? departments : ["social"];
  const [choisis, setChoisis] = useState<string[]>(départ);
  const [état, setÉtat] = useState<"repos" | "envoi" | "ok">("repos");

  if (direction) {
    return (
      <span className="w-[150px] flex-none text-small text-ink-3">Social + Web (direction)</span>
    );
  }

  async function enregistrer(liste: string[]) {
    setChoisis(liste);
    setÉtat("envoi");
    const data = new FormData();
    data.set("id", userId);
    for (const d of liste) data.append("departments", d);
    await setDepartments(data);
    setÉtat("ok");
  }

  return (
    <span
      // Désigne la ligne sans passer par le nom : deux personnes peuvent
      // s'appeler pareil, et un intitulé se reformule.
      data-membre={userId}
      className="flex w-[150px] flex-none items-center gap-2"
    >
      {(
        [
          ["social", "Social"],
          ["web", "Web"],
        ] as const
      ).map(([valeur, libellé]) => (
        <label key={valeur} className="flex cursor-pointer items-center gap-[5px] text-small">
          <input
            type="checkbox"
            checked={choisis.includes(valeur)}
            onChange={(e) =>
              enregistrer(
                e.target.checked
                  ? [...choisis, valeur]
                  : choisis.filter((d) => d !== valeur),
              )
            }
            className="h-[14px] w-[14px] accent-ink"
          />
          {libellé}
        </label>
      ))}
      <span className="text-micro text-ink-3">
        {état === "envoi" ? "…" : état === "ok" ? "✓" : ""}
      </span>
    </span>
  );
}
