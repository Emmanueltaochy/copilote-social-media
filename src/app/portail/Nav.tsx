"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

const ONGLETS: { href: string; label: string; icon: IconName; cle?: "aValider" | "factures" | "projets" }[] = [
  { href: "/portail", label: "Accueil", icon: "home" },
  { href: "/portail/valider", label: "À valider", icon: "check", cle: "aValider" },
  { href: "/portail/medias", label: "Médias", icon: "image" },
  { href: "/portail/documents", label: "Documents", icon: "layers" },
  { href: "/portail/devis", label: "Devis", icon: "message" },
  { href: "/portail/factures", label: "Factures", icon: "euro", cle: "factures" },
  { href: "/portail/projets", label: "Projets", icon: "grid", cle: "projets" },
  { href: "/portail/charte", label: "Charte", icon: "sparkles" },
];

/**
 * La navigation du portail.
 *
 * Elle défile horizontalement sur un téléphone plutôt que de se replier dans
 * un menu : six entrées tiennent en deux gestes de pouce, et un menu caché
 * ferait manquer la pastille des validations en attente — la seule chose que
 * le client doit voir en arrivant.
 *
 * « Projets » disparaît quand il n'y a rien à montrer : un client qui n'achète
 * que du social n'en aura jamais.
 *
 * « Factures », en revanche, reste toujours là, même vide. Tout client finit
 * par être facturé, et un onglet qui n'apparaît qu'au dépôt de la première
 * facture n'apprend à personne que l'endroit existe — ni au client, qui ira
 * fouiller ses mails, ni à nous, qui le croirons absent.
 */
export function NavPortail({
  aValider,
  projets,
  factures,
}: {
  aValider: number;
  projets: number;
  factures: number;
}) {
  const chemin = usePathname();
  // La pastille des factures ne compte que ce qui reste à régler : un client
  // n'a pas à voir « 34 » sur un onglet dont tout est payé depuis trois ans.
  const compte: Record<string, number> = { aValider, projets, factures };

  return (
    // Aucun menu déroulant ici : la barre peut défiler sans rien couper.
    <nav className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0">
      <ul className="flex w-max list-none items-center gap-1 rounded-full border border-line bg-paper p-1 shadow-soft">
        {ONGLETS.filter((o) => o.href !== "/portail/projets" || projets > 0).map((o) => {
          // « Accueil » ne s'allume que sur sa propre adresse : sans quoi il
          // resterait actif partout, puisque tout commence par /portail.
          const actif = o.href === "/portail" ? chemin === "/portail" : chemin.startsWith(o.href);
          const n = o.cle ? (compte[o.cle] ?? 0) : 0;
          return (
            <li key={o.href}>
              <Link
                href={o.href}
                aria-current={actif ? "page" : undefined}
                className={cn(
                  "flex items-center gap-[7px] rounded-full px-[14px] py-[8px] text-base font-medium whitespace-nowrap no-underline hover:no-underline",
                  actif ? "bg-night text-white" : "text-ink-2 hover:bg-mute hover:text-ink",
                )}
              >
                <Icon name={o.icon} size={16} />
                {o.label}
                {n > 0 ? (
                  <span
                    className={cn(
                      "flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-[5px] text-[10.5px] font-bold tabular-nums",
                      o.cle === "aValider" ? "bg-alert text-white" : "bg-accent text-accent-ink",
                    )}
                  >
                    {n > 99 ? "99+" : n}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
