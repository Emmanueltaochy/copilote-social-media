"use client";

import { useActionState } from "react";
import { CONTENT_STATUS } from "@/data/content";
import { ajouterDepuisContenu, type VideoState } from "../actions-videos";

const champ = "min-h-11 min-w-0 flex-1 rounded-control border border-line bg-paper px-3 py-2 text-base text-ink outline-none focus:border-gold";

/**
 * « Partir d'une idée ou d'un contenu » (fiche du tournage) : la vidéo reprend
 * le titre, le format et les liens de référence du contenu, et lui reste
 * reliée.
 */
export function DepuisContenu({ shootId, candidats }: { shootId: string; candidats: { id: string; title: string; status: string }[] }) {
  const [state, action, pending] = useActionState<VideoState, FormData>(ajouterDepuisContenu, {});
  if (candidats.length === 0) return null;
  return (
    <form action={action} className="flex flex-col gap-2" data-formulaire="depuis-contenu">
      <span className="text-base font-semibold">Partir d&apos;une idée ou d&apos;un contenu</span>
      <input type="hidden" name="shootId" value={shootId} />
      <div className="flex flex-col gap-2 sm:flex-row">
        <select name="contentId" required defaultValue="" className={champ} aria-label="Idée ou contenu">
          <option value="" disabled>
            Choisir une idée ou un contenu du client…
          </option>
          {candidats.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title} · {CONTENT_STATUS[c.status as keyof typeof CONTENT_STATUS]?.label ?? c.status}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={pending}
          className="min-h-11 cursor-pointer rounded-full border border-line bg-paper px-4 text-base font-medium text-ink hover:border-line-strong disabled:opacity-60"
        >
          {pending ? "Ajout…" : "Ajouter aux vidéos"}
        </button>
      </div>
      {state.error ? <p className="text-small text-alert">{state.error}</p> : null}
      {state.ok ? <p className="text-small text-ok">{state.ok}</p> : null}
    </form>
  );
}

/**
 * Le même geste depuis la fiche d'un contenu : choisir l'un des tournages à
 * venir du client.
 */
export function VersTournage({
  contentId,
  tournages,
}: {
  contentId: string;
  tournages: { id: string; label: string }[];
}) {
  const [state, action, pending] = useActionState<VideoState, FormData>(ajouterDepuisContenu, {});
  return (
    <form action={action} className="flex flex-col gap-2" data-formulaire="vers-tournage">
      <input type="hidden" name="contentId" value={contentId} />
      <div className="flex flex-col gap-2 sm:flex-row">
        <select name="shootId" required defaultValue={tournages[0]?.id ?? ""} className={champ} aria-label="Tournage">
          {tournages.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={pending}
          className="min-h-11 cursor-pointer rounded-full border border-night bg-night px-4 text-base font-semibold text-white hover:opacity-85 disabled:opacity-60"
        >
          {pending ? "Ajout…" : "Ajouter au tournage"}
        </button>
      </div>
      {state.error ? <p className="text-small text-alert">{state.error}</p> : null}
      {state.ok ? <p className="text-small text-ok">{state.ok}</p> : null}
    </form>
  );
}
