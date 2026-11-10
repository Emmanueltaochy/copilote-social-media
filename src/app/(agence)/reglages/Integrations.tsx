"use client";

import { useActionState, useState } from "react";
import { enregistrerCle, genererMcp, majClientPublication, oublierCle, type IntegState } from "./integrations-actions";

const champ = "min-w-0 flex-1 rounded-control border border-line bg-paper px-3 py-2 text-base text-ink outline-none focus:border-gold";
const primaire = "cursor-pointer rounded-full border-none bg-night px-4 py-2 text-base font-medium text-white hover:opacity-85 disabled:opacity-60";
const secondaire = "cursor-pointer rounded-full border border-line bg-paper px-4 py-2 text-base font-medium text-ink-2 hover:border-line-strong hover:text-ink";

function Msg({ s }: { s: IntegState }) {
  if (s.error) return <p className="text-small text-alert">{s.error}</p>;
  if (s.ok) return <p className="text-small text-ok">{s.ok}</p>;
  return null;
}

/** Une clé d'API : saisie, vérifiée côté serveur, jamais réaffichée. */
export function CleIntegration({
  id,
  connected,
  fromEnv,
  label,
  help,
  multiline,
}: {
  id: "anthropic" | "abby" | "google-drive";
  connected: boolean;
  fromEnv: boolean;
  label: string;
  help: React.ReactNode;
  multiline?: boolean;
}) {
  const [state, action, pending] = useActionState<IntegState, FormData>(enregistrerCle, {});
  return (
    <div className="flex flex-col gap-2 p-[14px] px-5">
      <form action={action} className="flex flex-col gap-2">
        <input type="hidden" name="id" value={id} />
        <span className="eyebrow text-ink-3">
          {label} · {connected ? (fromEnv ? "fournie par le serveur" : "enregistrée") : "non raccordé"}
        </span>
        <div className="flex flex-wrap items-start gap-2">
          {multiline ? (
            <textarea name="token" rows={3} autoComplete="off" placeholder={connected ? "Clé enregistrée — collez-en une autre pour la remplacer" : "Collez le JSON ici"} className={champ} />
          ) : (
            <input name="token" type="password" autoComplete="off" placeholder={connected ? "Clé enregistrée — collez-en une autre pour la remplacer" : "Collez la clé ici"} className={champ} />
          )}
          <button type="submit" disabled={pending} className={primaire}>
            {pending ? "Vérification…" : "Enregistrer"}
          </button>
        </div>
        <p className="text-small text-ink-3">{help}</p>
        <Msg s={state} />
      </form>
      {connected && !fromEnv ? (
        <form action={oublierCle}>
          <input type="hidden" name="id" value={id} />
          <button type="submit" className={secondaire}>
            Déconnecter
          </button>
        </form>
      ) : null}
    </div>
  );
}

export function ConnecteurClaude({ url }: { url: string | null }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-3 p-[14px] px-5">
      <p className="text-base text-ink-2">
        Dans une conversation Claude (claude.ai) déjà reliée à Canva et à vos autres outils, ajoutez Pilot comme connecteur : Claude pourra créer les
        visuels dans la charte du client sur Canva, puis créer et programmer les publications dans Pilot.
      </p>
      {url ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-control bg-mute px-3 py-2 text-small">{url}</code>
            <button
              type="button"
              className={secondaire}
              onClick={() => {
                void navigator.clipboard.writeText(url).then(() => setCopied(true));
              }}
            >
              {copied ? "Copié" : "Copier"}
            </button>
          </div>
          <p className="text-small text-ink-3">
            Claude.ai → Paramètres → Connecteurs → Ajouter un connecteur personnalisé → collez cette adresse. Elle vaut mot de passe : ne la partagez pas.
            Pour la révoquer, générez-en une nouvelle.
          </p>
        </>
      ) : null}
      <form action={genererMcp}>
        <button type="submit" className={url ? secondaire : primaire}>
          {url ? "Générer une nouvelle adresse (l'ancienne cesse de marcher)" : "Générer l'adresse de connexion"}
        </button>
      </form>
    </div>
  );
}

export function PublicationClients({ rows }: { rows: { id: string; name: string; publishMode: string; driveFolderId: string | null }[] }) {
  return (
    <div className="flex flex-col divide-y divide-line">
      {rows.map((c) => (
        <form key={c.id} action={majClientPublication} className="flex flex-wrap items-center gap-3 px-5 py-3">
          <input type="hidden" name="clientId" value={c.id} />
          <span className="min-w-[140px] flex-1 text-base font-medium">{c.name}</span>
          <select name="publishMode" defaultValue={c.publishMode} onChange={(e) => e.currentTarget.form?.requestSubmit()} className="rounded-control border border-line bg-paper px-2 py-[6px] text-base text-ink">
            <option value="validation">Valide avant publication</option>
            <option value="confiance">Nous fait confiance</option>
          </select>
          <input
            name="drive"
            defaultValue={c.driveFolderId ? `https://drive.google.com/drive/folders/${c.driveFolderId}` : ""}
            placeholder="Lien du dossier Drive des rushs"
            onBlur={(e) => e.currentTarget.form?.requestSubmit()}
            className="w-full max-w-[340px] rounded-control border border-line bg-paper px-3 py-[6px] text-small text-ink outline-none focus:border-gold"
          />
        </form>
      ))}
    </div>
  );
}
