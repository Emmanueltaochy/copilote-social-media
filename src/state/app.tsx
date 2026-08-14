"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { Tone } from "@/lib/tone";

export const ALL_CLIENTS = "Tous les clients";

/** Ce que la coquille a besoin de savoir d'un client, rien de plus. */
export type ScopeClient = {
  id: string;
  name: string;
  shortName: string;
  done: number;
  target: number;
  tone: Tone;
};

export type SessionUser = {
  name: string;
  role: "direction" | "equipe" | "client";
  initials: string;
  /** Adresse de sa photo de profil, ou null : les initiales prennent le relais. */
  avatar: string | null;
  /** Les pôles auxquels la personne a accès : « social », « web », ou les deux. */
  departments: ("social" | "web")[];
  /** Le pôle affiché en ce moment. */
  pole: "social" | "web";
};

type AppState = {
  user: SessionUser;
  clients: ScopeClient[];
  /** Filtre client partagé par tous les écrans. Nom complet, ou ALL_CLIENTS. */
  scope: string;
  setScope: (scope: string) => void;
  scopedShort: string | null;
  scopedId: string | null;
  inScope: (shortName: string) => boolean;
  portalOpen: boolean;
  setPortalOpen: (open: boolean) => void;
  /** Tiroir de navigation, sur mobile seulement. */
  navOpen: boolean;
  setNavOpen: (open: boolean) => void;
};

const Ctx = createContext<AppState | null>(null);

export function AppProvider({
  children,
  user,
  clients,
}: {
  children: ReactNode;
  user: SessionUser;
  clients: ScopeClient[];
}) {
  const [scope, setScope] = useState<string>(ALL_CLIENTS);
  const [portalOpen, setPortalOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);

  const value = useMemo<AppState>(() => {
    const scoped = scope === ALL_CLIENTS ? undefined : clients.find((c) => c.name === scope);
    const scopedShort = scoped?.shortName ?? null;
    return {
      user,
      clients,
      scope,
      setScope,
      scopedShort,
      scopedId: scoped?.id ?? null,
      inScope: (shortName: string) => scopedShort === null || scopedShort === shortName,
      portalOpen,
      setPortalOpen,
      navOpen,
      setNavOpen,
    };
  }, [scope, portalOpen, navOpen, user, clients]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApp doit être utilisé dans <AppProvider>");
  return ctx;
}
