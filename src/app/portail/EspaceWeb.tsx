"use client";

import { useRef, useState } from "react";
import { useActionState } from "react";
import { majCharte, repondreAuLivrable, retirerFichier, type PortailWebState } from "./actions-web";

const champ =
  "w-full rounded-control border border-line bg-paper px-3 py-2 text-base outline-none focus:border-gold";

/**
 * Le dépôt de fichiers, côté client.
 *
 * Passe par une requête directe et non par un formulaire classique : une vidéo
 * tournée au téléphone dépasse largement ce qu'une action serveur accepte, et
 * le dépassement s'y solde par un écran blanc sans explication.
 */
export function DepotFichiers({ clientId, accent }: { clientId: string; accent: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [progression, setProgression] = useState<number | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  async function envoyer() {
    const fichiers = Array.from(inputRef.current?.files ?? []);
    if (fichiers.length === 0) return setErreur("Choisissez un fichier.");
    setErreur(null);

    for (const f of fichiers) {
      const résultat = await new Promise<{ error?: string }>((resolve) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `/api/client-files?clientId=${encodeURIComponent(clientId)}`);
        xhr.setRequestHeader("x-filename", encodeURIComponent(f.name));
        xhr.setRequestHeader("x-filesize", String(f.size));
        xhr.setRequestHeader("content-type", f.type || "application/octet-stream");
        xhr.upload.onprogress = (e) => setProgression(Math.round((e.loaded / f.size) * 100));
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) return resolve({});
          let message = `Refusé par le serveur (${xhr.status}).`;
          try {
            const body = JSON.parse(xhr.responseText);
            if (body?.error) message = body.error;
          } catch {
            // Réponse illisible : le message par défaut suffit.
          }
          resolve({ error: message });
        };
        xhr.onerror = () => resolve({ error: "Connexion interrompue pendant l'envoi." });
        xhr.send(f);
      });

      if (résultat.error) {
        setErreur(`${f.name} : ${résultat.error}`);
        break;
      }
    }

    setProgression(null);
    if (inputRef.current) inputRef.current.value = "";
    window.location.reload();
  }

  return (
    <div className="flex flex-col gap-2 px-4 py-4 sm:px-6">
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          multiple
          disabled={progression !== null}
          onChange={() => setErreur(null)}
          className="min-w-0 flex-1 rounded-control border border-line bg-paper px-3 py-2 text-base file:mr-2 file:cursor-pointer file:rounded-control file:border file:border-line file:bg-canvas file:px-2 file:py-1 file:text-small disabled:opacity-60"
        />
        <button
          type="button"
          onClick={envoyer}
          disabled={progression !== null}
          style={{ background: accent, borderColor: accent }}
          className="flex-none cursor-pointer rounded-control border px-3 py-2 text-base font-medium text-paper disabled:opacity-60"
        >
          {progression !== null ? `Envoi ${progression} %` : "Envoyer"}
        </button>
      </div>
      <p className="text-small text-ink-3">
        PDF, images et vidéos. Logo, photos, textes, devis d&apos;un prestataire — tout ce qui aide
        à avancer.
      </p>
      {erreur ? <p className="text-small text-alert">{erreur}</p> : null}
    </div>
  );
}

/**
 * La charte graphique, écrite des deux côtés.
 *
 * Le client renseigne ce qu'il sait, l'agence complète : c'est le même
 * document, pas deux versions qu'on essaie ensuite de réconcilier.
 */
export function CharteClient({
  couleurs,
  polices,
  ton,
  accent,
  clientId,
}: {
  couleurs: string[];
  polices: string | null;
  ton: string | null;
  accent: string;
  /** Renseigné côté agence : le client, lui, n'écrit que dans son dossier. */
  clientId?: string;
}) {
  const [état, setÉtat] = useState<"repos" | "envoi" | "ok">("repos");

  return (
    <form
      action={async (data) => {
        setÉtat("envoi");
        await majCharte(data);
        setÉtat("ok");
      }}
      className="flex flex-col gap-3 px-4 py-4 sm:px-6"
    >
      {clientId ? <input type="hidden" name="clientId" value={clientId} /> : null}
      <label className="flex flex-col gap-[6px]">
        <span className="eyebrow text-ink-3">Couleurs</span>
        <input
          name="palette"
          defaultValue={couleurs.join(" ")}
          placeholder="#0F3B57 #2E9BC4 #F2F2F0"
          className={champ}
        />
        <span className="text-small text-ink-3">
          Séparées par un espace. Si vous ne les connaissez pas, laissez vide : nous les
          proposerons.
        </span>
      </label>

      {couleurs.length > 0 ? (
        <span className="flex flex-wrap gap-2">
          {couleurs.map((c) => (
            <span key={c} className="flex items-center gap-2 rounded-control border border-line px-2 py-1">
              <span className="h-4 w-4 rounded-[3px] border border-line" style={{ background: c }} />
              <span className="text-small tabular-nums text-ink-2">{c}</span>
            </span>
          ))}
        </span>
      ) : null}

      <label className="flex flex-col gap-[6px]">
        <span className="eyebrow text-ink-3">Polices</span>
        <input name="fonts" defaultValue={polices ?? ""} placeholder="Montserrat, Georgia" className={champ} />
      </label>

      <label className="flex flex-col gap-[6px]">
        <span className="eyebrow text-ink-3">Ton et style</span>
        <textarea
          name="voice"
          rows={3}
          defaultValue={ton ?? ""}
          placeholder="Chaleureux et direct, on tutoie. Éviter le jargon technique."
          className={champ}
        />
      </label>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          style={{ background: accent, borderColor: accent }}
          className="cursor-pointer rounded-control border px-3 py-2 text-base font-medium text-paper"
        >
          {état === "envoi" ? "Enregistrement…" : "Enregistrer"}
        </button>
        {état === "ok" ? <span className="text-small text-ok">✓ Enregistré</span> : null}
      </div>
    </form>
  );
}

/** Retirer un fichier qu'on a déposé soi-même. */
export function BoutonRetirer({ id }: { id: string }) {
  return (
    <form action={retirerFichier} className="flex-none">
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        title="Retirer ce fichier"
        className="cursor-pointer rounded-control border border-line bg-paper px-2 py-[2px] text-micro text-ink-3 hover:border-alert hover:text-alert"
      >
        Retirer
      </button>
    </form>
  );
}


/**
 * Un livrable soumis au client : une maquette, une préproduction, un document.
 *
 * Deux gestes, comme pour un post : valider, ou dire ce qui doit changer. Le
 * motif est exigé sur un refus — sans lui, la reprise repart à l'aveugle et le
 * même aller-retour se reproduit.
 */
export function LivrableClient({
  id,
  label,
  note,
  href,
  statut,
  remarque,
  accent,
}: {
  id: string;
  label: string;
  note: string | null;
  href: string;
  statut: "en_attente" | "valide" | "modifications";
  remarque: string | null;
  accent: string;
}) {
  const [state, action, pending] = useActionState<PortailWebState, FormData>(
    repondreAuLivrable,
    {},
  );

  return (
    <div
      // L'ancre sert au lien « ce qu'on attend de vous » : il mène droit à la
      // maquette concernée plutôt qu'en haut d'une page à parcourir.
      id={`livrable-${id}`}
      data-livrable={id}
      className="flex flex-col gap-3 border-t border-line px-4 py-4 sm:px-6"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="text-lead font-medium"
          style={{ color: accent }}
        >
          {label} ↗
        </a>
        <span className="text-small text-ink-3">
          {statut === "valide"
            ? "Validé par vous"
            : statut === "modifications"
              ? "Reprise demandée"
              : "À regarder"}
        </span>
      </div>

      {note ? <span className="text-base text-ink-2">{note}</span> : null}

      {statut === "valide" || state.ok ? (
        <span className="rounded-control border border-ok bg-ok-bg px-3 py-2 text-base text-ok">
          {state.ok ?? "Validé, merci."}
        </span>
      ) : statut === "modifications" ? (
        <span className="rounded-control border border-line bg-canvas px-3 py-2 text-base text-ink-2">
          Vous avez demandé : « {remarque} ». Nous reprenons et vous revenons dessus.
        </span>
      ) : (
        <form action={action} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="id" value={id} />
          <button
            type="submit"
            name="decision"
            value="valide"
            disabled={pending}
            style={{ background: accent, borderColor: accent }}
            className="flex-none cursor-pointer rounded-control border px-3 py-2 text-base font-medium text-paper disabled:opacity-60"
          >
            {pending ? "Un instant…" : "Valider"}
          </button>

          <label className="flex min-w-[240px] flex-1 flex-col gap-[6px]">
            <span className="eyebrow text-ink-3">Ou dites ce qui doit changer</span>
            <input
              name="note"
              placeholder="Le bleu du bandeau est trop foncé, et il manque le numéro de téléphone."
              className={champ}
            />
          </label>

          <button
            type="submit"
            name="decision"
            value="modifications"
            disabled={pending}
            className="flex-none cursor-pointer rounded-control border border-line bg-paper px-3 py-2 text-base font-medium text-ink-2 hover:border-line-strong hover:text-ink disabled:opacity-60"
          >
            Envoyer
          </button>

          {state.error ? (
            <p className="w-full rounded-control border border-alert-line bg-alert-bg px-3 py-2 text-base text-alert">
              {state.error}
            </p>
          ) : null}
        </form>
      )}
    </div>
  );
}
