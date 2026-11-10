"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { choisirClient } from "@/app/(agence)/scope-actions";
import { useApp } from "@/state/app";

/**
 * Rappel discret du filtre client en cours, avec de quoi revenir à tous les
 * clients. Ne s'affiche que si un client est filtré.
 */
export function ScopeNotice({ name, className }: { name: string | null | undefined; className?: string }) {
  const router = useRouter();
  const { setScope } = useApp();
  const [pending, start] = useTransition();
  if (!name) return null;
  return (
    <span className={`inline-flex flex-wrap items-center gap-2 text-small text-ink-3 ${className ?? ""}`}>
      <span className="h-2 w-2 rounded-full bg-accent" />
      Filtré sur <b className="font-semibold text-ink">{name}</b>
      <span aria-hidden>·</span>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            await choisirClient(null);
            setScope("Tous les clients");
            const url = new URL(window.location.href);
            if (url.searchParams.has("client")) {
              url.searchParams.delete("client");
              router.replace(url.pathname + (url.search ? url.search : ""));
            }
            router.refresh();
          })
        }
        className="cursor-pointer border-none bg-transparent p-0 text-small font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink disabled:opacity-50"
      >
        Voir tous les clients
      </button>
    </span>
  );
}
