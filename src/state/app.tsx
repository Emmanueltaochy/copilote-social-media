"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { PACED_CLIENTS, type PacedClient } from "@/data/clients";

export const ALL_CLIENTS = "Tous les clients";

type AppState = {
  /** Client filter shared by every screen. Full name, or ALL_CLIENTS. */
  scope: string;
  setScope: (scope: string) => void;
  /** Short name of the scoped client, or null when viewing everything. */
  scopedShort: string | null;
  /** True when a row belongs to the current scope. Rows carry short names. */
  inScope: (shortName: string) => boolean;
  portalOpen: boolean;
  setPortalOpen: (open: boolean) => void;
};

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [scope, setScope] = useState<string>(ALL_CLIENTS);
  const [portalOpen, setPortalOpen] = useState(false);

  const value = useMemo<AppState>(() => {
    const scoped: PacedClient | undefined =
      scope === ALL_CLIENTS ? undefined : PACED_CLIENTS.find((c) => c.name === scope);
    const scopedShort = scoped?.short ?? null;
    return {
      scope,
      setScope,
      scopedShort,
      inScope: (shortName: string) => scopedShort === null || scopedShort === shortName,
      portalOpen,
      setPortalOpen,
    };
  }, [scope, portalOpen]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApp must be used inside <AppProvider>");
  return ctx;
}
