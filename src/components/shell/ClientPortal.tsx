"use client";

import { Eyebrow } from "@/components/ui/primitives";
import { useApp } from "@/state/app";

/**
 * Aperçu du portail client.
 *
 * Le portail montre au client les mêmes chiffres que l'agence, sans aucun
 * rouage interne : ni coûts, ni assignations, ni étapes de production. Tant
 * qu'aucun contenu n'existe, il n'y a rien à lui montrer — et afficher un
 * faux aperçu donnerait une idée trompeuse de ce qu'il verra.
 */
export function ClientPortal() {
  const { portalOpen, setPortalOpen, clients } = useApp();
  if (!portalOpen) return null;

  return (
    <div className="fixed inset-0 z-80 flex flex-col overflow-hidden bg-canvas">
      <div className="flex flex-none items-center justify-between gap-4 bg-night px-6 py-2">
        <span className="flex items-center gap-[10px]">
          <span className="h-2 w-2 rounded-[2px] bg-gold" />
          <Eyebrow className="text-paper">Aperçu du portail client</Eyebrow>
        </span>
        <button
          type="button"
          onClick={() => setPortalOpen(false)}
          className="cursor-pointer rounded-control border border-ink-2 bg-transparent px-[10px] py-[6px] text-small font-medium text-night-ink hover:border-ink-3 hover:text-paper"
        >
          Quitter l&apos;aperçu
        </button>
      </div>

      <div className="flex min-h-0 flex-1 items-start justify-center overflow-auto p-6">
        <div className="mt-10 w-full max-w-[520px] rounded-card border border-line bg-paper p-6">
          <Eyebrow>Portail client</Eyebrow>
          <h2 className="mt-1 text-title font-semibold">
            {clients.length === 0
              ? "Aucun client à qui ouvrir un portail"
              : "Rien à montrer pour l'instant"}
          </h2>
          <p className="mt-2 text-base leading-relaxed text-pretty text-ink-2">
            {clients.length === 0
              ? "Le portail donne à chaque client une page à son nom : ses contenus en attente de validation, son mois en cours, et ce qui arrive. Commence par créer un client."
              : "Le portail affichera les contenus en attente de validation et l'avancement du mois. Il se remplira dès que des contenus seront programmés."}
          </p>
          <p className="mt-3 text-small text-ink-3">
            Les accès s&apos;ouvrent depuis la fiche de chaque client : le contact reçoit un lien,
            choisit son mot de passe, et accède à son espace.
          </p>
        </div>
      </div>
    </div>
  );
}
