"use client";

import { useApp } from "@/state/app";
import { Bell, type Notice } from "./Bell";

/**
 * La barre du haut, sur mobile seulement.
 *
 * Sur un écran de bureau, la barre latérale tient à côté du contenu et porte
 * elle-même la cloche. Sur un téléphone elle glisse par-dessus l'écran : il
 * faut donc un endroit permanent pour l'ouvrir, et pour voir arriver les
 * notifications sans avoir à ouvrir un menu d'abord.
 */
export function TopBar({
  notices,
  unreadCount,
}: {
  notices: Notice[];
  unreadCount: number;
}) {
  const { setNavOpen, scope } = useApp();

  return (
    <header className="flex flex-none items-center gap-2 bg-night px-3 py-2 lg:hidden">
      <button
        type="button"
        onClick={() => setNavOpen(true)}
        aria-label="Ouvrir le menu"
        className="flex h-9 w-9 flex-none cursor-pointer items-center justify-center rounded-control border border-night-border bg-night-2 text-paper"
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <path
            d="M3 5h12M3 9h12M3 13h12"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </button>

      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-center gap-2">
          <span className="h-2 w-2 flex-none rounded-[2px] bg-gold" />
          <span className="eyebrow text-small text-paper">Taochy Pilot</span>
        </span>
        {/* Le client filtré est rappelé ici : sur mobile le sélecteur est
            enfermé dans le tiroir, et un filtre actif qu'on ne voit plus est
            un filtre qu'on oublie — puis des chiffres qu'on croit faux. */}
        <span className="clip text-micro text-ink-3">{scope}</span>
      </span>

      <Bell notices={notices} unreadCount={unreadCount} />
    </header>
  );
}
