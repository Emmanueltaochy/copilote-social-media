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
    <header className="flex flex-none flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line bg-paper px-4 py-[10px] lg:flex-nowrap lg:px-5">
      <div className="flex min-w-0 flex-col gap-px">
        <h1 className="text-title font-semibold">{title}</h1>
        <span className="text-small text-ink-3 tabular-nums">{sub}</span>
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
        "flex flex-none items-center justify-between gap-4 border-b border-line bg-paper px-4 py-2 lg:px-5",
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
      className={cn("min-h-0 flex-1 overflow-auto px-4 pt-4 pb-6 lg:px-5", className)}
      style={minWidth ? { minWidth } : undefined}
    >
      {children}
    </div>
  );
}
