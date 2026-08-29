"use client";

import { useRef } from "react";
import type { Rangee } from "@/lib/folders";

/**
 * Ranger un média dans un dossier.
 *
 * Le choix enregistre aussitôt : ajouter un bouton « Déplacer » sous chaque
 * vignette d'une grille de deux cents médias ferait un écran de boutons. Le
 * formulaire est réel — sans JavaScript, il reste soumettable par la touche
 * Entrée.
 */
export function MoveSelect({
  action,
  id,
  dossiers,
  courant,
}: {
  action: (formData: FormData) => Promise<void>;
  id: string;
  dossiers: Rangee[];
  courant: string | null;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form action={action} ref={formRef} className="flex-1">
      <input type="hidden" name="id" value={id} />
      <select
        name="folderId"
        defaultValue={courant ?? ""}
        title="Ranger dans un dossier"
        onChange={() => formRef.current?.requestSubmit()}
        className="w-full rounded-control border border-line bg-paper px-1 py-[3px] text-micro outline-none focus:border-gold"
      >
        <option value="">Racine</option>
        {dossiers.map((d) => (
          <option key={d.id} value={d.id}>
            {"  ".repeat(d.niveau)}
            {d.name}
          </option>
        ))}
      </select>
      <button type="submit" className="sr-only">
        Ranger
      </button>
    </form>
  );
}
