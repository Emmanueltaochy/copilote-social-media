import Link from "next/link";
import { requireStaff } from "@/lib/auth";

/**
 * La version terrain.
 *
 * Un écran de téléphone, tenu d'une main, souvent au soleil et parfois avec
 * une seule barre de réseau. Rien de ce qui sert au bureau n'y a sa place :
 * ni rentabilité, ni campagnes, ni rapports. Ce qui reste est ce dont on a
 * besoin debout — le tournage du jour, sa shotlist, son matériel, ses
 * autorisations, et ce qui doit partir aujourd'hui.
 *
 * La barre de navigation est en bas, à portée de pouce : en haut, elle
 * demande de changer la prise en main du téléphone à chaque geste.
 */
const ONGLETS = [
  { href: "/terrain", label: "Aujourd'hui", icon: "M3 9.5 10 4l7 5.5V16a1 1 0 0 1-1 1h-3.5v-4h-5v4H4a1 1 0 0 1-1-1V9.5Z" },
  { href: "/terrain/tournages", label: "Tournages", icon: "M3 6.5A1.5 1.5 0 0 1 4.5 5h7A1.5 1.5 0 0 1 13 6.5v7A1.5 1.5 0 0 1 11.5 15h-7A1.5 1.5 0 0 1 3 13.5v-7Zm11 2.2 3-1.8v6.2l-3-1.8V8.7Z" },
  { href: "/terrain/publier", label: "À publier", icon: "M10 3v10m0-10L6.5 6.5M10 3l3.5 3.5M4 15h12" },
  { href: "/terrain/medias", label: "Médias", icon: "M3 5.5A1.5 1.5 0 0 1 4.5 4h11A1.5 1.5 0 0 1 17 5.5v9a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 14.5v-9Zm2 7.5 3-3.5 2.5 3L13 9l2 4H5Z" },
];

export default async function TerrainLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStaff();

  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 bg-night px-4 py-3">
        <span className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-[2px] bg-gold" />
          <span className="eyebrow text-paper">Terrain</span>
        </span>
        <span className="flex items-center gap-3">
          <span className="text-small text-night-ink">{user.name}</span>
          {/* Retour au bureau : la version complète reste à un geste, sans
              avoir à retaper l'adresse. */}
          <Link
            href="/"
            className="rounded-control border border-night-border px-2 py-1 text-micro text-night-ink no-underline hover:text-paper hover:no-underline"
          >
            Bureau
          </Link>
        </span>
      </header>

      {/* La marge basse laisse la place à la barre : sans elle, le dernier
          élément de la liste reste sous les onglets, inatteignable. */}
      <main className="flex-1 pb-[76px]">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-paper">
        {ONGLETS.map((o) => (
          <Link
            key={o.href}
            href={o.href}
            className="flex flex-1 flex-col items-center gap-[3px] px-1 py-[10px] text-ink-2 no-underline hover:bg-canvas hover:no-underline"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path
                d={o.icon}
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="text-[11px] leading-none font-medium">{o.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
