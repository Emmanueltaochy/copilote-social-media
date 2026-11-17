import Link from "next/link";
import { cn } from "@/lib/cn";

export type Onglet = { href: string; label: string; actif: boolean; compteur?: number };

/**
 * Des onglets qui sont des liens : chacun a son adresse (on peut le partager,
 * le retrouver avec « Précédent »), et la page n'a rien à cacher en
 * JavaScript. Cibles de 44 px, défilement horizontal sur téléphone.
 */
export function Onglets({ items, label, className }: { items: Onglet[]; label: string; className?: string }) {
  return (
    <nav aria-label={label} className={cn("mx-4 mb-4 flex flex-none lg:mx-7", className)}>
      <div className="flex max-w-full items-center gap-1 overflow-x-auto rounded-full border border-line bg-paper p-1 shadow-soft [scrollbar-width:none]">
        {items.map((o) => (
          <Link
            key={o.href}
            href={o.href}
            aria-current={o.actif ? "page" : undefined}
            className={cn(
              "flex min-h-10 flex-none items-center gap-2 rounded-full px-4 text-base font-medium whitespace-nowrap no-underline hover:no-underline",
              o.actif ? "bg-ink text-paper" : "text-ink-2 hover:bg-mute hover:text-ink",
            )}
          >
            {o.label}
            {o.compteur ? (
              <span
                className={cn(
                  "rounded-full px-[7px] text-small tabular-nums",
                  o.actif ? "bg-paper/15 text-paper" : "bg-mute text-ink-3",
                )}
              >
                {o.compteur}
              </span>
            ) : null}
          </Link>
        ))}
      </div>
    </nav>
  );
}
