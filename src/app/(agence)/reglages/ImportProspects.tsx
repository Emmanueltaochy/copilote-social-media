"use client";

import { useActionState, useState } from "react";
import { creerCleImport, revoquerCleImport, type CleImportState } from "./import-actions";

const primaire = "cursor-pointer rounded-full border-none bg-night px-4 py-2 text-base font-medium text-white hover:opacity-85 disabled:opacity-60";
const secondaire = "cursor-pointer rounded-full border border-line bg-paper px-3 py-1 text-small font-medium text-ink-2 hover:border-alert hover:text-alert";

type Cle = { id: string; name: string; prefix: string; createdAt: string; lastUsedAt: string | null };
type Import = { source: string | null; n: number; dernier: string | null };

const jour = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "jamais";

/**
 * L'import des fichiers de l'agent ventes (prospects.json, sans-site.json) :
 * une clé à créer ici, puis une commande à lancer là où vivent les fichiers.
 */
export function ImportProspects({ cles, imports, origine }: { cles: Cle[]; imports: Import[]; origine: string }) {
  const [state, action, pending] = useActionState<CleImportState, FormData>(creerCleImport, {});
  const [copie, setCopie] = useState(false);
  const commande = `PILOT_URL=${origine} PILOT_IMPORT_KEY=${state.jeton ?? "tpk_…"} \\\n  node scripts/importer-annuaire.mjs ../montagevideo/docs/crm/prospects.json ../montagevideo/docs/crm/sans-site.json`;
  return (
    <div className="flex flex-col gap-3 p-[14px] px-5">
      <p className="text-base text-ink-2">
        Les prospects de l&apos;agent ventes (France, Réunion) et les entreprises sans site trouvées sur Google Maps entrent dans
        « Contacts » par import. Un nouvel envoi met les fiches à jour, sans doublon.
      </p>
      {imports.length ? (
        <ul className="flex flex-col gap-1 text-small text-ink-3">
          {imports.map((i) => (
            <li key={i.source ?? "?"}>
              {i.source === "sans-site" ? "sans-site.json" : "prospects.json"} : {i.n} fiches · dernier import le {jour(i.dernier)}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-small text-ink-3">Aucun import pour l&apos;instant.</p>
      )}

      {cles.length ? (
        <div className="flex flex-col divide-y divide-line rounded-control border border-line">
          {cles.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="clip text-base text-ink">{c.name}</span>
                <span className="text-small text-ink-3">
                  {c.prefix}… · créée le {jour(c.createdAt)} · dernier usage : {jour(c.lastUsedAt)}
                </span>
              </span>
              <form action={revoquerCleImport}>
                <input type="hidden" name="id" value={c.id} />
                <button type="submit" className={secondaire}>
                  Révoquer
                </button>
              </form>
            </div>
          ))}
        </div>
      ) : null}

      <form action={action} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="nom" value="Import des prospects (agent ventes)" />
        <button type="submit" disabled={pending} className={primaire}>
          {pending ? "Création…" : cles.length ? "Créer une autre clé d'import" : "Créer la clé d'import"}
        </button>
        {state.error ? <span className="text-small text-alert">{state.error}</span> : null}
      </form>

      {state.jeton ? (
        <div className="flex flex-col gap-2 rounded-control border border-warn bg-warn-bg p-3">
          <span className="text-small font-semibold text-ink">Copiez la clé maintenant : elle ne s&apos;affichera plus jamais.</span>
          <code className="block overflow-x-auto rounded-control bg-paper px-3 py-2 text-small break-all">{state.jeton}</code>
          <button
            type="button"
            className="w-fit cursor-pointer rounded-full border border-line bg-paper px-3 py-1 text-small font-medium text-ink"
            onClick={() => void navigator.clipboard.writeText(state.jeton!).then(() => setCopie(true))}
          >
            {copie ? "Copiée" : "Copier la clé"}
          </button>
        </div>
      ) : null}

      <div className="flex flex-col gap-1">
        <span className="eyebrow text-ink-3">Commande à lancer depuis le dépôt Pilot</span>
        <pre className="overflow-x-auto rounded-control bg-mute px-3 py-2 text-small whitespace-pre-wrap break-all">{commande}</pre>
        <p className="text-small text-ink-3">
          Les chemins supposent le dépôt de l&apos;agent ventes (montagevideo) à côté de Pilot ; adaptez-les sinon. La clé reste dans la commande, jamais dans un fichier.
        </p>
      </div>
    </div>
  );
}
