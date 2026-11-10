"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { NAV_MAIN, NAV_MORE, type NavItem } from "@/data/nav";
import { NAV_WEB_MAIN, NAV_WEB_MORE } from "@/data/nav-web";
import { changerDePole } from "@/app/(agence)/pole-actions";
import { logout } from "@/app/connexion/actions";
import { ALL_CLIENTS, useApp } from "@/state/app";
import { Avatar, Dot } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/Icon";
import { Bell, type Notice } from "./Bell";
import { ThemeButton, ThemeChoices } from "./ThemeToggle";

export type ShellCounts = {
  validation: number;
  publier: number;
  devis: number;
};

const ROLE_LABEL: Record<string, string> = {
  direction: "Direction",
  equipe: "Équipe",
  client: "Client",
};

/* ------------------------------------------------------------- utilitaires -- */

function useMenus(counts: ShellCounts) {
  const { user } = useApp();
  const allowed = (i: NavItem) => !i.directionOnly || user.role === "direction";
  const web = user.pole === "web";
  return {
    main: (web ? NAV_WEB_MAIN : NAV_MAIN).filter(allowed),
    more: (web ? NAV_WEB_MORE : NAV_MORE).filter(allowed),
    badge: (i: NavItem) => (i.badge ? counts[i.badge] : 0),
  };
}

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

/** Ferme un menu au clic extérieur et à Échap. */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);
  return ref;
}

function Badge({
  n,
  tone = "accent",
}: {
  n: number;
  tone?: "accent" | "alert";
}) {
  if (!n) return null;
  return (
    <span
      className={cn(
        "flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-[5px] text-[10.5px] font-bold tabular-nums",
        tone === "alert" ? "bg-alert text-white" : "bg-accent text-accent-ink",
      )}
    >
      {n > 99 ? "99+" : n}
    </span>
  );
}

const roundBtn =
  "flex h-10 w-10 flex-none cursor-pointer items-center justify-center rounded-full border border-line bg-paper text-ink shadow-soft hover:border-line-strong";

/* -------------------------------------------------------------- en-tête ---- */

function Logo() {
  return (
    <Link
      href="/"
      className="flex flex-none items-center gap-[10px] text-ink no-underline hover:no-underline"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-[13px] bg-night text-white">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M4 15c2.5-6 5-6 7.5 0S16.5 21 20 9"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          <circle cx="20" cy="7" r="1.6" fill="#cead6f" />
        </svg>
      </span>
      <span className="text-[19px] font-bold tracking-[-0.02em]">
        taochy<span className="text-ink-3 font-semibold"> pilot</span>
      </span>
    </Link>
  );
}

function MoreMenu({
  items,
  badge,
}: {
  items: NavItem[];
  badge: (i: NavItem) => number;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  const active = items.some((i) => isActive(pathname, i.href));
  const total = items.reduce((s, i) => s + badge(i), 0);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={cn(
          "flex cursor-pointer items-center gap-1 rounded-full border-none px-4 py-[9px] text-base font-medium",
          active
            ? "bg-night text-white"
            : "bg-transparent text-ink-2 hover:text-ink",
        )}
      >
        Plus <Badge n={total} /> <Icon name="chevronDown" size={15} />
      </button>
      {open ? (
        <div className="absolute top-[calc(100%+10px)] right-0 z-50 grid w-[520px] max-w-[calc(100vw-32px)] grid-cols-2 gap-1 rounded-card border border-line bg-paper p-2 shadow-soft">
          {items.map((i) => (
            <Link
              key={i.href}
              href={i.href}
              onClick={() => setOpen(false)}
              className={cn(
                "flex items-start gap-3 rounded-[14px] px-3 py-[10px] text-ink no-underline hover:bg-mute hover:no-underline",
                isActive(pathname, i.href) && "bg-mute",
              )}
            >
              <span className="mt-[1px] flex h-8 w-8 flex-none items-center justify-center rounded-[10px] bg-mute text-ink-2">
                <Icon name={i.icon ?? "grid"} size={16} />
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="flex items-center gap-2 text-base font-semibold">
                  {i.label} <Badge n={badge(i)} />
                </span>
                {i.hint ? (
                  <span className="text-small text-ink-3">{i.hint}</span>
                ) : null}
              </span>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ScopePicker() {
  const pathname = usePathname();
  const router = useRouter();
  const params = useSearchParams();
  const { scope, setScope, clients } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  // Ces écrans filtrent côté serveur : l'adresse (?client=) fait foi.
  const parLURL = ["/", "/assets", "/statistiques", "/calendrier", "/boite", "/veille"].includes(pathname);
  const affiché = parLURL
    ? (clients.find((c) => c.id === params.get("client"))?.name ?? ALL_CLIENTS)
    : scope;

  function choisir(client: { id: string; name: string } | null) {
    setScope(client?.name ?? ALL_CLIENTS);
    setOpen(false);
    if (parLURL) {
      const q = new URLSearchParams(params.toString());
      if (client) q.set("client", client.id);
      else q.delete("client");
      const qs = q.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-10 max-w-[220px] cursor-pointer items-center gap-2 rounded-full border border-line bg-paper py-1 pr-3 pl-1 text-base font-medium text-ink shadow-soft hover:border-line-strong"
      >
        <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-night text-white">
          <Icon name="layers" size={15} />
        </span>
        <span className="clip">{affiché}</span>
        <Icon name="chevronDown" size={15} className="flex-none text-ink-3" />
      </button>
      {open ? (
        <div className="absolute top-[calc(100%+8px)] right-0 z-50 max-h-[380px] w-[280px] overflow-auto rounded-card border border-line bg-paper p-2 shadow-soft">
          <button
            type="button"
            onClick={() => choisir(null)}
            className={cn(
              "w-full cursor-pointer rounded-[12px] border-none px-3 py-2 text-left text-base font-semibold",
              affiché === ALL_CLIENTS
                ? "bg-night text-white"
                : "bg-transparent text-ink hover:bg-mute",
            )}
          >
            {ALL_CLIENTS}
          </button>
          <div className="mx-2 my-[6px] h-px bg-line" />
          {clients.length === 0 ? (
            <p className="px-3 py-2 text-small text-ink-3">
              Aucun client pour l&apos;instant.
            </p>
          ) : (
            clients.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => choisir(c)}
                className={cn(
                  "flex w-full cursor-pointer items-center gap-2 rounded-[12px] border-none px-3 py-[8px] text-left text-base text-ink",
                  affiché === c.name
                    ? "bg-mute font-semibold"
                    : "bg-transparent hover:bg-mute",
                )}
              >
                <Dot tone={c.tone} size={8} />
                <span className="clip flex-1">{c.name}</span>
                {c.target ? (
                  <span className="text-small text-ink-3 tabular-nums">
                    {c.done}/{c.target}
                  </span>
                ) : null}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

function AccountMenu() {
  const { user, setPortalOpen } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Mon compte"
        className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border-2 border-paper bg-paper p-0 shadow-soft"
      >
        <Avatar initials={user.initials} src={user.avatar} size={36} />
      </button>
      {open ? (
        <div className="absolute top-[calc(100%+8px)] right-0 z-50 w-[270px] rounded-card border border-line bg-paper p-2 shadow-soft">
          <div className="flex items-center gap-3 px-2 py-2">
            <Avatar initials={user.initials} src={user.avatar} size={36} />
            <span className="flex min-w-0 flex-col">
              <span className="clip text-base font-semibold text-ink">
                {user.name}
              </span>
              <span className="text-small text-ink-3">
                {ROLE_LABEL[user.role]}
              </span>
            </span>
          </div>
          {user.departments.length > 1 ? (
            <form
              action={changerDePole}
              className="mx-1 mb-2 grid grid-cols-2 gap-1 rounded-control bg-mute p-1"
            >
              {(["social", "web"] as const).map((p) => (
                <button
                  key={p}
                  type="submit"
                  name="pole"
                  value={p}
                  aria-current={user.pole === p}
                  className={cn(
                    "cursor-pointer rounded-[9px] border-none px-2 py-[7px] text-small font-semibold",
                    user.pole === p
                      ? "bg-paper text-ink shadow-soft"
                      : "bg-transparent text-ink-2 hover:text-ink",
                  )}
                >
                  {p === "social" ? "Pôle social" : "Pôle web"}
                </button>
              ))}
            </form>
          ) : null}
          <div className="mx-1 mb-2">
            <ThemeChoices />
          </div>
          <Link
            href="/compte"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 rounded-[12px] px-3 py-[9px] text-base text-ink no-underline hover:bg-mute hover:no-underline"
          >
            <Icon name="user" size={16} /> Mon compte
          </Link>
          <button
            type="button"
            onClick={() => {
              setPortalOpen(true);
              setOpen(false);
            }}
            className="flex w-full cursor-pointer items-center gap-3 rounded-[12px] border-none bg-transparent px-3 py-[9px] text-left text-base text-ink hover:bg-mute"
          >
            <Icon name="eye" size={16} /> Voir comme mon client
          </button>
          <form action={logout}>
            <button
              type="submit"
              className="flex w-full cursor-pointer items-center gap-3 rounded-[12px] border-none bg-transparent px-3 py-[9px] text-left text-base text-ink-2 hover:bg-mute hover:text-ink"
            >
              <Icon name="logout" size={16} /> Se déconnecter
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------ recherche ---- */

function CommandPalette({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { clients, user, setScope } = useApp();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const items = useMemo(() => {
    const allowed = (i: NavItem) =>
      !i.directionOnly || user.role === "direction";
    const pages = (
      user.pole === "web"
        ? [...NAV_WEB_MAIN, ...NAV_WEB_MORE]
        : [...NAV_MAIN, ...NAV_MORE]
    )
      .filter(allowed)
      .map((i) => ({
        key: "p" + i.href,
        label: i.label,
        sub: i.hint ?? "Écran",
        icon: i.icon ?? "grid",
        go: () => router.push(i.href),
      }));
    const actions = [
      {
        key: "a-new",
        label: "Nouveau contenu",
        sub: "Créer un contenu",
        icon: "plus" as const,
        go: () => router.push("/contenu"),
      },
      {
        key: "a-compte",
        label: "Mon compte",
        sub: "Profil et mot de passe",
        icon: "user" as const,
        go: () => router.push("/compte"),
      },
    ];
    const cl = clients.map((c) => ({
      key: "c" + c.id,
      label: c.name,
      sub: "Fiche client",
      icon: "users" as const,
      go: () => {
        setScope(c.name);
        router.push(`/clients/${c.id}`);
      },
    }));
    const all = [...actions, ...pages, ...cl];
    const n = q
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "");
    if (!n) return all;
    return all.filter((i) =>
      (i.label + " " + i.sub)
        .toLowerCase()
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .includes(n),
    );
  }, [q, clients, user, router, setScope]);

  return (
    <div
      className="fixed inset-0 z-[90] flex items-start justify-center bg-[rgba(10,10,12,0.45)] p-4 pt-[12vh] backdrop-blur-[2px]"
      onMouseDown={onClose}
    >
      <div
        className="w-full max-w-[560px] overflow-hidden rounded-card border border-line bg-paper shadow-soft"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Icon name="search" className="text-ink-3" />
          <input
            ref={inputRef}
            autoFocus
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setSel(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setSel((s) => Math.min(s + 1, items.length - 1));
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setSel((s) => Math.max(s - 1, 0));
              }
              if (e.key === "Enter" && items[sel]) {
                items[sel].go();
                onClose();
              }
            }}
            placeholder="Aller à un écran, un client…"
            className="h-14 flex-1 border-none bg-transparent text-lead text-ink outline-none placeholder:text-ink-3"
          />
          <kbd className="rounded-[6px] border border-line px-[6px] py-[2px] text-micro text-ink-3">
            Échap
          </kbd>
        </div>
        <div className="max-h-[50vh] overflow-auto p-2">
          {items.length === 0 ? (
            <p className="px-3 py-6 text-center text-base text-ink-3">
              Rien ne correspond.
            </p>
          ) : (
            items.map((i, k) => (
              <button
                key={i.key}
                type="button"
                onMouseEnter={() => setSel(k)}
                onClick={() => {
                  i.go();
                  onClose();
                }}
                className={cn(
                  "flex w-full cursor-pointer items-center gap-3 rounded-[12px] border-none px-3 py-[9px] text-left",
                  k === sel ? "bg-mute" : "bg-transparent",
                )}
              >
                <span className="flex h-8 w-8 flex-none items-center justify-center rounded-[10px] bg-mute text-ink-2">
                  <Icon name={i.icon} size={16} />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="clip text-base font-semibold text-ink">
                    {i.label}
                  </span>
                  <span className="clip text-small text-ink-3">{i.sub}</span>
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- mobile ----- */

function MobileDrawer({ counts }: { counts: ShellCounts }) {
  const { navOpen, setNavOpen } = useApp();
  const pathname = usePathname();
  const { main, more, badge } = useMenus(counts);
  if (!navOpen) return null;
  const row = (i: NavItem) => (
    <Link
      key={i.href}
      href={i.href}
      onClick={() => setNavOpen(false)}
      className={cn(
        "flex items-center gap-3 rounded-[14px] px-3 py-[11px] text-lead text-ink no-underline hover:no-underline",
        isActive(pathname, i.href) ? "bg-night text-white" : "hover:bg-mute",
      )}
    >
      <Icon name={i.icon ?? "grid"} size={18} />
      <span className="flex-1">{i.label}</span>
      <Badge n={badge(i)} />
    </Link>
  );
  return (
    <div className="fixed inset-0 z-[80] lg:hidden">
      <button
        type="button"
        aria-label="Fermer le menu"
        onClick={() => setNavOpen(false)}
        className="absolute inset-0 cursor-default border-none bg-[rgba(10,10,12,0.45)]"
      />
      <div className="absolute inset-y-0 left-0 flex w-[300px] max-w-[86vw] flex-col gap-3 overflow-auto bg-paper p-4">
        <div className="flex items-center justify-between">
          <Logo />
          <button
            type="button"
            onClick={() => setNavOpen(false)}
            aria-label="Fermer"
            className={roundBtn}
          >
            <Icon name="close" />
          </button>
        </div>
        <nav className="flex flex-col gap-1">{main.map(row)}</nav>
        <div className="h-px bg-line" />
        <nav className="flex flex-col gap-1">{more.map(row)}</nav>
        <div className="mt-auto pt-2">
          <ThemeChoices />
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- coquille -- */

export function AppShell({
  children,
  notices,
  unreadCount,
  counts,
}: {
  children: ReactNode;
  notices: Notice[];
  unreadCount: number;
  counts: ShellCounts;
}) {
  const pathname = usePathname();
  const { setNavOpen } = useApp();
  const { main, more, badge } = useMenus(counts);
  const [search, setSearch] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearch(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const railBtn =
    "flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border-none bg-transparent text-night-ink no-underline hover:bg-night-2 hover:text-white hover:no-underline";

  return (
    <div className="flex h-dvh flex-col overflow-hidden text-ink">
      {/* En-tête : logo, navigation en pilules, client, cloche, compte. */}
      <header className="flex flex-none items-center gap-3 px-4 pt-3 pb-2 lg:gap-5 lg:px-7 lg:pt-5 lg:pb-3">
        <button
          type="button"
          onClick={() => setNavOpen(true)}
          aria-label="Ouvrir le menu"
          className={cn(roundBtn, "lg:hidden")}
        >
          <Icon name="menu" />
        </button>
        <Logo />
        {/* Le menu « Plus » reste hors de la zone qui défile : un parent en
            overflow coupe tout ce qui en dépasse, menu déroulant compris. */}
        <div className="mx-auto hidden min-w-0 items-center gap-1 lg:flex">
          <nav className="flex min-w-0 items-center gap-1 overflow-x-auto rounded-full [scrollbar-width:none]">
            {main.map((i) => {
              const active = isActive(pathname, i.href);
              return (
                <Link
                  key={i.href}
                  href={i.href}
                  className={cn(
                    "flex flex-none items-center gap-2 rounded-full px-[9px] py-[9px] text-base font-medium no-underline hover:no-underline 2xl:px-4",
                    active
                      ? "bg-night text-white"
                      : "text-ink-2 hover:text-ink",
                  )}
                >
                  {i.label}
                  <Badge n={badge(i)} />
                </Link>
              );
            })}
          </nav>
          <MoreMenu items={more} badge={badge} />
        </div>
        <div className="ml-auto flex flex-none items-center gap-2 lg:ml-0">
          <button
            type="button"
            onClick={() => setSearch(true)}
            aria-label="Rechercher"
            className={cn(roundBtn, "lg:hidden")}
          >
            <Icon name="search" />
          </button>
          <span className="hidden md:block">
            <ScopePicker />
          </span>
          <span className="flex h-10 w-10 items-center justify-center rounded-full border border-line bg-paper text-ink shadow-soft">
            <Bell notices={notices} unreadCount={unreadCount} />
          </span>
          <AccountMenu />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Rail d'actions rapides, façon Murmura. */}
        <aside className="hidden flex-none flex-col items-center gap-1 self-start rounded-full bg-night px-[6px] py-3 lg:ml-5 lg:flex">
          <button
            type="button"
            onClick={() => setSearch(true)}
            title="Rechercher (Ctrl K)"
            aria-label="Rechercher"
            className={railBtn}
          >
            <Icon name="search" />
          </button>
          <Link
            href="/contenu"
            title="Nouveau contenu"
            aria-label="Nouveau contenu"
            className="my-1 flex h-11 w-11 items-center justify-center rounded-full bg-accent text-accent-ink no-underline hover:no-underline hover:brightness-105"
          >
            <Icon name="plus" strokeWidth={2.2} />
          </Link>
          <Link href="/jarvis" title="Jarvis — assistant IA" aria-label="Jarvis" className={cn(railBtn, "text-accent")}>
            <Icon name="sparkles" />
          </Link>
          <Link
            href="/a-publier"
            title="À publier"
            aria-label="À publier"
            className={cn(railBtn, "relative")}
          >
            <Icon name="clock" />
            {counts.publier ? (
              <span className="absolute top-[9px] right-[9px] h-2 w-2 rounded-full bg-alert ring-2 ring-night" />
            ) : null}
          </Link>
          <Link
            href="/clients"
            title="Clients"
            aria-label="Clients"
            className={railBtn}
          >
            <Icon name="users" />
          </Link>
          <Link
            href="/ads"
            title="Campagnes"
            aria-label="Campagnes"
            className={railBtn}
          >
            <Icon name="megaphone" />
          </Link>
          <Link
            href="/assets"
            title="Bibliothèque"
            aria-label="Bibliothèque"
            className={railBtn}
          >
            <Icon name="image" />
          </Link>
          <span className="my-1 h-px w-6 bg-night-line" />
          <Link
            href="/terrain"
            title="Terrain (téléphone)"
            aria-label="Terrain"
            className={railBtn}
          >
            <Icon name="phone" />
          </Link>
          <Link
            href="/compte"
            title="Mon compte"
            aria-label="Mon compte"
            className={railBtn}
          >
            <Icon name="settings" />
          </Link>
          <span className="my-1 h-px w-6 bg-night-line" />
          <ThemeButton className={railBtn} />
        </aside>

        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-auto overflow-y-hidden">
          {children}
        </main>
      </div>

      <MobileDrawer counts={counts} />
      {search ? <CommandPalette onClose={() => setSearch(false)} /> : null}
    </div>
  );
}
