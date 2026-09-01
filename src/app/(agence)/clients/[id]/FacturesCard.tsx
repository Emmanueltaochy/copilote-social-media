"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHead } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/primitives";

type Facture = {
  id: string;
  number: string;
  label: string | null;
  amountCents: number;
  issuedOn: string;
  dueOn: string | null;
  paidOn: string | null;
  filename: string;
};

const champ =
  "rounded-control border border-line bg-paper px-2 py-[6px] text-small outline-none focus:border-gold";

const euros = (cents: number) =>
  `${(cents / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

const jour = (iso: string | null) =>
  iso ? new Date(`${iso}T00:00:00`).toLocaleDateString("fr-FR") : null;

/** Aujourd'hui au format ISO, pour proposer la date du jour à l'émission. */
function aujourdhui(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Les factures d'un client.
 *
 * Le fichier et ses informations partent ensemble : demander de créer une
 * ligne puis d'y attacher un PDF ferait deux gestes là où la facture est un
 * seul objet, et laisserait des lignes sans document si l'on s'interrompt.
 *
 * L'envoi passe par une route en flux, comme les autres pièces jointes : une
 * action serveur tronquerait en silence au-delà de dix mégaoctets.
 */
export function FacturesCard({
  clientId,
  factures,
  onDelete,
  onPaiement,
}: {
  clientId: string;
  factures: Facture[];
  onDelete: (formData: FormData) => Promise<void>;
  onPaiement: (formData: FormData) => Promise<void>;
}) {
  const router = useRouter();
  const fichierRef = useRef<HTMLInputElement>(null);
  const numeroRef = useRef<HTMLInputElement>(null);
  const libelleRef = useRef<HTMLInputElement>(null);
  const montantRef = useRef<HTMLInputElement>(null);
  const emissionRef = useRef<HTMLInputElement>(null);
  const echeanceRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function envoyer() {
    const file = fichierRef.current?.files?.[0];
    if (!file) return setErreur("Choisis le PDF de la facture.");
    if (!numeroRef.current?.value.trim()) return setErreur("Le numéro de facture est obligatoire.");
    if (!emissionRef.current?.value) return setErreur("La date d'émission est obligatoire.");

    setErreur(null);
    setBusy(true);
    const r = await fetch(`/api/invoice?clientId=${encodeURIComponent(clientId)}`, {
      method: "POST",
      headers: {
        "content-type": file.type || "application/pdf",
        "x-filename": encodeURIComponent(file.name),
        "x-filesize": String(file.size),
        "x-number": encodeURIComponent(numeroRef.current.value.trim()),
        "x-label": encodeURIComponent(libelleRef.current?.value ?? ""),
        "x-amount": encodeURIComponent(montantRef.current?.value ?? "0"),
        "x-issued": encodeURIComponent(emissionRef.current.value),
        "x-due": encodeURIComponent(echeanceRef.current?.value ?? ""),
      },
      body: file,
    });
    setBusy(false);
    if (!r.ok) {
      const body = await r.json().catch(() => ({}));
      return setErreur(body.error ?? "Envoi refusé.");
    }
    for (const ref of [fichierRef, numeroRef, libelleRef, montantRef, echeanceRef]) {
      if (ref.current) ref.current.value = "";
    }
    router.refresh();
  }

  const impayees = factures.filter((f) => !f.paidOn);

  return (
    <Card>
      <CardHead
        title="Factures"
        meta={
          factures.length
            ? `${factures.length}${impayees.length ? ` · ${impayees.length} à régler` : ""}`
            : undefined
        }
      />

      {factures.length === 0 ? (
        <p className="px-[14px] py-4 text-base text-ink-2">
          Aucune facture. Celles que tu déposes ici apparaissent dans le portail du client, qui
          peut les télécharger pour sa comptabilité — sans avoir à te les redemander en janvier.
        </p>
      ) : (
        factures.map((f) => {
          const enRetard = !f.paidOn && f.dueOn ? new Date(`${f.dueOn}T00:00:00`) < new Date() : false;
          return (
            <div
              key={f.id}
              data-facture={f.id}
              className="flex flex-wrap items-center gap-3 border-b border-line px-[14px] py-[10px]"
            >
              <span className="flex min-w-[200px] flex-1 flex-col">
                <a
                  href={`/api/invoice/${f.id}`}
                  className="clip text-base font-medium text-ink no-underline hover:underline"
                >
                  {f.number}
                  {f.label ? ` — ${f.label}` : ""}
                </a>
                <span className="clip text-small text-ink-3">
                  émise le {jour(f.issuedOn)}
                  {f.dueOn ? ` · échéance ${jour(f.dueOn)}` : ""}
                  {f.paidOn ? ` · réglée le ${jour(f.paidOn)}` : ""}
                </span>
              </span>

              <span className="flex-none text-base tabular-nums text-ink">{euros(f.amountCents)}</span>

              {f.paidOn ? (
                <StatusPill tone="ok">Réglée</StatusPill>
              ) : enRetard ? (
                <StatusPill tone="alert">En retard</StatusPill>
              ) : (
                <StatusPill tone="warn">À régler</StatusPill>
              )}

              <form action={onPaiement} className="flex-none">
                <input type="hidden" name="id" value={f.id} />
                <input type="hidden" name="clientId" value={clientId} />
                <input type="hidden" name="paid" value={f.paidOn ? "false" : "true"} />
                <button
                  type="submit"
                  className="cursor-pointer rounded-control border border-line bg-paper px-2 py-[3px] text-micro text-ink-2 hover:border-line-strong hover:text-ink"
                >
                  {f.paidOn ? "Marquer impayée" : "Marquer réglée"}
                </button>
              </form>

              <form action={onDelete} className="flex-none">
                <input type="hidden" name="id" value={f.id} />
                <input type="hidden" name="clientId" value={clientId} />
                <button
                  type="submit"
                  title="Supprimer"
                  className="cursor-pointer rounded-control border border-line bg-paper px-[6px] py-[3px] text-micro text-ink-3 hover:border-alert hover:text-alert"
                >
                  ✕
                </button>
              </form>
            </div>
          );
        })
      )}

      <div className="flex flex-col gap-2 border-t border-line px-[14px] py-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
          <input ref={numeroRef} placeholder="N° 2026-042" className={champ} />
          <input ref={libelleRef} placeholder="Prestation août" className={`${champ} sm:col-span-2`} />
          <input ref={montantRef} type="text" inputMode="decimal" placeholder="1 800,00" className={champ} />
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
          <label className="flex flex-col gap-[3px]">
            <span className="text-micro text-ink-3">Émise le</span>
            <input ref={emissionRef} type="date" defaultValue={aujourdhui()} className={champ} />
          </label>
          <label className="flex flex-col gap-[3px]">
            <span className="text-micro text-ink-3">Échéance</span>
            <input ref={echeanceRef} type="date" className={champ} />
          </label>
          <label className="flex flex-col gap-[3px] sm:col-span-2">
            <span className="text-micro text-ink-3">Le PDF</span>
            <input
              ref={fichierRef}
              type="file"
              accept=".pdf,application/pdf"
              disabled={busy}
              onChange={() => setErreur(null)}
              className={`${champ} file:mr-2 file:cursor-pointer file:rounded-control file:border file:border-line file:bg-canvas file:px-2 file:py-[2px] file:text-micro disabled:opacity-60`}
            />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={envoyer}
            disabled={busy}
            className="cursor-pointer rounded-control border border-ink bg-ink px-3 py-[6px] text-small font-medium text-paper hover:bg-black disabled:opacity-60"
          >
            {busy ? "Envoi…" : "Ajouter la facture"}
          </button>
          <span className="text-small text-ink-3">
            Le client la retrouve aussitôt dans son portail, onglet Factures.
          </span>
        </div>
        {erreur ? <p className="text-small text-alert">{erreur}</p> : null}
      </div>
    </Card>
  );
}
