"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { NAV } from "@/data/nav";
import { ALL_CLIENTS, useApp } from "@/state/app";
import { Avatar, Dot } from "@/components/ui/primitives";
import { logout } from "@/app/connexion/actions";
import { Bell, type Notice } from "./Bell";

const ROLE_LABEL: Record<string, string> = {
  direction: "Direction",
  equipe: "Équipe",
  client: "Client",
};

export function Sidebar({
  notices,
  unreadCount,
}: {
  notices: Notice[];
  unreadCount: number;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const params = useSearchParams();
  const { scope, setScope, setPortalOpen, clients, user, navOpen, setNavOpen } = useApp();
  const [switcherOpen, setSwitcherOpen] = useState(false);

  const nav = NAV.filter((item) => !item.directionOnly || user.role === "direction");

  // La bibliothèque filtre pour de vrai, côté serveur, et son filtre vit dans
  // l'URL. Sur cet écran c'est donc l'URL qui fait foi : sans ça le sélecteur
  // afficherait un client pendant que la page en montre un autre.
  const parLURL = pathname === "/assets";
  const affiché = parLURL
    ? (clients.find((c) => c.id === params.get("client"))?.name ?? ALL_CLIENTS)
    : scope;

  function choisir(client: { id: string; name: string } | null) {
    setScope(client?.name ?? ALL_CLIENTS);
    setSwitcherOpen(false);
    if (parLURL) router.push(client ? `/assets?client=${client.id}` : "/assets");
  }

  return (
    <>
      {/* Le voile ne sert pas qu'à assombrir : sur un téléphone, refermer le
          menu en touchant à côté est le geste réflexe, et sans lui il faut
          viser une petite croix. */}
      {navOpen ? (
        <button
          type="button"
          aria-label="Fermer le menu"
          onClick={() => setNavOpen(false)}
          className="fixed inset-0 z-40 cursor-default border-none bg-[rgba(18,18,18,0.45)] lg:hidden"
        />
      ) : null}

      <aside
        className={cn(
          // Sur mobile la barre glisse par-dessus l'écran plutôt que de le
          // partager : 232 px pris sur 390 laisseraient au contenu une colonne
          // où plus rien n'est lisible.
          "fixed inset-y-0 left-0 z-50 flex w-[232px] flex-none flex-col gap-3 overflow-hidden bg-night p-[10px] pt-3 transition-transform duration-200",
          "lg:static lg:z-auto lg:translate-x-0",
          navOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between px-[6px] py-1">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-[2px] bg-gold" />
            <span className="eyebrow text-small text-paper">Taochy Pilot</span>
          </div>
          <span className="flex items-center gap-1">
            {/* La cloche est en haut de la barre, où le regard passe déjà en
                arrivant : reléguée en bas, elle ne serait vue qu'en partant.
                Sur mobile elle vit dans la barre du haut, toujours visible. */}
            <span className="hidden lg:flex">
              <Bell notices={notices} unreadCount={unreadCount} />
            </span>
            <button
              type="button"
              onClick={() => setNavOpen(false)}
              aria-label="Fermer le menu"
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-control border border-transparent bg-transparent text-night-ink hover:border-night-border hover:text-paper lg:hidden"
            >
              ✕
            </button>
          </span>
        </div>

      {/* Le filtre client suit l'utilisateur d'un écran à l'autre. */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setSwitcherOpen((o) => !o)}
          className="flex w-full cursor-pointer flex-col gap-[2px] rounded-control border border-night-border bg-night-2 px-[10px] py-2 text-left hover:border-ink-2"
        >
          <span className="eyebrow text-ink-3">Client</span>
          <span className="flex items-center justify-between gap-2">
            <span className="clip text-base font-medium text-paper">{affiché}</span>
            <span className="text-micro text-ink-3">{clients.length || ""}</span>
          </span>
        </button>

        {switcherOpen ? (
          <div className="absolute top-[calc(100%+6px)] right-[-56px] left-0 z-40 max-h-[340px] overflow-auto rounded-card border border-line-strong bg-paper p-[6px] shadow-[0_8px_24px_rgba(18,18,18,0.12)]">
            <button
              type="button"
              onClick={() => choisir(null)}
              className="w-full cursor-pointer rounded-control bg-gold-wash px-[10px] py-2 text-left text-base font-medium text-ink"
            >
              {ALL_CLIENTS}
            </button>
            <div className="mx-1 my-[6px] h-px bg-line" />
            {clients.length === 0 ? (
              <p className="px-[10px] py-2 text-small text-ink-3">
                Aucun client pour l&apos;instant.
              </p>
            ) : (
              clients.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => choisir(c)}
                  className="flex w-full cursor-pointer items-center gap-2 rounded-control px-[10px] py-[7px] text-left text-base text-ink hover:bg-canvas"
                >
                  <Dot tone={c.tone} />
                  <span className="clip flex-1">{c.name}</span>
                  <span className="text-small text-ink-3 tabular-nums">
                    {c.done}/{c.target}
                  </span>
                </button>
              ))
            )}
          </div>
        ) : null}
      </div>

      <nav className="flex flex-col gap-px overflow-auto">
        {nav.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setNavOpen(false)}
              className={cn(
                "relative flex items-center justify-between gap-2 rounded-control px-[10px] py-2 no-underline hover:bg-night-2 hover:no-underline",
                active ? "bg-night-2" : "bg-transparent",
              )}
            >
              <span
                className={cn(
                  "absolute top-2 bottom-2 left-0 w-[2px] rounded-full",
                  active ? "bg-gold" : "bg-transparent",
                )}
              />
              <span
                className={cn("text-base", active ? "font-medium text-paper" : "text-night-ink")}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-px border-t border-night-line pt-2">
        <button
          type="button"
          onClick={() => {
            setPortalOpen(true);
            setNavOpen(false);
          }}
          className="flex w-full cursor-pointer items-center justify-between rounded-control px-[10px] py-2 text-left hover:bg-night-2"
        >
          <span className="text-base text-night-ink">Portail client</span>
          <span className="eyebrow text-ink-2">Aperçu</span>
        </button>
        {/* Son propre nom mène à son compte : c'est là qu'on va le chercher,
            et un item de menu de plus pour trois réglages encombrerait la
            navigation de tous les jours. */}
        <Link
          href="/compte"
          onClick={() => setNavOpen(false)}
          className={cn(
            "flex items-center gap-2 rounded-control px-[10px] py-2 no-underline hover:bg-night-2 hover:no-underline",
            pathname === "/compte" ? "bg-night-2" : "",
          )}
        >
          <Avatar initials={user.initials} src={user.avatar} size={26} />
          {/* Le rôle passe sous le nom : côte à côte, les deux ne tiennent pas
              dans la largeur de la barre et c'est le nom qui se fait couper. */}
          <span className="flex min-w-0 flex-col">
            <span className="clip text-base text-night-ink">{user.name}</span>
            <span className="eyebrow text-ink-3">{ROLE_LABEL[user.role]}</span>
          </span>
        </Link>
        <form action={logout}>
          <button
            type="submit"
            className="w-full cursor-pointer rounded-control px-[10px] py-2 text-left text-base text-ink-2 hover:bg-night-2 hover:text-night-ink"
          >
            Se déconnecter
          </button>
        </form>
        </div>
      </aside>
    </>
  );
}
