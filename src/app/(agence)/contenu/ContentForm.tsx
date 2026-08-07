"use client";

import { useActionState } from "react";
import type { ContentFormState } from "./actions";

type Option = { id: string; name: string };

type Values = {
  id?: string;
  clientId?: string;
  title?: string;
  kind?: string;
  network?: string;
  scheduledAt?: string;
  caption?: string;
  instructions?: string;
};

const field =
  "rounded-control border border-line bg-paper px-3 py-2 text-base outline-none focus:border-gold";

const KINDS = [
  ["feed", "Post feed"],
  ["story", "Story"],
  ["reel", "Reel"],
  ["carrousel", "Carrousel"],
  ["autre", "Autre"],
];

const NETWORKS = [
  ["instagram", "Instagram"],
  ["facebook", "Facebook"],
  ["linkedin", "LinkedIn"],
  ["tiktok", "TikTok"],
  ["google", "Google"],
];

export function ContentForm({
  action,
  clients,
  values = {},
  submitLabel,
}: {
  action: (prev: ContentFormState, data: FormData) => Promise<ContentFormState>;
  clients: Option[];
  values?: Values;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-[6px]">
          <span className="eyebrow text-ink-3">Client</span>
          <select name="clientId" required defaultValue={values.clientId ?? ""} className={field}>
            <option value="" disabled>
              Choisir…
            </option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-[6px]">
          <span className="eyebrow text-ink-3">Titre</span>
          <input name="title" required defaultValue={values.title} className={field} />
        </label>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <label className="flex flex-col gap-[6px]">
          <span className="eyebrow text-ink-3">Format</span>
          <select name="kind" defaultValue={values.kind ?? "feed"} className={field}>
            {KINDS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-[6px]">
          <span className="eyebrow text-ink-3">Réseau</span>
          <select name="network" defaultValue={values.network ?? "instagram"} className={field}>
            {NETWORKS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-[6px]">
          <span className="eyebrow text-ink-3">Publication prévue</span>
          <input
            name="scheduledAt"
            type="datetime-local"
            defaultValue={values.scheduledAt}
            className={field}
          />
          <span className="text-small text-ink-3">Facultatif pour une idée.</span>
        </label>
      </div>

      <label className="flex flex-col gap-[6px]">
        <span className="eyebrow text-ink-3">Consignes de production</span>
        <textarea
          name="instructions"
          rows={4}
          defaultValue={values.instructions ?? ""}
          placeholder="Plan large du catamaran au coucher du soleil, logo en bas à droite, ambiance chaude. Ne pas montrer le ponton en travaux."
          className={field}
        />
        <span className="text-small text-ink-3">
          Ce qu&apos;on attend du post, pour celui qui le fabrique. Reste interne : le client ne le
          voit pas.
        </span>
      </label>

      <label className="flex flex-col gap-[6px]">
        <span className="eyebrow text-ink-3">Légende</span>
        <textarea name="caption" rows={4} defaultValue={values.caption ?? ""} className={field} />
        <span className="text-small text-ink-3">
          Le texte publié avec le visuel. Celui-là part en ligne.
        </span>
      </label>

      {state.error ? (
        <p className="rounded-control border border-alert-line bg-alert-bg px-3 py-2 text-base text-alert">
          {state.error}
        </p>
      ) : null}

      <div>
        <button
          type="submit"
          disabled={pending}
          className="cursor-pointer rounded-control border border-ink bg-ink px-3 py-2 text-base font-medium text-paper hover:bg-black disabled:opacity-60"
        >
          {pending ? "Enregistrement…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
