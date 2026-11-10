import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Every screen opens the same way: what am I looking at, when, and the one
 * action this screen is for.
 */
export function PageHeader({
  title,
  sub,
  children,
}: {
  title: string;
  sub: string;
  children?: ReactNode;
}) {
  return (
    // Sur mobile l'action passe sous le titre plutôt que de le comprimer :
    // « Pipeline de production » réduit à une colonne de deux lettres n'aide
    // personne à savoir où il est.
    <header className="flex flex-none flex-wrap items-end justify-between gap-x-4 gap-y-3 px-4 pt-2 pb-4 lg:flex-nowrap lg:px-7">
      <div className="flex min-w-0 flex-col gap-px">
        <h1 className="text-[26px] leading-tight font-bold tracking-[-0.02em] lg:text-display">{title}</h1>
        <span className="text-base text-ink-3 tabular-nums">{sub}</span>
      </div>
      {/* Aucun bouton décoratif : une action affichée doit faire quelque chose. */}
      {children ? <div className="flex flex-none items-center gap-2">{children}</div> : null}
    </header>
  );
}

/** Secondary bar under the header: filters, tabs, freshness. */
export function Toolbar({
  children,
  right,
  minWidth,
  className,
}: {
  children: ReactNode;
  right?: ReactNode;
  minWidth?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mx-4 mb-3 flex flex-none items-center justify-between gap-4 rounded-full border border-line bg-paper px-3 py-2 shadow-soft lg:mx-7",
        className,
      )}
      style={minWidth ? { minWidth } : undefined}
    >
      <div className="flex min-w-0 items-center gap-2 overflow-x-auto">{children}</div>
      {right}
    </div>
  );
}

/** The scrolling body of a screen. */
export function ScrollArea({
  children,
  className,
  minWidth,
}: {
  children: ReactNode;
  className?: string;
  minWidth?: number;
}) {
  return (
    <div
      className={cn("min-h-0 flex-1 overflow-auto px-4 pt-1 pb-8 lg:px-7", className)}
      style={minWidth ? { minWidth } : undefined}
    >
      {children}
    </div>
  );
}
