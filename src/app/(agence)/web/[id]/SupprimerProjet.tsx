"use client";

import { useFormStatus } from "react-dom";
import { deleteProject } from "../actions";

function Bouton({ name }: { name: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex-none cursor-pointer rounded-full border border-line bg-paper px-3 py-2 text-small text-ink-2 hover:border-alert hover:text-alert disabled:cursor-not-allowed disabled:opacity-50"
      onClick={(e) => {
        // Une suppression ne se rattrape pas : on la fait confirmer, avec le nom du projet sous les yeux.
        if (!confirm(`Supprimer le projet « ${name} » ? Cette action est définitive.`)) e.preventDefault();
      }}
    >
      {pending ? "Suppression…" : "Supprimer le projet"}
    </button>
  );
}

/**
 * Supprimer un projet web.
 *
 * Ses jalons et ses livrables partent avec lui. Les cahiers des charges, eux,
 * restent dans « Briefs » : ce sont les réponses du client, on ne les efface
 * pas parce qu'un projet a été créé par erreur ou abandonné.
 */
export function SupprimerProjet({ id, name, briefs }: { id: string; name: string; briefs: number }) {
  return (
    <form action={deleteProject} className="flex flex-wrap items-center justify-between gap-3">
      <input type="hidden" name="id" value={id} />
      <span className="text-small text-ink-3">
        Supprimer le projet efface ses jalons et ses livrables, et le retire du portail du client.
        {briefs > 0
          ? ` ${briefs > 1 ? `Ses ${briefs} cahiers des charges restent` : "Son cahier des charges reste"} dans Briefs.`
          : ""}
      </span>
      <Bouton name={name} />
    </form>
  );
}
