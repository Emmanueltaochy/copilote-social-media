"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ONGLETS = [
  { href: "/portail", label: "Accueil" },
  { href: "/portail/valider", label: "À valider", cle: "aValider" },
  { href: "/portail/medias", label: "Médias" },
  { href: "/portail/documents", label: "Documents" },
  { href: "/portail/devis", label: "Devis" },
  { href: "/portail/projets", label: "Projets", cle: "projets" },
  { href: "/portail/charte", label: "Charte" },
] as const;

/**
 * La navigation du portail.
 *
 * Elle défile horizontalement sur un téléphone plutôt que de se replier dans
 * un menu : six entrées tiennent en deux gestes de pouce, et un menu caché
 * ferait manquer la pastille des validations en attente — la seule chose que
 * le client doit voir en arrivant.
 *
 * Un onglet sans rien à montrer disparaît : « Projets » n'a pas lieu d'être
 * pour un client qui n'achète que du social.
 */
export function NavPortail({
  accent,
  aValider,
  projets,
}: {
  accent: string;
  aValider: number;
  projets: number;
}) {
  const chemin = usePathname();
  const compte: Record<string, number> = { aValider, projets };

  return (
    <nav className="mx-auto w-full max-w-[1100px] overflow-x-auto px-4 sm:px-6">
      <ul className="flex list-none gap-1 pb-0">
        {ONGLETS.filter((o) => o.href !== "/portail/projets" || projets > 0).map((o) => {
          // « Accueil » ne s'allume que sur sa propre adresse : sans quoi il
          // resterait actif partout, puisque tout commence par /portail.
          const actif = o.href === "/portail" ? chemin === "/portail" : chemin.startsWith(o.href);
          const n = "cle" in o ? (compte[o.cle] ?? 0) : 0;
          return (
            <li key={o.href}>
              <Link
                href={o.href}
                className="flex items-center gap-[6px] whitespace-nowrap border-b-2 px-3 py-[10px] text-base no-underline hover:no-underline"
                style={{
                  borderBottomColor: actif ? accent : "transparent",
                  color: actif ? "#FFF" : "rgba(255,255,255,0.62)",
                  fontWeight: actif ? 500 : 400,
                }}
              >
                {o.label}
                {n > 0 ? (
                  <span
                    className="rounded-full px-[6px] py-[1px] text-micro font-medium tabular-nums text-black"
                    style={{ background: accent }}
                  >
                    {n}
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
