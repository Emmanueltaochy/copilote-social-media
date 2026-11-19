"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

const ONGLETS: { href: string; label: string; icon: IconName }[] = [
  { href: "/videaste", label: "Mes tournages", icon: "camera" },
  { href: "/videaste/compte", label: "Mon compte", icon: "user" },
];

/** La barre du bas du vidéaste : deux entrées, 56 px de haut. */
export function NavVideaste() {
  const chemin = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper pb-[env(safe-area-inset-bottom)]" aria-label="Navigation">
      <ul className="mx-auto flex w-full max-w-[820px] list-none p-0">
        {ONGLETS.map((o) => {
          const actif = o.href === "/videaste" ? chemin === "/videaste" || /^\/videaste\/[0-9a-f-]{36}/.test(chemin) : chemin.startsWith(o.href);
          return (
            <li key={o.href} className="flex-1">
              <Link
                href={o.href}
                aria-current={actif ? "page" : undefined}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-[3px] px-2 text-small font-medium no-underline hover:no-underline",
                  actif ? "text-ink" : "text-ink-3",
                )}
              >
                <Icon name={o.icon} size={20} />
                {o.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
