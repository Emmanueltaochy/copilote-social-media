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
    <header className="flex flex-none flex-wrap items-end justify-between gap-x-6 gap-y-3 px-4 pt-1 pb-5 lg:flex-nowrap lg:px-7">
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="text-[32px] leading-[1.05] font-bold tracking-[-0.03em] lg:text-[40px]">{title}</h1>
        <span className="text-base text-ink-3 tabular-nums">{sub}</span>
      </div>
      {/* Aucun bouton décoratif : une action affichée doit faire quelque chose. */}
      {children ? <div className="flex max-w-full flex-wrap items-center gap-2 lg:flex-none lg:flex-nowrap">{children}</div> : null}
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
