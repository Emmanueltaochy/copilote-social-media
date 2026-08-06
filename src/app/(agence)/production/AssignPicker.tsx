"use client";

import { useRef } from "react";
import { assignContent } from "../contenu/actions";

/**
 * À qui revient ce contenu.
 *
 * Le choix s'applique dès qu'il est fait : ajouter un bouton « Enregistrer »
 * pour un menu à un seul choix ferait deux gestes là où un suffit, et une
 * assignation qu'on oublie de valider est pire que pas d'assignation du tout.
 *
 * « Toute l'équipe » est une valeur en soi, pas un vide : beaucoup de contenus
 * se traitent à plusieurs, et c'est l'étape du pipeline qui dit alors ce qui
 * reste à faire.
 */
export function AssignPicker({
  contentId,
  ownerId,
  staff,
  compact = false,
}: {
  contentId: string;
  ownerId: string | null;
  staff: { id: string; name: string }[];
  compact?: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={assignContent} className="flex min-w-0">
      <input type="hidden" name="id" value={contentId} />
      <select
        name="ownerId"
        defaultValue={ownerId ?? ""}
        onChange={() => formRef.current?.requestSubmit()}
        className={`w-full min-w-0 cursor-pointer rounded-control border border-line bg-paper text-ink-2 outline-none focus:border-gold ${
          compact ? "px-1 py-[2px] text-micro" : "px-2 py-1 text-small"
        }`}
      >
        <option value="">Toute l&apos;équipe</option>
        {staff.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </select>
      <button type="submit" className="sr-only">
        Assigner
      </button>
    </form>
  );
}
