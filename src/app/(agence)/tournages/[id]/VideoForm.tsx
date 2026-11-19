"use client";

import { useActionState } from "react";
import { FORMAT_VIDEO, PAROLE, STATUT_VIDEO } from "@/lib/tournages-regles";
import { enregistrerVideo, type VideoState } from "../actions-videos";

const champ =
  "w-full min-w-0 rounded-control border border-line bg-paper px-3 py-2 text-base text-ink outline-none focus:border-gold";
const etiquette = "flex min-w-0 flex-col gap-[6px]";
const titreChamp = "text-small font-medium text-ink-2";

export type ValeursVideo = {
  id?: string;
  title?: string;
  description?: string | null;
  references?: string;
  script?: string | null;
  speaker?: string | null;
  prep?: string;
  durationSec?: number | null;
  format?: string | null;
  status?: string;
  visibleToClient?: boolean;
};

/**
 * Le formulaire d'une vidéo prévue, pour l'ajout comme pour la modification.
 *
 * Tout ce qui est ici est lu par le client si la vidéo lui est visible : les
 * consignes internes ont leur place dans la note du tournage, pas ici. Le
 * rappel est écrit sous le titre du formulaire.
 */
export function VideoForm({ shootId, valeurs = {}, onTermine }: { shootId: string; valeurs?: ValeursVideo; onTermine?: string }) {
  const [state, action, pending] = useActionState<VideoState, FormData>(enregistrerVideo, {});
  const edition = Boolean(valeurs.id);
  return (
    <form action={action} className="flex flex-col gap-3" data-formulaire-video={valeurs.id ?? "nouvelle"}>
      <input type="hidden" name="shootId" value={shootId} />
      {valeurs.id ? <input type="hidden" name="id" value={valeurs.id} /> : null}
      <div className="grid gap-3 lg:grid-cols-2">
        <label className={`${etiquette} lg:col-span-2`}>
          <span className={titreChamp}>Titre de la vidéo</span>
          <input name="title" required maxLength={160} defaultValue={valeurs.title ?? ""} placeholder="La visite de l'atelier en 30 secondes" className={champ} />
        </label>
        <label className={`${etiquette} lg:col-span-2`}>
          <span className={titreChamp}>Ce qu&apos;on va filmer, le message</span>
          <textarea
            name="description"
            rows={3}
            defaultValue={valeurs.description ?? ""}
            placeholder="On suit Yohan qui ouvre l'atelier le matin. Message : ici, tout est fait main."
            className={champ}
          />
        </label>
        <label className={`${etiquette} lg:col-span-2`}>
          <span className={titreChamp}>Vidéo de référence à reproduire (un lien par ligne)</span>
          <textarea
            name="references"
            rows={2}
            defaultValue={valeurs.references ?? ""}
            placeholder="https://www.instagram.com/reel/…"
            className={champ}
          />
        </label>
        <label className={etiquette}>
          <span className={titreChamp}>Script ou texte à dire (facultatif)</span>
          <textarea name="script" rows={4} defaultValue={valeurs.script ?? ""} placeholder="« Bienvenue chez … »" className={champ} />
        </label>
        <div className="flex min-w-0 flex-col gap-3">
          <label className={etiquette}>
            <span className={titreChamp}>Qui le dit</span>
            <select name="speaker" defaultValue={valeurs.speaker ?? ""} className={champ}>
              <option value="">Personne (pas de texte)</option>
              {Object.entries(PAROLE).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.agence}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className={etiquette}>
              <span className={titreChamp}>Format</span>
              <select name="format" defaultValue={valeurs.format ?? "reel"} className={champ}>
                {Object.entries(FORMAT_VIDEO).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className={etiquette}>
              <span className={titreChamp}>Durée (secondes)</span>
              <input name="duration" type="number" min={1} max={3600} inputMode="numeric" defaultValue={valeurs.durationSec ?? ""} placeholder="30" className={champ} />
            </label>
          </div>
        </div>
        <label className={`${etiquette} lg:col-span-2`}>
          <span className={titreChamp}>Ce que le client doit préparer (une chose par ligne)</span>
          <textarea
            name="prep"
            rows={3}
            defaultValue={valeurs.prep ?? ""}
            placeholder={"Tenue claire, sans logo\nLes trois produits phares\nYohan présent à 9 h"}
            className={champ}
          />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        {edition ? (
          <label className="flex items-center gap-2 text-base">
            <span className={titreChamp}>État</span>
            <select name="status" defaultValue={valeurs.status ?? "a_preparer"} className="rounded-control border border-line bg-paper px-2 py-[6px] text-base">
              {Object.entries(STATUT_VIDEO).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-base">
          <input type="checkbox" name="visible" defaultChecked={valeurs.visibleToClient ?? true} className="h-5 w-5 accent-[var(--color-ink)]" />
          Visible par le client
        </label>
        <button
          type="submit"
          disabled={pending}
          className="ml-auto min-h-11 cursor-pointer rounded-full border border-night bg-night px-5 py-2 text-base font-semibold text-white hover:opacity-85 disabled:opacity-60"
        >
          {pending ? "Enregistrement…" : edition ? "Enregistrer" : "Ajouter la vidéo"}
        </button>
      </div>
      {state.error ? <p className="text-small text-alert">{state.error}</p> : null}
      {state.ok ? (
        <p className="text-small text-ok" role="status">
          {state.ok}
          {onTermine ? ` ${onTermine}` : ""}
        </p>
      ) : null}
    </form>
  );
}
