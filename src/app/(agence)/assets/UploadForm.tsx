"use client";

import { useActionState } from "react";
import type { AssetFormState } from "./actions";
import { uploadAssets } from "./actions";

export function UploadForm({ clients }: { clients: { id: string; name: string }[] }) {
  const [state, formAction, pending] = useActionState<AssetFormState, FormData>(uploadAssets, {});

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-[6px]">
        <span className="eyebrow text-ink-3">Client</span>
        <select
          name="clientId"
          required
          defaultValue=""
          className="rounded-control border border-line bg-paper px-3 py-2 text-base outline-none focus:border-gold"
        >
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

      <label className="flex flex-1 flex-col gap-[6px]">
        <span className="eyebrow text-ink-3">Fichiers</span>
        <input
          type="file"
          name="files"
          multiple
          accept="image/jpeg,image/png,image/webp,image/avif,video/mp4,video/quicktime,video/webm"
          required
          className="rounded-control border border-line bg-paper px-3 py-[7px] text-base file:mr-3 file:cursor-pointer file:rounded-control file:border file:border-line file:bg-canvas file:px-2 file:py-1 file:text-small"
        />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="cursor-pointer rounded-control border border-ink bg-ink px-3 py-2 text-base font-medium text-paper hover:bg-black disabled:opacity-60"
      >
        {pending ? "Import en cours…" : "Importer"}
      </button>

      {state.error ? (
        <p className="w-full rounded-control border border-alert-line bg-alert-bg px-3 py-2 text-base text-alert">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p className="w-full rounded-control border border-ok bg-ok-bg px-3 py-2 text-base text-ok">
          {state.ok}
        </p>
      ) : null}
    </form>
  );
}
