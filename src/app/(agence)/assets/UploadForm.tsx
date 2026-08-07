"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Item = {
  file: File;
  state: "attente" | "envoi" | "fait" | "erreur";
  sent: number;
  error?: string;
};

/**
 * Plafonds, repris du serveur.
 *
 * Contrôlés ici aussi, avant d'envoyer : annoncer « trop lourd » au bout de
 * dix minutes de transfert est la pire façon de le dire. Le serveur reste
 * l'autorité — ce contrôle-ci ne fait qu'épargner l'attente.
 */
const MAX_IMAGE = 400 * 1024 * 1024;
const MAX_VIDEO = 4 * 1024 * 1024 * 1024;

const estVideo = (f: File) =>
  f.type.startsWith("video/") || /\.(mp4|m4v|mov|webm|mkv)$/i.test(f.name);

/** « 1,2 Go », « 340 Ko » — mêmes règles que côté serveur. */
function formatBytes(n: number): string {
  if (n < 1024) return `${n} o`;
  const units = ["Ko", "Mo", "Go", "To"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toLocaleString("fr-FR", { maximumFractionDigits: v < 10 ? 1 : 0 })} ${units[i]}`;
}

/**
 * Envoie un fichier et rapporte l'avancement en octets.
 *
 * XMLHttpRequest plutôt que fetch : c'est le seul moyen, aujourd'hui encore,
 * de connaître l'avancement d'un envoi. Sur une photo de 60 Mo derrière une
 * connexion domestique, une barre qui ne bouge pas pendant deux minutes est
 * indiscernable d'une page plantée.
 */
function upload(
  file: File,
  clientId: string,
  onProgress: (sent: number) => void,
): Promise<{ error?: string }> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/upload?clientId=${encodeURIComponent(clientId)}`);
    xhr.setRequestHeader("x-filename", encodeURIComponent(file.name));
    // La taille attendue voyage dans un en-tête à nous. Content-Length peut
    // disparaître en chemin — un relais qui retransmet par blocs le retire —
    // et sans taille de référence, un envoi coupé est indiscernable d'un
    // envoi terminé.
    xhr.setRequestHeader("x-filesize", String(file.size));
    // Le type vient du navigateur ; vide pour certains formats, le serveur le
    // refusera alors avec un message clair plutôt que de deviner.
    xhr.setRequestHeader("content-type", file.type || "application/octet-stream");

    xhr.upload.onprogress = (e) => onProgress(e.loaded);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve({});
      let message = `Refusé par le serveur (${xhr.status}).`;
      if (xhr.status === 413) {
        // 413 vient de nginx, pas de l'application : c'est sa propre limite
        // de taille, réglée par le script d'installation. Le dire évite de
        // chercher le problème dans le fichier, qui n'a rien.
        message =
          "Refusé par le serveur web avant d'arriver à l'application : sa limite de taille " +
          "n'est pas levée. Relance scripts/setup-vps.sh sur le VPS.";
      }
      try {
        const body = JSON.parse(xhr.responseText);
        if (body?.error) message = body.error;
      } catch {
        // Réponse non lisible : le message par défaut fait l'affaire.
      }
      resolve({ error: message });
    };
    xhr.onerror = () => resolve({ error: "Connexion interrompue pendant l'envoi." });
    xhr.onabort = () => resolve({ error: "Envoi annulé." });

    xhr.send(file);
  });
}

export function UploadForm({ clients }: { clients: { id: string; name: string }[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [clientId, setClientId] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = items.reduce((n, i) => n + i.file.size, 0);
  const sent = items.reduce((n, i) => n + (i.state === "fait" ? i.file.size : i.sent), 0);
  const done = items.filter((i) => i.state === "fait").length;
  const failed = items.filter((i) => i.state === "erreur");

  async function start(only?: File[]) {
    if (!clientId) return setError("Choisis un client.");
    const files = only ?? Array.from(inputRef.current?.files ?? []);
    if (files.length === 0) return setError("Aucun fichier sélectionné.");

    const tropLourd = files.find((f) => f.size > (estVideo(f) ? MAX_VIDEO : MAX_IMAGE));
    if (tropLourd) {
      return setError(
        `${tropLourd.name} pèse ${formatBytes(tropLourd.size)}, au-delà des ` +
          `${formatBytes(estVideo(tropLourd) ? MAX_VIDEO : MAX_IMAGE)} autorisés pour ` +
          `${estVideo(tropLourd) ? "une vidéo" : "une image"}. Rien n'a été envoyé.`,
      );
    }

    setError(null);
    setRunning(true);
    const queue: Item[] = files.map((file) => ({ file, state: "attente", sent: 0 }));
    setItems(queue);

    // Séquentiel, et non tous en parallèle : trente envois simultanés se
    // partagent la même bande passante sans rien terminer plus vite, saturent
    // le serveur, et rendent l'avancement illisible.
    for (let i = 0; i < queue.length; i += 1) {
      setItems((prev) => prev.map((it, k) => (k === i ? { ...it, state: "envoi" } : it)));

      const onProgress = (bytes: number) =>
        setItems((prev) => prev.map((it, k) => (k === i ? { ...it, sent: bytes } : it)));

      let result = await upload(queue[i].file, clientId, onProgress);

      // Une coupure en cours d'envoi est le cas le plus courant sur une
      // connexion domestique, et le serveur refuse alors le fichier sans rien
      // enregistrer. Une seconde tentative suffit presque toujours, et la
      // demander à la main pour trente fichiers reviendrait à ne jamais les
      // importer. Une seule reprise : au-delà, ce n'est plus un hasard.
      if (result.error && /interrompu/i.test(result.error)) {
        onProgress(0);
        result = await upload(queue[i].file, clientId, onProgress);
      }

      setItems((prev) =>
        prev.map((it, k) =>
          k === i
            ? result.error
              ? { ...it, state: "erreur", error: result.error }
              : { ...it, state: "fait", sent: it.file.size }
            : it,
        ),
      );
    }

    setRunning(false);
    // La sélection de fichiers est conservée : elle est la seule source des
    // fichiers à relancer, le navigateur ne permettant pas de la reconstruire.
    // La bibliothèque est rendue par le serveur : il faut lui redemander la
    // page pour qu'elle montre ce qui vient d'arriver.
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-[6px]">
          <span className="eyebrow text-ink-3">Client</span>
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            disabled={running}
            className="rounded-control border border-line bg-paper px-3 py-2 text-base outline-none focus:border-gold disabled:opacity-60"
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
            ref={inputRef}
            type="file"
            multiple
            accept="image/*,video/*"
            disabled={running}
            onChange={() => setError(null)}
            className="rounded-control border border-line bg-paper px-3 py-[7px] text-base file:mr-3 file:cursor-pointer file:rounded-control file:border file:border-line file:bg-canvas file:px-2 file:py-1 file:text-small disabled:opacity-60"
          />
        </label>

        <button
          type="button"
          onClick={() => start()}
          disabled={running}
          className="cursor-pointer rounded-control border border-ink bg-ink px-3 py-2 text-base font-medium text-paper hover:bg-black disabled:opacity-60"
        >
          {running ? `Import ${done + 1} sur ${items.length}…` : "Importer"}
        </button>
      </div>

      {error ? (
        <p className="rounded-control border border-alert-line bg-alert-bg px-3 py-2 text-base text-alert">
          {error}
        </p>
      ) : null}

      {items.length > 0 ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <span className="h-2 flex-1 overflow-hidden rounded-[2px] bg-slot">
              <span
                className="block h-full bg-ink-2 transition-[width] duration-200"
                style={{ width: total > 0 ? `${Math.min(100, (sent / total) * 100)}%` : "0%" }}
              />
            </span>
            <span className="flex-none text-small tabular-nums text-ink-2">
              {done} / {items.length} · {formatBytes(sent)} sur {formatBytes(total)}
            </span>
          </div>

          {/* Les fichiers déjà passés n'apprennent plus rien : seuls restent
              ceux en cours et ceux qui ont échoué. */}
          {items
            .filter((i) => i.state !== "fait")
            .slice(0, 8)
            .map((i) => (
              <div key={i.file.name + i.file.size} className="flex flex-col gap-[2px] text-small">
                <span className="flex items-center gap-3">
                  <span className="clip min-w-0 flex-1 text-ink-2">{i.file.name}</span>
                  <span className="flex-none tabular-nums text-ink-3">
                    {formatBytes(i.file.size)}
                  </span>
                  <span
                    className={`w-[90px] flex-none text-right tabular-nums ${
                      i.state === "erreur" ? "text-alert" : "text-ink-3"
                    }`}
                  >
                    {i.state === "erreur"
                      ? "refusé"
                      : i.state === "envoi"
                        ? `${Math.round((i.sent / Math.max(1, i.file.size)) * 100)} %`
                        : "en attente"}
                  </span>
                </span>
                {/* Le motif du refus occupe toute la largeur : coincé dans une
                    colonne étroite, il devient une colonne de mots illisible. */}
                {i.state === "erreur" ? (
                  <span className="text-small leading-snug text-alert">{i.error}</span>
                ) : null}
              </div>
            ))}

          {!running && failed.length === 0 ? (
            <p className="rounded-control border border-ok bg-ok-bg px-3 py-2 text-base text-ok">
              {items.length} média{items.length > 1 ? "s importés" : " importé"}.
            </p>
          ) : null}
          {!running && failed.length > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-alert-line bg-alert-bg px-3 py-2">
              <p className="text-base text-alert">
                {done} importé{done > 1 ? "s" : ""}, {failed.length} en échec. Le motif est indiqué
                sous chaque fichier.
              </p>
              {/* Un échec passager — mémoire du serveur, connexion — se rattrape
                  d'un clic. Redemander la sélection des trente fichiers pour en
                  reprendre trois est le meilleur moyen de ne pas les reprendre. */}
              <button
                type="button"
                onClick={() => start(failed.map((i) => i.file))}
                className="flex-none cursor-pointer rounded-control border border-alert bg-paper px-3 py-1 text-base font-medium text-alert hover:bg-alert-bg"
              >
                Relancer les {failed.length} en échec
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
