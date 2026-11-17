"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { choisirClient } from "@/app/(agence)/scope-actions";
import { NAV_CONTACTS, NAV_MAIN, NAV_MORE, ROUTES_FILTRABLES, type NavItem } from "@/data/nav";
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

/** Une entrée de menu est allumée sur son adresse et sur celles qu'elle couvre. */
function itemActive(pathname: string, i: NavItem) {
  return isActive(pathname, i.href) || (i.match ?? []).some((m) => isActive(pathname, m));
}

/** Le sélecteur de client n'apparaît que là où il change quelque chose. */
function filtrable(pathname: string) {
  return ROUTES_FILTRABLES.includes(pathname);
}

/** Regroupe les entrées par section, dans l'ordre où elles apparaissent. */
function parGroupe(items: NavItem[]) {
  const groupes: { titre: string; items: NavItem[] }[] = [];
  for (const i of items) {
    const titre = i.group ?? "";
    const g = groupes.find((x) => x.titre === titre);
    if (g) g.items.push(i);
    else groupes.push({ titre, items: [i] });
  }
  return groupes;
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
  // L'accueil du pôle web est son tableau de projets : « / » y renverrait de
  // toute façon, après un détour.
  const { user } = useApp();
  return (
    <Link
      href={user.pole === "web" ? "/web" : "/"}
      aria-label="Accueil"
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
  // Sur la page même d'une entrée de la barre principale (Contacts sur
  // /clients…), « Plus » ne s'allume pas en même temps.
  const active = items.some((i) => itemActive(pathname, i));
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
            ? "bg-ink text-paper"
            : "bg-transparent text-ink-2 hover:text-ink",
        )}
      >
        Plus <Badge n={total} /> <Icon name="chevronDown" size={15} />
      </button>
      {open ? (
        <div className="absolute top-[calc(100%+10px)] right-0 z-50 flex max-h-[calc(100dvh-110px)] w-[600px] max-w-[calc(100vw-32px)] flex-col gap-2 overflow-auto rounded-card border border-line bg-paper p-2 shadow-soft">
          {parGroupe(items).map((g) => (
            <div key={g.titre} className="flex flex-col">
              {g.titre ? <span className="eyebrow px-3 pt-2 pb-1 text-ink-3">{g.titre}</span> : null}
              <div className="grid grid-cols-2 gap-1">
          {g.items.map((i) => (
            <Link
              key={i.href}
              href={i.href}
              onClick={() => setOpen(false)}
              className={cn(
                "flex items-start gap-3 rounded-[14px] px-3 py-[8px] text-ink no-underline hover:bg-mute hover:no-underline",
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
                  <span className="text-small leading-snug text-ink-3">{i.hint}</span>
                ) : null}
              </span>
            </Link>
          ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ScopePicker({ large = false }: { large?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const params = useSearchParams();
  const { scope, setScope, clients } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  // Le choix est mémorisé côté serveur (cookie) : chaque écran ne montre plus
  // que ce client. Un ?client= dans l'adresse est remplacé par le nouveau choix.
  const affiché = scope;

  function choisir(client: { id: string; name: string } | null) {
    setScope(client?.name ?? ALL_CLIENTS);
    setOpen(false);
    void choisirClient(client?.id ?? null).then(() => {
      if (params.has("client")) {
        const q = new URLSearchParams(params.toString());
        q.delete("client");
        const qs = q.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname);
      }
      router.refresh();
    });
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Filtrer par client"
        title="Filtrer cet écran sur un client"
        className={cn(
          "flex h-10 cursor-pointer items-center gap-2 rounded-full border border-line bg-paper py-1 pr-3 pl-1 text-base font-medium text-ink shadow-soft hover:border-line-strong",
          large ? "h-11 w-full" : "max-w-[220px]",
        )}
      >
        <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-night text-white">
          <Icon name="layers" size={15} />
        </span>
        <span className="clip flex-1 text-left">{affiché}</span>
        <Icon name="chevronDown" size={15} className="flex-none text-ink-3" />
      </button>
      {open ? (
        <div className={cn("absolute top-[calc(100%+8px)] z-50 max-h-[380px] w-[280px] max-w-[calc(100vw-32px)] overflow-auto rounded-card border border-line bg-paper p-2 shadow-soft", large ? "left-0" : "right-0")}>
          <button
            type="button"
            onClick={() => choisir(null)}
            className={cn(
              "w-full cursor-pointer rounded-[12px] border-none px-3 py-2 text-left text-base font-semibold",
              affiché === ALL_CLIENTS
                ? "bg-ink text-paper"
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
  const { clients, user } = useApp();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const items = useMemo(() => {
    const allowed = (i: NavItem) =>
      !i.directionOnly || user.role === "direction";
    const web = user.pole === "web";
    const pages = (
      web
        ? [...NAV_WEB_MAIN, ...NAV_WEB_MORE, ...NAV_CONTACTS.filter((i) => i.href !== "/contacts" && !i.pole)]
        : [...NAV_MAIN, ...NAV_MORE, ...NAV_CONTACTS.filter((i) => i.href !== "/contacts")]
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
      // Créer un contenu est un geste du pôle social : côté web, l'adresse
      // renverrait au tableau des projets sans rien créer.
      ...(web
        ? []
        : [
            {
              key: "a-new",
              label: "Nouveau contenu",
              sub: "Créer un contenu",
              icon: "plus" as const,
              go: () => router.push("/contenu"),
            },
          ]),
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
      go: () => router.push(`/contacts/${c.id}`),
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
  }, [q, clients, user, router]);

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
        "flex min-h-11 items-center gap-3 rounded-[14px] px-3 py-[10px] text-lead text-ink no-underline hover:no-underline",
        itemActive(pathname, i) ? "bg-ink text-paper" : "hover:bg-mute",
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
        {/* Le filtre client n'a pas de place dans l'en-tête d'un téléphone :
            il vit ici, sur les écrans où il agit. */}
        {filtrable(pathname) ? <ScopePicker large /> : null}
        <nav className="flex flex-col gap-1">{main.map(row)}</nav>
        {parGroupe(more).map((g) => (
          <nav key={g.titre} className="flex flex-col gap-1 border-t border-line pt-2">
            {g.titre ? <span className="eyebrow px-3 pb-1 text-ink-3">{g.titre}</span> : null}
            {g.items.map(row)}
          </nav>
        ))}
        <div className="mt-auto pt-2">
          <ThemeChoices />
        </div>
      </div>
    </div>
  );
}

/**
 * La barre du bas, sur téléphone : les quatre destinations du quotidien et le
 * menu complet, à portée de pouce. Elle ne flotte pas sur le contenu : c'est
 * la dernière ligne de la coquille, sous la colonne qui défile.
 */
function BottomBar({ counts }: { counts: ShellCounts }) {
  const pathname = usePathname();
  const { user, setNavOpen } = useApp();
  const { main, badge } = useMenus(counts);
  const garder = user.pole === "web" ? ["/web", "/web/briefs", "/contacts", "/devis"] : ["/", "/contacts", "/calendrier", "/approbations"];
  const items = garder.map((h) => main.find((i) => i.href === h)).filter((i): i is NavItem => Boolean(i));
  return (
    <nav
      aria-label="Navigation principale"
      className="flex flex-none items-stretch justify-around border-t border-line bg-paper px-1 pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      {items.map((i) => {
        const actif = itemActive(pathname, i) && !(i.href === "/web" && pathname.startsWith("/web/briefs"));
        return (
          <Link
            key={i.href}
            href={i.href}
            aria-current={actif ? "page" : undefined}
            className={cn(
              "relative flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-[2px] text-micro font-medium no-underline hover:no-underline",
              actif ? "text-ink" : "text-ink-3",
            )}
          >
            <span className={cn("flex h-7 w-12 items-center justify-center rounded-full", actif && "bg-ink text-paper")}>
              <Icon name={i.icon ?? "grid"} size={18} />
            </span>
            <span className="clip max-w-full px-1">{i.label}</span>
            {badge(i) ? (
              <span className="absolute top-1 left-[calc(50%+8px)]">
                <Badge n={badge(i)} />
              </span>
            ) : null}
          </Link>
        );
      })}
      <button
        type="button"
        onClick={() => setNavOpen(true)}
        className="flex min-h-14 min-w-0 flex-1 cursor-pointer flex-col items-center justify-center gap-[2px] border-none bg-transparent text-micro font-medium text-ink-3"
      >
        <span className="flex h-7 w-12 items-center justify-center rounded-full">
          <Icon name="menu" size={18} />
        </span>
        Menu
      </button>
    </nav>
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
  const { setNavOpen, user } = useApp();
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
              const active = itemActive(pathname, i);
              return (
                <Link
                  key={i.href}
                  href={i.href}
                  className={cn(
                    "flex flex-none items-center gap-2 rounded-full px-[9px] py-[9px] text-base font-medium no-underline hover:no-underline 2xl:px-4",
                    active
                      ? "bg-ink text-paper"
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
          {filtrable(pathname) ? (
            <span className="hidden lg:block">
              <ScopePicker />
            </span>
          ) : null}
          <span className="flex h-10 w-10 items-center justify-center rounded-full border border-line bg-paper text-ink shadow-soft">
            <Bell notices={notices} unreadCount={unreadCount} />
          </span>
          <AccountMenu />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Rail d'actions rapides : des gestes, pas une seconde navigation.
            Il ne répète pas la barre du haut, et ne montre que ce que le pôle
            affiché peut faire (côté web, « Nouveau contenu » ou « À publier »
            renverraient au tableau des projets sans rien faire). */}
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
          {user.pole !== "web" ? (
            <Link
              href="/contenu"
              title="Nouveau contenu"
              aria-label="Nouveau contenu"
              className="my-1 flex h-11 w-11 items-center justify-center rounded-full bg-accent text-accent-ink no-underline hover:no-underline hover:brightness-105"
            >
              <Icon name="plus" strokeWidth={2.2} />
            </Link>
          ) : null}
          <Link href="/jarvis" title="Jarvis — assistant IA" aria-label="Jarvis" className={cn(railBtn, "text-accent")}>
            <Icon name="sparkles" />
          </Link>
          {user.pole !== "web" ? (
            <>
              <Link
                href="/a-publier"
                title="À publier"
                aria-label="À publier"
                className={cn(railBtn, "relative")}
              >
                <Icon name="send" />
                {counts.publier ? (
                  <span className="absolute top-[9px] right-[9px] h-2 w-2 rounded-full bg-alert ring-2 ring-night" />
                ) : null}
              </Link>
              <Link
                href="/terrain"
                title="Terrain (téléphone)"
                aria-label="Terrain"
                className={railBtn}
              >
                <Icon name="phone" />
              </Link>
            </>
          ) : null}
          <span className="my-1 h-px w-6 bg-night-line" />
          <ThemeButton className={railBtn} />
        </aside>

        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-auto overflow-y-hidden">
          {children}
        </main>
      </div>

      <BottomBar counts={counts} />
      <MobileDrawer counts={counts} />
      {search ? <CommandPalette onClose={() => setSearch(false)} /> : null}
    </div>
  );
}
