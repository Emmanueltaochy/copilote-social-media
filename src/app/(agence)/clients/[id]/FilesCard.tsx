"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHead } from "@/components/ui/Card";
import { SendByEmail } from "@/components/ui/SendByEmail";

type File_ = {
  id: string;
  filename: string;
  label: string | null;
  mimeType: string;
  sizeBytes: number;
  visibility: string;
  createdAt: Date;
  uploadedByName: string | null;
};

function poids(n: number): string {
  if (n < 1024) return `${n} o`;
  const u = ["Ko", "Mo", "Go"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toLocaleString("fr-FR", { maximumFractionDigits: v < 10 ? 1 : 0 })} ${u[i]}`;
}

/**
 * Les pièces jointes d'un client : contrat, charte, devis, brief annuel.
 *
 * L'envoi passe par la même route en flux que les médias, pour la même
 * raison : au-delà de dix mégaoctets, un envoi classique serait tronqué en
 * silence. Un fichier par requête, et l'écran dit lequel a échoué.
 */
export function FilesCard({
  clientId,
  files,
  onDelete,
  onToggle,
}: {
  clientId: string;
  files: File_[];
  onDelete: (formData: FormData) => Promise<void>;
  onToggle: (formData: FormData) => Promise<void>;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const labelRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Interne par défaut : partager est un geste, la confidentialité non.
  const [partage, setPartage] = useState(false);

  async function send() {
    const picked = Array.from(inputRef.current?.files ?? []);
    if (picked.length === 0) return setError("Choisis un fichier.");
    setError(null);
    setBusy(true);

    for (const file of picked) {
      const r = await fetch(`/api/client-files?clientId=${encodeURIComponent(clientId)}`, {
        method: "POST",
        headers: {
          "content-type": file.type || "application/octet-stream",
          "x-filename": encodeURIComponent(file.name),
          "x-filesize": String(file.size),
          "x-label": encodeURIComponent(labelRef.current?.value ?? ""),
          "x-visibility": partage ? "client" : "interne",
        },
        body: file,
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        setError(`${file.name} : ${body.error ?? "envoi refusé"}`);
        break;
      }
    }

    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
    if (labelRef.current) labelRef.current.value = "";
    router.refresh();
  }

  return (
    <Card>
      <CardHead title="Pièces jointes" meta={files.length > 0 ? `${files.length}` : undefined} />

      {files.length === 0 ? (
        <p className="px-[14px] py-4 text-base text-ink-2">
          Aucun document. Le contrat, la charte de marque, un devis ou un brief annuel ont leur
          place ici : le jour où quelqu&apos;un cherche ce qui a été signé, il sait où regarder.
          Un document peut rester interne ou être partagé avec le client, qui le retrouve alors
          dans son portail.
        </p>
      ) : (
        files.map((f) => {
          const partagé = f.visibility === "client";
          return (
          <div key={f.id} data-fichier={f.id} className="flex items-center gap-3 border-b border-line px-[14px] py-[10px]">
            <span className="flex min-w-0 flex-1 flex-col">
              <a
                href={`/api/client-files/${f.id}`}
                target="_blank"
                rel="noreferrer"
                className="clip text-base font-medium text-ink no-underline hover:underline"
              >
                {f.label || f.filename}
              </a>
              <span className="clip text-small text-ink-3">
                {f.label ? `${f.filename} · ` : ""}
                {poids(f.sizeBytes)} · {new Date(f.createdAt).toLocaleDateString("fr-FR")}
                {f.uploadedByName ? ` · ${f.uploadedByName}` : ""}
              </span>
            </span>
            {/* L'état se lit sur le bouton, et le bouton fait basculer : deux
                éléments distincts — une pastille et une case — laisseraient
                douter de ce qui est vrai après le clic. */}
            <form action={onToggle} className="flex-none">
              <input type="hidden" name="id" value={f.id} />
              <input type="hidden" name="clientId" value={clientId} />
              <input type="hidden" name="visibility" value={partagé ? "interne" : "client"} />
              <button
                type="submit"
                title={
                  partagé
                    ? "Visible dans le portail du client — cliquer pour le repasser en interne"
                    : "Interne à l'agence — cliquer pour le partager avec le client"
                }
                className={
                  partagé
                    ? "cursor-pointer rounded-control border border-ok bg-ok-bg px-2 py-[2px] text-micro font-medium text-ok"
                    : "cursor-pointer rounded-control border border-line bg-paper px-2 py-[2px] text-micro text-ink-3 hover:border-line-strong hover:text-ink"
                }
              >
                {partagé ? "Partagé" : "Interne"}
              </button>
            </form>
            <SendByEmail kind="fichier" id={f.id} />
            <form action={onDelete} className="flex-none">
              <input type="hidden" name="id" value={f.id} />
              <input type="hidden" name="clientId" value={clientId} />
              <button
                type="submit"
                title="Supprimer"
                className="cursor-pointer rounded-control border border-line bg-paper px-[6px] py-[2px] text-micro text-ink-3 hover:border-alert hover:text-alert"
              >
                ✕
              </button>
            </form>
          </div>
          );
        })
      )}

      <div className="flex flex-wrap items-end gap-2 border-t border-line px-[14px] py-3">
        <input
          ref={labelRef}
          placeholder="Intitulé (Contrat 2026, Charte de marque…)"
          className="min-w-[200px] flex-1 rounded-control border border-line bg-paper px-2 py-[6px] text-small outline-none focus:border-gold"
        />
        <input
          ref={inputRef}
          type="file"
          multiple
          disabled={busy}
          onChange={() => setError(null)}
          className="min-w-0 flex-1 rounded-control border border-line bg-paper px-2 py-[5px] text-small file:mr-2 file:cursor-pointer file:rounded-control file:border file:border-line file:bg-canvas file:px-2 file:py-[2px] file:text-micro disabled:opacity-60"
        />
        <label className="flex flex-none cursor-pointer items-center gap-[6px] text-small text-ink-2">
          <input
            type="checkbox"
            checked={partage}
            onChange={(e) => setPartage(e.target.checked)}
            className="h-[15px] w-[15px] accent-ink"
          />
          Partager avec le client
        </label>
        <button
          type="button"
          onClick={send}
          disabled={busy}
          className="flex-none cursor-pointer rounded-control border border-line bg-paper px-[10px] py-[6px] text-small font-medium text-ink-2 hover:border-line-strong hover:text-ink disabled:opacity-60"
        >
          {busy ? "Envoi…" : "Joindre"}
        </button>
      </div>

      {error ? (
        <p className="px-[14px] pb-3 text-small text-alert">{error}</p>
      ) : (
        <p className="px-[14px] pb-3 text-small text-ink-3">
          PDF, Word, Excel, PowerPoint, OpenDocument, texte, CSV, ZIP ou image. Un document reste
          interne à l&apos;agence sauf si tu le partages : le client le retrouve alors dans son
          portail, et peut le télécharger. Chaque ligne se bascule à tout moment.
        </p>
      )}
    </Card>
  );
}
