"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { ClientChip } from "@/components/home/bits";
import { useApp } from "@/state/app";
import { entrerApercu } from "@/app/portail/actions-apercu";

/**
 * « Voir comme mon client ».
 *
 * On choisit un client, et l'on ouvre son vrai portail — mêmes écrans, mêmes
 * données, sa vidéo d'accueil et ses chiffres — en lecture seule : le
 * portail affiche un bandeau d'aperçu, et toutes ses actions (valider,
 * demander une modification, devis, brief, dépôt de fichiers) sont refusées
 * côté serveur pour un compte interne.
 */
export function ClientPortal() {
  const { portalOpen, setPortalOpen, clients } = useApp();
  const [q, setQ] = useState("");
  if (!portalOpen) return null;

  const list = clients.filter((c) => !q || `${c.name} ${c.shortName}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div
      className="fixed inset-0 z-80 flex items-start justify-center bg-black/40 p-4 pt-[10vh] backdrop-blur-sm"
      onClick={() => setPortalOpen(false)}
    >
      <div
        role="dialog"
        aria-label="Voir le portail comme un client"
        className="flex max-h-[75vh] w-full max-w-[480px] flex-col overflow-hidden rounded-card border border-line bg-paper shadow-soft"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 border-b border-line p-5">
          <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-night text-white">
            <Icon name="eye" size={18} />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-lead font-semibold text-ink">Voir comme mon client</span>
            <span className="text-small text-ink-3">
              Son vrai portail, en lecture seule : rien de ce que vous touchez n&apos;est envoyé.
            </span>
          </span>
          <button
            type="button"
            onClick={() => setPortalOpen(false)}
            aria-label="Fermer"
            className="flex h-9 w-9 flex-none cursor-pointer items-center justify-center rounded-full border border-line bg-paper text-ink hover:border-line-strong"
          >
            <Icon name="close" size={16} />
          </button>
        </div>

        {clients.length > 6 ? (
          <div className="border-b border-line px-5 py-3">
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Chercher un client…"
              className="w-full rounded-full border border-line bg-paper px-4 py-2 text-base text-ink outline-none focus:border-gold"
            />
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-auto p-2">
          {clients.length === 0 ? (
            <p className="p-4 text-base text-ink-3">Aucun client actif pour l&apos;instant.</p>
          ) : null}
          {list.map((c) => (
            <form key={c.id} action={entrerApercu}>
              <input type="hidden" name="clientId" value={c.id} />
              <button
                type="submit"
                className="flex w-full cursor-pointer items-center gap-3 rounded-[14px] border-none bg-transparent px-3 py-[10px] text-left text-ink hover:bg-mute"
              >
                <ClientChip name={c.shortName} size={32} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="clip text-base font-semibold">{c.name}</span>
                  <span className="text-small text-ink-3">Ouvrir son portail</span>
                </span>
                <Icon name="arrowUpRight" size={16} className="flex-none text-ink-3" />
              </button>
            </form>
          ))}
        </div>
      </div>
    </div>
  );
}
