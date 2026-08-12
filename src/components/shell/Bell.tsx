"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { markAllRead, markRead } from "@/app/(agence)/notifications/actions";

export type Notice = {
  id: string;
  title: string;
  body: string | null;
  href: string | null;
  createdAt: Date;
  readAt: Date | null;
};

/** « il y a 3 min », « hier » — un horaire exact n'apprend rien ici. */
function ago(date: Date): string {
  const minutes = Math.round((Date.now() - new Date(date).getTime()) / 60000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.round(hours / 24);
  if (days === 1) return "hier";
  if (days < 7) return `il y a ${days} jours`;
  return new Date(date).toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
}

/**
 * La cloche.
 *
 * Elle ne montre que ce qui n'a pas été vu, et le compte s'arrête à neuf : au
 * delà, le nombre exact ne change plus rien à ce qu'on va faire.
 *
 * Le panneau se ferme au clic extérieur et à la touche d'échappement — sans
 * quoi il faut viser à nouveau la cloche, ce qui est le geste le moins naturel
 * quand on veut simplement revenir à son écran.
 */
export function Bell({ notices, unreadCount }: { notices: Notice[]; unreadCount: number }) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState({ top: 0, left: 0 });
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  // Le panneau est monté à la racine du document, hors de la barre latérale :
  // celle-ci masque ce qui dépasse d'elle, et sur mobile elle se translate, ce
  // qui suffirait à faire peindre le panneau sous le contenu principal. Il ne
  // fait donc plus partie de l'arbre de la cloche, et le clic extérieur doit le
  // reconnaître explicitement.
  const panneauRef = useRef<HTMLDivElement>(null);

  // Le panneau est positionné par rapport à la fenêtre, et non à la cloche :
  // la barre latérale masque ce qui déborde d'elle, et un panneau plus large
  // qu'elle s'y trouverait coupé. On mesure donc le bouton pour poser le
  // panneau juste à côté, dans l'espace principal.
  useEffect(() => {
    if (!open) return;
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) setAnchor({ top: rect.bottom + 8, left: rect.left });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      const cible = e.target as Node;
      const dedans =
        ref.current?.contains(cible) || panneauRef.current?.contains(cible);
      if (!dedans) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={
          unreadCount > 0 ? `Notifications, ${unreadCount} non lues` : "Notifications"
        }
        className="relative flex h-8 w-8 cursor-pointer items-center justify-center rounded-control border border-transparent bg-transparent text-night-ink hover:border-night-border hover:text-paper"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="M8 2a4 4 0 0 0-4 4v2.5L2.8 10.6a.5.5 0 0 0 .43.75h9.54a.5.5 0 0 0 .43-.75L12 8.5V6a4 4 0 0 0-4-4Z"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
          <path d="M6.5 13a1.6 1.6 0 0 0 3 0" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
        {unreadCount > 0 ? (
          <span className="absolute -top-[2px] -right-[2px] flex h-4 min-w-4 items-center justify-center rounded-full bg-gold px-[3px] text-[10px] font-semibold text-night tabular-nums">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open
        ? createPortal(
            <div
              ref={panneauRef}
              style={{ top: anchor.top, left: anchor.left }}
              className="fixed z-[60] flex w-[340px] max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-card border border-line bg-paper shadow-[0_8px_24px_rgba(0,0,0,0.12)]"
            >
          <div className="flex items-center justify-between gap-3 border-b border-line px-3 py-2">
            <span className="eyebrow text-ink-3">Notifications</span>
            {unreadCount > 0 ? (
              <form action={markAllRead}>
                <button
                  type="submit"
                  className="cursor-pointer border-none bg-transparent p-0 text-small text-ink-2 hover:text-ink"
                >
                  Tout marquer lu
                </button>
              </form>
            ) : null}
          </div>

          <div className="max-h-[380px] overflow-auto">
            {notices.length === 0 ? (
              <p className="px-3 py-4 text-base text-ink-2">
                Rien à signaler. Vous serez prévenu quand un contenu vous est assigné, quand un
                client répond, et quand une publication part.
              </p>
            ) : (
              notices.map((n) => (
                <div
                  key={n.id}
                  className={`flex flex-col gap-1 border-b border-line px-3 py-[10px] ${
                    n.readAt ? "" : "bg-gold-wash"
                  }`}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    {n.href ? (
                      <Link
                        href={n.href}
                        onClick={() => setOpen(false)}
                        className="clip min-w-0 flex-1 text-base font-medium text-ink no-underline hover:underline"
                      >
                        {n.title}
                      </Link>
                    ) : (
                      <span className="clip min-w-0 flex-1 text-base font-medium">{n.title}</span>
                    )}
                    <span className="flex-none text-micro text-ink-3">{ago(n.createdAt)}</span>
                  </span>

                  {n.body ? (
                    <span className="line-clamp-2 text-small text-ink-2">{n.body}</span>
                  ) : null}

                  {!n.readAt ? (
                    <form action={markRead}>
                      <input type="hidden" name="id" value={n.id} />
                      <button
                        type="submit"
                        className="cursor-pointer border-none bg-transparent p-0 text-micro text-ink-3 hover:text-ink"
                      >
                        Marquer comme lu
                      </button>
                    </form>
                  ) : null}
                </div>
              ))
            )}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
