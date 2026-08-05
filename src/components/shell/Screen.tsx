import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";

/**
 * Every screen opens the same way: what am I looking at, when, and the one
 * action this screen is for.
 */
export function PageHeader({
  title,
  sub,
  action,
  children,
}: {
  title: string;
  sub: string;
  action?: string;
  children?: ReactNode;
}) {
  return (
    <header className="flex flex-none items-center justify-between gap-4 border-b border-line bg-paper px-5 py-[10px]">
      <div className="flex min-w-0 flex-col gap-px">
        <h1 className="text-title font-semibold">{title}</h1>
        <span className="text-small text-ink-3 tabular-nums">{sub}</span>
      </div>
      <div className="flex flex-none items-center gap-2">
        {children}
        <Button className="px-[11px] py-[7px]">Exporter</Button>
        {action ? (
          <Button variant="primary" className="px-[11px] py-[7px]">
            {action}
          </Button>
        ) : null}
      </div>
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
        "flex flex-none items-center justify-between gap-4 border-b border-line bg-paper px-5 py-2",
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
      className={cn("min-h-0 flex-1 overflow-auto px-5 pt-4 pb-6", className)}
      style={minWidth ? { minWidth } : undefined}
    >
      {children}
    </div>
  );
}
