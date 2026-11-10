"use client";

import { useActionState } from "react";
import {
  enregistrerMetricool,
  oublierMetricool,
  relierMarque,
  synchroniserMetricool,
  type MetricoolState,
} from "./metricool-actions";

const champ =
  "min-w-0 flex-1 rounded-control border border-line bg-paper px-3 py-2 text-base text-ink outline-none focus:border-gold";
const primaire =
  "cursor-pointer rounded-full border-none bg-night px-4 py-2 text-base font-medium text-white hover:opacity-85 disabled:opacity-60";
const secondaire =
  "cursor-pointer rounded-full border border-line bg-paper px-4 py-2 text-base font-medium text-ink-2 hover:border-line-strong hover:text-ink";

type Brand = { id: string; label: string; networks: string[] };
type ClientRow = { id: string; name: string; brandId: string | null; suggested: string | null };

const NETS: Record<string, string> = { instagram: "IG", facebook: "FB", tiktok: "TT", linkedin: "IN", youtube: "YT" };

function Message({ state }: { state: MetricoolState }) {
  if (state.error) return <p className="text-small text-alert">{state.error}</p>;
  if (state.ok) return <p className="text-small text-ok">{state.ok}</p>;
  return null;
}

export function MetricoolReglages({
  connected,
  fromEnv,
  lastSyncAt,
  lastError,
  brands,
  brandsError,
  rows,
}: {
  connected: boolean;
  fromEnv: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
  brands: Brand[];
  brandsError: string | null;
  rows: ClientRow[];
}) {
  const [saveState, save, saving] = useActionState<MetricoolState, FormData>(enregistrerMetricool, {});
  const [syncState, sync, syncing] = useActionState<MetricoolState>(synchroniserMetricool, {});

  return (
    <div className="flex flex-col gap-5 p-[14px]">
      <form action={save} className="flex flex-col gap-2">
        <span className="eyebrow text-ink-3">Clé d&apos;API Metricool</span>
        <div className="flex flex-wrap gap-2">
          <input
            name="token"
            type="password"
            autoComplete="off"
            placeholder={connected ? "Clé enregistrée — collez-en une autre pour la remplacer" : "Collez ici la clé de votre compte"}
            className={champ}
          />
          <button type="submit" disabled={saving} className={primaire}>
            {saving ? "Vérification…" : "Enregistrer"}
          </button>
        </div>
        <p className="text-small text-ink-3">
          Metricool → Réglages du compte → API. La clé reste sur le serveur : elle n&apos;est plus jamais affichée.
          {fromEnv ? " (Clé actuelle fournie par la configuration du serveur.)" : ""}
        </p>
        <Message state={saveState} />
      </form>

      {connected ? (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <form action={sync}>
              <button type="submit" disabled={syncing} className={primaire}>
                {syncing ? "Relevé en cours… (1 à 2 min)" : "Relever les statistiques maintenant"}
              </button>
            </form>
            <span className="text-small text-ink-3">
              {lastSyncAt
                ? `Dernier relevé : ${new Date(lastSyncAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })} · automatique toutes les 6 h`
                : "Aucun relevé pour l'instant."}
            </span>
            {!fromEnv ? (
              <form action={oublierMetricool} className="ml-auto">
                <button type="submit" className={secondaire}>
                  Déconnecter
                </button>
              </form>
            ) : null}
          </div>
          <Message state={syncState} />
          {lastError ? (
            <pre className="m-0 rounded-control bg-mute p-3 text-small whitespace-pre-wrap text-ink-2">{lastError}</pre>
          ) : null}

          <div className="flex flex-col gap-2">
            <span className="eyebrow text-ink-3">Clients ↔ marques Metricool</span>
            {brandsError ? <p className="text-small text-alert">{brandsError}</p> : null}
            <div className="flex flex-col divide-y divide-line rounded-card border border-line">
              {rows.map((c) => {
                const current = c.brandId ?? "";
                const brand = brands.find((b) => b.id === current);
                const suggestion = !current && c.suggested ? brands.find((b) => b.id === c.suggested) : null;
                return (
                  <form key={c.id} action={relierMarque} className="flex flex-wrap items-center gap-3 px-3 py-[10px]">
                    <input type="hidden" name="clientId" value={c.id} />
                    <span className="min-w-[140px] flex-1 text-base font-medium">{c.name}</span>
                    {brand ? (
                      <span className="flex gap-1">
                        {brand.networks.map((n) => (
                          <span key={n} className="rounded-full bg-mute px-2 py-[1px] text-micro font-semibold text-ink-2">
                            {NETS[n] ?? n}
                          </span>
                        ))}
                      </span>
                    ) : null}
                    <select
                      name="brandId"
                      defaultValue={current}
                      onChange={(e) => e.currentTarget.form?.requestSubmit()}
                      className="max-w-[240px] rounded-control border border-line bg-paper px-2 py-[6px] text-base text-ink"
                    >
                      <option value="">— Pas de marque —</option>
                      {brands.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.label}
                        </option>
                      ))}
                    </select>
                    {suggestion ? (
                      <button
                        type="submit"
                        name="brandId"
                        value={suggestion.id}
                        className="cursor-pointer rounded-full border border-dashed border-gold bg-transparent px-3 py-[5px] text-small font-medium text-ink"
                      >
                        Relier à « {suggestion.label} » ?
                      </button>
                    ) : null}
                  </form>
                );
              })}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
